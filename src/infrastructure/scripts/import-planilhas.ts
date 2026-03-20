/**
 * import-planilhas.ts
 *
 * Importa os 3 arquivos Excel operacionais da Enlite AR.
 *
 * MAPEAMENTO DE FUNNEL_STAGE:
 *   Ana_Care_Control.xlsx   → QUALIFIED (workers ativos no AnaCare)
 *   CANDIDATOS / Talentum   → QUALIFIED (status=QUALIFIED) | TALENTUM (passou) | BLACKLIST
 *   NoTerminaronTalentum    → PRE_TALENTUM (leads que nunca terminaram o funil)
 *   NoUsarMás               → BLACKLIST
 *   Planilla_Operativa      → mantém o funnel_stage já existente do worker
 *
 * DEDUPLICAÇÃO:
 *   Arquivo  → SHA256 (não reprocessa o mesmo arquivo)
 *   Workers  → UPSERT por phone
 *   Cases    → UPSERT por case_number
 *   Encuadres → UPSERT por dedup_hash
 */

import * as XLSX from 'xlsx';
import { WorkerRepository } from '../repositories/WorkerRepository';
import { EncuadreRepository } from '../repositories/EncuadreRepository';
import {
  BlacklistRepository,
  PublicationRepository,
  ImportJobRepository,
  JobPostingARRepository,
  WorkerFunnelRepository,
} from '../repositories/OperationalRepositories';
import {
  hashEncuadre,
  hashPublication,
  parseExcelDate,
  normalizeResultado,
  normalizeBoolean,
  normalizePhone,
  cleanString,
} from './import-utils';
import { FunnelStage, WorkerOccupation } from '../../domain/entities/OperationalEntities';
import type { Encuadre } from '../../domain/entities/Encuadre';

export type SpreadsheetType = 'ana_care' | 'candidatos' | 'planilla_operativa';

export interface ImportProgress {
  sheet: string;
  totalRows: number;
  processedRows: number;
  workersCreated: number;
  workersUpdated: number;
  casesCreated: number;
  casesUpdated: number;
  encuadresCreated: number;
  encuadresSkipped: number;
  errors: Array<{ row: number; error: string }>;
}

export class PlanilhaImporter {
  private workerRepo = new WorkerRepository();
  private encuadreRepo = new EncuadreRepository();
  private blacklistRepo = new BlacklistRepository();
  private publicationRepo = new PublicationRepository();
  private jobPostingRepo = new JobPostingARRepository();
  private importJobRepo = new ImportJobRepository();
  private funnelRepo = new WorkerFunnelRepository();

  async importBuffer(
    buffer: Buffer,
    filename: string,
    importJobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress[]> {
    const workbook = XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const type = this.detectType(workbook, filename);
    const results: ImportProgress[] = [];

    await this.importJobRepo.updateStatus(importJobId, 'processing');

    try {
      if (type === 'ana_care') {
        results.push(await this.importAnaCare(workbook, onProgress));
      } else if (type === 'candidatos') {
        results.push(await this.importCandidatos(workbook, onProgress));
      } else if (type === 'planilla_operativa') {
        results.push(...await this.importPlanillaOperativa(workbook, onProgress));
      } else {
        throw new Error(`Tipo de planilha não reconhecido: ${filename}`);
      }

      // Linkar encuadres/blacklist ao worker_id pelo phone
      await this.encuadreRepo.linkWorkersByPhone();
      await this.blacklistRepo.linkWorkersByPhone();

      await this.importJobRepo.updateStatus(importJobId, 'done');
      await this.importJobRepo.updateProgress(importJobId, {
        workersCreated:   results.reduce((s, r) => s + r.workersCreated, 0),
        workersUpdated:   results.reduce((s, r) => s + r.workersUpdated, 0),
        casesCreated:     results.reduce((s, r) => s + r.casesCreated, 0),
        casesUpdated:     results.reduce((s, r) => s + r.casesUpdated, 0),
        encuadresCreated: results.reduce((s, r) => s + r.encuadresCreated, 0),
        encuadresSkipped: results.reduce((s, r) => s + r.encuadresSkipped, 0),
        errorDetails:     results.flatMap(r => r.errors),
      });
    } catch (err) {
      await this.importJobRepo.updateStatus(importJobId, 'error');
      throw err;
    }

    return results;
  }

  // ------------------------------------------------
  // Ana_Care_Control.xlsx → funnel_stage = QUALIFIED
  // Workers ativos do sistema AnaCare — já passaram por tudo
  // ------------------------------------------------
  private async importAnaCare(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('ana')) ?? wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });

    const progress = makeProgress(sheetName, rows.length);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      try {
        const phone = normalizePhone(cleanString(row['Teléfono'] ?? row['Telefono'] ?? row['TELEFONO']));
        const email = cleanString(row['Email'] ?? row['EMAIL'] ?? row['CORREO']);
        const nombre = cleanString(row['Nombre'] ?? row['NOMBRE'] ?? row['Nombre y Apellido']);

        if (!phone && !email) {
          progress.errors.push({ row: i + 2, error: 'Sem phone e sem email — ignorado' });
          continue;
        }

        const authUid = `anacareimport_${phone || email}`;
        const workerEmail = email ?? `${authUid}@enlite.import`;

        const { workerId, created } = await this.upsertWorker({
          authUid,
          phone: phone || undefined,
          email: workerEmail,
          anaCareId: cleanString(row['ID'] ?? row['id']),
          cuit: cleanString(row['Cédula'] ?? row['CUIT'] ?? row['cedula']),
          firstName: extractFirstName(nombre),
          lastName: extractLastName(nombre),
          birthDate: parseExcelDate(row['Fecha nacimiento'] ?? row['FECHA NACIMIENTO']),
          sex: cleanString(row['Género'] ?? row['GENERO']),
          occupation: normalizeOccupation(cleanString(row['Tipo'] ?? row['TIPO'])),
          // AnaCare = workers ativos = QUALIFIED
          funnelStage: 'QUALIFIED',
          country: 'AR',
        });

        if (created) progress.workersCreated++;
        else {
          // Mesmo que já exista, garante que o funnel_stage seja QUALIFIED
          await this.funnelRepo.updateFunnelStage(workerId, 'QUALIFIED');
          progress.workersUpdated++;
        }
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (onProgress && i % 50 === 0) onProgress({ ...progress });
    }

    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // CANDIDATOS.xlsx
  //   Talentum           → QUALIFIED ou TALENTUM (dependendo do status)
  //   NoTerminaronTalentum → PRE_TALENTUM (leads que abandonaram)
  //   NoUsarMás          → BLACKLIST
  // ------------------------------------------------
  private async importCandidatos(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const progress = makeProgress('Candidatos', 0);

    // --- Aba Talentum ---
    const talentumSheet = wb.Sheets['Talentum'];
    if (talentumSheet) {
      const rows = XLSX.utils.sheet_to_json(talentumSheet, { defval: null });
      progress.totalRows += rows.length;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as Record<string, unknown>;
        try {
          const phone = normalizePhone(cleanString(row['Teléfono'] ?? row['TELEFONO'] ?? row['telefono']));
          const cuit = cleanString(row['CUIT'] ?? row['cuit']);
          const nombre = cleanString(row['Nombre y Apellido'] ?? row['NOMBRE Y APELLIDO'] ?? row['nombre']);
          const statusRaw = cleanString(row['Status'] ?? row['STATUS'] ?? row['status']) ?? '';

          if (!phone && !cuit) {
            progress.errors.push({ row: i + 2, error: 'Sem phone nem CUIT — ignorado' });
            continue;
          }

          // Mapear status da planilha para funnel_stage
          const funnelStage = normalizeFunnelStageFromCandidatos(statusRaw);

          const authUid = `candidatoimport_${phone || cuit}`;
          const email = cleanString(row['Email'] ?? row['EMAIL']) ?? `${authUid}@enlite.import`;

          const { created } = await this.upsertWorker({
            authUid,
            phone: phone || undefined,
            email,
            cuit: cuit || undefined,
            firstName: extractFirstName(nombre),
            lastName: extractLastName(nombre),
            funnelStage,
            country: 'AR',
          });

          if (created) progress.workersCreated++;
          else progress.workersUpdated++;

        } catch (err) {
          progress.errors.push({ row: i + 2, error: (err as Error).message });
        }
        progress.processedRows++;
        if (onProgress && i % 100 === 0) onProgress({ ...progress });
      }
    }

    // --- Aba NoTerminaronTalentum → PRE_TALENTUM ---
    // São os leads que o CEO menciona: captados por publicação mas nunca terminaram
    const naoTerminaramSheet = wb.Sheets['NoTerminaronTalentum'] ?? wb.Sheets['NoTerminaronTalentun'];
    if (naoTerminaramSheet) {
      const rows = XLSX.utils.sheet_to_json(naoTerminaramSheet, { defval: null });
      progress.totalRows += rows.length;

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i] as Record<string, unknown>;
        try {
          const phone = normalizePhone(cleanString(row['Teléfono'] ?? row['TELEFONO'] ?? row['telefono']));
          const nombre = cleanString(row['Nombre y Apellido'] ?? row['NOMBRE Y APELLIDO'] ?? row['nombre']);

          if (!phone && !nombre) continue;

          const authUid = `pretalnimport_${phone || normalizeName(nombre)}`;
          const email = cleanString(row['Email'] ?? row['EMAIL']) ?? `${authUid}@enlite.import`;

          const { created } = await this.upsertWorker({
            authUid,
            phone: phone || undefined,
            email,
            firstName: extractFirstName(nombre),
            lastName: extractLastName(nombre),
            // Esses nunca terminaram → PRE_TALENTUM
            funnelStage: 'PRE_TALENTUM',
            country: 'AR',
          });

          if (created) progress.workersCreated++;
          else progress.workersUpdated++;
        } catch (err) {
          progress.errors.push({ row: i + 2, error: (err as Error).message });
        }
        progress.processedRows++;
      }
    }

    // --- Aba NoUsarMás → BLACKLIST ---
    const blacklistSheet = wb.Sheets['NoUsarMás'] ?? wb.Sheets['NoUsarMas'];
    if (blacklistSheet) {
      const rows = XLSX.utils.sheet_to_json(blacklistSheet, { defval: null });
      for (const row of rows as Record<string, unknown>[]) {
        try {
          const phone = normalizePhone(cleanString(row['Teléfono'] ?? row['TELEFONO']));
          const nombre = cleanString(row['Nombre y Apellido'] ?? row['NOMBRE']);
          const motivo = cleanString(row['Motivo'] ?? row['MOTIVO'] ?? row['Reason']);
          if (!motivo) continue;

          await this.blacklistRepo.upsert({
            workerRawPhone: phone || null,
            workerRawName: nombre,
            reason: motivo,
            detail: cleanString(row['Detalle'] ?? row['DETALLE'] ?? row['Respuesta']),
          });
        } catch { /* ignora erros de blacklist */ }
      }
    }

    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // Planilla_Operativa_Encuadre.xlsx
  // ------------------------------------------------
  private async importPlanillaOperativa(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress[]> {
    return [
      await this.importIndice(wb, onProgress),
      await this.importBase1(wb, onProgress),
      await this.importBlackListSheet(wb, onProgress),
      await this.importPublicaciones(wb, onProgress),
    ];
  }

  private async importIndice(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Índice'] ?? wb.Sheets['_Indice'] ?? wb.Sheets['Índice'];
    const progress = makeProgress('_Índice', 0);
    if (!sheet) return progress;

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    progress.totalRows = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      try {
        const caseNumber = parseInt(String(row['CASO'] ?? row['Caso'] ?? '').trim());
        if (isNaN(caseNumber)) continue;

        const { created } = await this.jobPostingRepo.upsertByCaseNumber({
          caseNumber,
          patientName: cleanString(row['PACIENTE'] ?? row['Paciente']),
          status: normalizeJobStatus(cleanString(row['ESTADO'] ?? row['Estado'])),
          dependency: normalizeDependency(cleanString(row['DEPENDENCIA'] ?? row['Dependencia'])),
          priority: normalizePriority(cleanString(row['PRIORIDAD'] ?? row['Prioridad'])),
          isCovered: normalizeBoolean(row['Está acompañada?'] ?? row['ESTA ACOMPAÑADA']) ?? false,
          coordinatorName: cleanString(row['COORDINADOR'] ?? row['Coordinador']),
          country: 'AR',
        });

        if (created) progress.casesCreated++;
        else progress.casesUpdated++;
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
    }

    onProgress?.(progress);
    return progress;
  }

  private async importBase1(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Base1'] ?? wb.Sheets['Base1'];
    const progress = makeProgress('_Base1', 0);
    if (!sheet) return progress;

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    progress.totalRows = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      try {
        const caseNumber = parseInt(String(row['CASO'] ?? row['Caso'] ?? '').trim());
        const workerPhone = normalizePhone(cleanString(row['TELEFONO'] ?? row['Teléfono']));
        const workerName = cleanString(row['NOMBRE Y APELLIDO'] ?? row['Nombre y Apellido']);
        const recruitmentDate = parseExcelDate(row['FECHA RECLUTAMIENTO']);
        const interviewDate = parseExcelDate(row['FECHA ENCUADRE']);
        const interviewTime = cleanString(row['HORA ENCUADRE']);

        const dedupHash = hashEncuadre({
          caseNumber: isNaN(caseNumber) ? null : caseNumber,
          workerPhone,
          workerName,
          interviewDate: interviewDate?.toISOString().split('T')[0] ?? null,
          interviewTime,
          recruitmentDate: recruitmentDate?.toISOString().split('T')[0] ?? null,
        });

        let jobPostingId: string | null = null;
        if (!isNaN(caseNumber)) {
          const jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
          if (!jp) {
            const c = await this.jobPostingRepo.upsertByCaseNumber({
              caseNumber,
              patientName: cleanString(row['PACIENTE'] ?? null),
              country: 'AR',
            });
            jobPostingId = c.id;
            if (c.created) progress.casesCreated++;
          } else {
            jobPostingId = jp.id;
          }
        }

        const { created } = await this.encuadreRepo.upsert({
          jobPostingId,
          workerRawName: workerName,
          workerRawPhone: workerPhone || null,
          occupationRaw: cleanString(row['OCUPACION']),
          recruiterName: cleanString(row['RECLUTADOR']),
          coordinatorName: cleanString(row['COORDINADOR ASIGNADO']),
          recruitmentDate,
          interviewDate,
          interviewTime,
          meetLink: cleanString(row['ID ENCUADRE MEET']),
          attended: normalizeBoolean(row['PRESENTE']),
          absenceReason: cleanString(row['MOTIVO AUSENCIA']),
          acceptsCase: normalizeAcceptsCase(cleanString(row['ACEPTA CASO'])),
          rejectionReason: cleanString(row['MOTIVO RECHAZO']),
          resultado: normalizeResultado(cleanString(row['RESULTADO'])) as Encuadre['resultado'],
          redireccionamiento: cleanString(row['REDIRECCIONAMIENTO']),
          hasCv: normalizeBoolean(row['CV']),
          hasDni: normalizeBoolean(row['DNI']),
          hasCertAt: normalizeBoolean(row['CERT AT']),
          hasAfip: normalizeBoolean(row['AFIP']),
          hasCbu: normalizeBoolean(row['CBU']),
          hasAp: normalizeBoolean(row['AP']),
          hasSeguros: normalizeBoolean(row['SEG']),
          workerEmail: cleanString(row['CORREO'] ?? row['correo']),
          obsReclutamiento: cleanString(row['Obs. RECLUTAMIENTO']),
          obsEncuadre: cleanString(row['Obs. ENCUADRE']),
          obsAdicionales: cleanString(row['Obs. Adicionales']),
          dedupHash,
        });

        if (created) progress.encuadresCreated++;
        else progress.encuadresSkipped++;

      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }

      progress.processedRows++;
      if (onProgress && i % 500 === 0) onProgress({ ...progress });
    }

    onProgress?.(progress);
    return progress;
  }

  private async importBlackListSheet(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_BlackList'] ?? wb.Sheets['BlackList'] ?? wb.Sheets['_Blacklist'];
    const progress = makeProgress('_BlackList', 0);
    if (!sheet) return progress;

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    progress.totalRows = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      try {
        const phone = normalizePhone(cleanString(row['TELEFONO'] ?? row['Teléfono']));
        const nombre = cleanString(row['NOMBRE Y APELLIDO'] ?? row['Nombre y Apellido']);
        const motivo = cleanString(row['MOTIVO'] ?? row['Motivo'] ?? row['RAZÓN']);
        if (!motivo) continue;

        await this.blacklistRepo.upsert({
          workerRawPhone: phone || null,
          workerRawName: nombre,
          reason: motivo,
          detail: cleanString(row['DETALLE'] ?? row['Detalle']),
          registeredBy: cleanString(row['QUIEN REGISTRÓ'] ?? row['quien_registro']),
          canTakeEventual: normalizeBoolean(row['puede tomar eventual'] ?? row['PUEDE EVENTUAL']) ?? false,
        });
        progress.workersCreated++;
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
    }

    onProgress?.(progress);
    return progress;
  }

  private async importPublicaciones(
    wb: XLSX.WorkBook,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Publicaciones'] ?? wb.Sheets['Publicaciones'];
    const progress = makeProgress('_Publicaciones', 0);
    if (!sheet) return progress;

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null });
    progress.totalRows = rows.length;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i] as Record<string, unknown>;
      try {
        const caseNumber = parseInt(String(row['CASO'] ?? row['Caso'] ?? '').trim());
        const channel = cleanString(row['CANAL'] ?? row['Canal']);
        const groupName = cleanString(row['GRUPO'] ?? row['Grupo']);
        const recruiter = cleanString(row['RECLUTADOR'] ?? row['Reclutador']);
        const publishedAt = parseExcelDate(row['FECHA'] ?? row['Fecha']);

        const dedupHash = hashPublication({
          caseNumber: isNaN(caseNumber) ? null : caseNumber,
          channel,
          groupName,
          publishedAt: publishedAt?.toISOString() ?? null,
          recruiterName: recruiter,
        });

        let jobPostingId: string | null = null;
        if (!isNaN(caseNumber)) {
          const jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
          jobPostingId = jp?.id ?? null;
        }

        const { created } = await this.publicationRepo.upsert({
          jobPostingId,
          channel,
          groupName,
          recruiterName: recruiter,
          publishedAt,
          observations: cleanString(row['OBSERVACIONES'] ?? row['obs']),
          dedupHash,
        });

        if (created) progress.encuadresCreated++;
        else progress.encuadresSkipped++;

      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
    }

    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  private detectType(wb: XLSX.WorkBook, filename: string): SpreadsheetType {
    const fn = filename.toLowerCase();
    if (fn.includes('ana_care') || fn.includes('anacare')) return 'ana_care';
    if (fn.includes('candidatos')) return 'candidatos';
    if (fn.includes('planilla') || fn.includes('operativa') || fn.includes('encuadre')) return 'planilla_operativa';

    const sheetNames = wb.SheetNames.map(n => n.toLowerCase());
    if (sheetNames.some(n => n.includes('_base1') || n.includes('base1'))) return 'planilla_operativa';
    if (sheetNames.some(n => n.includes('talentum'))) return 'candidatos';
    if (sheetNames.some(n => n.includes('ana care') || n.includes('anacare'))) return 'ana_care';

    throw new Error(`Tipo de planilha não reconhecido: ${filename}`);
  }

  private async upsertWorker(data: {
    authUid: string; phone?: string; email: string;
    anaCareId?: string | null; cuit?: string | null;
    firstName?: string | null; lastName?: string | null;
    birthDate?: Date | null; sex?: string | null;
    occupation?: string | null; funnelStage?: FunnelStage;
    country?: string;
  }): Promise<{ workerId: string; created: boolean }> {
    if (data.phone) {
      const existing = await this.workerRepo.findByPhone(data.phone);
      if (existing.isSuccess && existing.getValue()) {
        const worker = existing.getValue()!;
        await this.workerRepo.updateFromImport(worker.id, data);
        return { workerId: worker.id, created: false };
      }
    }

    const existingByEmail = await this.workerRepo.findByEmail(data.email);
    if (existingByEmail.isSuccess && existingByEmail.getValue()) {
      const worker = existingByEmail.getValue()!;
      await this.workerRepo.updateFromImport(worker.id, data);
      return { workerId: worker.id, created: false };
    }

    const result = await this.workerRepo.create({
      authUid: data.authUid,
      email: data.email,
      phone: data.phone,
      country: data.country ?? 'AR',
    });

    if (result.isFailure) throw new Error(`Falha ao criar worker: ${result.error}`);

    const workerId = result.getValue().id;

    // Aplica occupation e funnel_stage após criar
    if (data.occupation) {
      await this.funnelRepo.updateOccupation(workerId, data.occupation as WorkerOccupation);
    }
    if (data.funnelStage) {
      await this.funnelRepo.updateFunnelStage(workerId, data.funnelStage);
    }

    return { workerId, created: true };
  }
}

// ------------------------------------------------
// Funções auxiliares
// ------------------------------------------------
function makeProgress(sheet: string, totalRows: number): ImportProgress {
  return {
    sheet, totalRows, processedRows: 0,
    workersCreated: 0, workersUpdated: 0,
    casesCreated: 0, casesUpdated: 0,
    encuadresCreated: 0, encuadresSkipped: 0,
    errors: [],
  };
}

function extractFirstName(fullName: string | null): string | null {
  if (!fullName) return null;
  return fullName.trim().split(/\s+/)[0] ?? null;
}

function extractLastName(fullName: string | null): string | null {
  if (!fullName) return null;
  const parts = fullName.trim().split(/\s+/);
  return parts.length > 1 ? parts.slice(1).join(' ') : null;
}

function normalizeName(name: string | null): string {
  if (!name) return '';
  return name.toLowerCase().trim().normalize('NFD').replace(/[\u0300-\u036f]/g, '');
}

function normalizeOccupation(raw: string | null): WorkerOccupation | null {
  if (!raw) return null;
  const s = raw.toUpperCase().trim();
  if (s.includes('AT') && s.includes('CUIDADOR')) return 'AMBOS';
  if (s.includes('AT')) return 'AT';
  if (s.includes('CUIDADOR')) return 'CUIDADOR';
  return null;
}

// Mapeia status da aba Talentum para funnel_stage
function normalizeFunnelStageFromCandidatos(statusRaw: string): FunnelStage {
  const s = statusRaw.toUpperCase().trim();
  if (s.includes('BLACKLIST')) return 'BLACKLIST';
  if (s.includes('QUALIFIED')) return 'QUALIFIED';
  if (s.includes('TALENTUM') || s.includes('COMPLETED')) return 'TALENTUM';
  return 'TALENTUM'; // Padrão para quem está na aba Talentum
}

function normalizeJobStatus(raw: string | null): string {
  if (!raw) return 'active';
  const s = raw.toUpperCase().trim();
  if (s.includes('SUSPENDIDO') || s.includes('SUSPENDIDA')) return 'paused';
  if (s.includes('CERRADO') || s.includes('CERRADA')) return 'closed';
  if (s.includes('CUBIERTO') || s.includes('CUBIERTA')) return 'filled';
  return 'active';
}

function normalizeDependency(raw: string | null): 'GRAVE' | 'MUY_GRAVE' | null {
  if (!raw) return null;
  const s = raw.toUpperCase().trim();
  if (s.includes('MUY GRAVE') || s.includes('MUY_GRAVE')) return 'MUY_GRAVE';
  if (s.includes('GRAVE')) return 'GRAVE';
  return null;
}

function normalizePriority(raw: string | null): 'URGENTE' | 'NORMAL' | null {
  if (!raw) return null;
  return raw.toUpperCase().trim().includes('URGENTE') ? 'URGENTE' : 'NORMAL';
}

function normalizeAcceptsCase(raw: string | null): 'Si' | 'No' | 'A confirmar' | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (['si', 'sí', 's', 'yes'].includes(s)) return 'Si';
  if (['no', 'n'].includes(s)) return 'No';
  if (s.includes('confirmar')) return 'A confirmar';
  return null;
}
