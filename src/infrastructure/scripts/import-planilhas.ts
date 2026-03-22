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
  WorkerApplicationRepository,
  WorkerLocationRepository,
} from '../repositories/OperationalRepositories';
import {
  hashEncuadre,
  hashPublication,
  parseExcelDate,
  normalizeResultado,
  normalizeBoolean,
  normalizePhoneAR,
  cleanString,
  normalizeEmail,
  normalizeProperName,
  generateSecureAuthUid,
  classifyProfession,
} from './import-utils';
import { FunnelStage, WorkerOccupation } from '../../domain/entities/OperationalEntities';
import type { Encuadre } from '../../domain/entities/Encuadre';
import { WorkerDeduplicationService } from '../services/WorkerDeduplicationService';

export type SpreadsheetType = 'ana_care' | 'candidatos' | 'planilla_operativa' | 'talent_search';

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

// ------------------------------------------------
// Helpers para resolver colunas com nomes variantes
// ------------------------------------------------

/** Tenta múltiplos nomes de coluna, retorna o primeiro valor não-null/undefined */
function col(row: Record<string, unknown>, ...keys: string[]): unknown {
  for (const k of keys) {
    if (row[k] !== undefined && row[k] !== null) return row[k];
  }
  return null;
}

/** Normaliza headers do sheet removendo newlines e espaços extras */
function normalizedRows(sheet: XLSX.WorkSheet): Record<string, unknown>[] {
  const raw = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
  return raw.map(row => {
    const clean: Record<string, unknown> = {};
    for (const [key, value] of Object.entries(row)) {
      // Substitui newlines por espaço e remove espaços duplos
      const normalizedKey = key.replace(/\n/g, ' ').replace(/\s+/g, ' ').trim();
      clean[normalizedKey] = value;
      // Mantém também a key original para fallback
      if (normalizedKey !== key) clean[key] = value;
    }
    return clean;
  });
}

/** Loga as colunas encontradas no sheet para debug */
function logSheetColumns(tag: string, rows: Record<string, unknown>[]): void {
  if (rows.length === 0) {
    console.log(`[${tag}] sheet vazia (0 rows)`);
    return;
  }
  const cols = Object.keys(rows[0]).filter(k => !k.startsWith('__EMPTY'));
  console.log(`[${tag}] ${rows.length} rows | colunas: [${cols.join(', ')}]`);
}

/** Loga stats de null para campos-chave de uma amostra de rows */
function logFieldStats(tag: string, rows: Record<string, unknown>[], fieldMap: Record<string, string[]>): void {
  const sample = rows.slice(0, Math.min(rows.length, 100));
  const stats: Record<string, { filled: number; total: number }> = {};
  for (const [fieldName, keys] of Object.entries(fieldMap)) {
    let filled = 0;
    for (const row of sample) {
      const val = col(row, ...keys);
      if (val !== null && val !== undefined && val !== '') filled++;
    }
    stats[fieldName] = { filled, total: sample.length };
  }
  const lines = Object.entries(stats).map(([field, { filled, total }]) =>
    `${field}: ${filled}/${total} (${Math.round(filled / total * 100)}%)`
  );
  console.log(`[${tag}] field coverage (sample ${sample.length} rows): ${lines.join(' | ')}`);
}

const CHUNK_SIZE = 100;

export class PlanilhaImporter {
  private workerRepo = new WorkerRepository();
  private encuadreRepo = new EncuadreRepository();
  private blacklistRepo = new BlacklistRepository();
  private publicationRepo = new PublicationRepository();
  private jobPostingRepo = new JobPostingARRepository();
  private importJobRepo = new ImportJobRepository();
  private workerApplicationRepo = new WorkerApplicationRepository();
  private workerLocationRepo = new WorkerLocationRepository();
  private dedupService = new WorkerDeduplicationService();

  /** IDs de workers tocados (criados/atualizados) no import em curso.
   *  Populado por upsertWorker; resetado no início de cada importBuffer.
   *  Passado ao dedupService.runDeduplicationForWorkers ao final do import. */
  private _currentTouchedIds: string[] = [];

  async importBuffer(
    buffer: Buffer,
    filename: string,
    importJobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress[]> {
    console.log(`[Import ${importJobId}] START | filename: ${filename} | size: ${(buffer.length / 1024).toFixed(1)}KB`);

    // Reseta o tracker de workers tocados neste job
    this._currentTouchedIds = [];

    // CSV files (Talent Search export) are read as UTF-8 string; XLSX/XLSM as binary buffer
    const isCSV = filename.toLowerCase().endsWith('.csv');
    const workbook = isCSV
      ? XLSX.read(buffer.toString('utf-8'), { type: 'string', raw: false })
      : XLSX.read(buffer, { type: 'buffer', cellDates: true });
    const results: ImportProgress[] = [];

    await this.importJobRepo.updateStatus(importJobId, 'processing');

    try {
      // detectType dentro do try para que erros de reconhecimento também atualizem status='error'
      const type = this.detectType(workbook, filename);
      console.log(`[Import ${importJobId}] detected type: ${type} | sheets: [${workbook.SheetNames.join(', ')}]`);

      if (type === 'ana_care') {
        results.push(await this.importAnaCare(workbook, importJobId, onProgress));
      } else if (type === 'candidatos') {
        results.push(await this.importCandidatos(workbook, importJobId, onProgress));
      } else if (type === 'planilla_operativa') {
        results.push(...await this.importPlanillaOperativa(workbook, importJobId, onProgress));
      } else if (type === 'talent_search') {
        results.push(await this.importTalentSearch(workbook, importJobId, onProgress));
      } else {
        throw new Error(`Tipo de planilha não reconhecido: ${filename}`);
      }

      // Linkar encuadres/blacklist ao worker_id pelo phone
      console.log(`[Import ${importJobId}] linking encuadres/blacklist by phone...`);
      const linkedEnc = await this.encuadreRepo.linkWorkersByPhone();
      const linkedBl = await this.blacklistRepo.linkWorkersByPhone();
      console.log(`[Import ${importJobId}] linked: ${linkedEnc} encuadres, ${linkedBl} blacklist entries`);

      // ── Deduplicação pós-importação ──────────────────────────────────────
      // Roda apenas para os workers tocados neste job (não varre toda a tabela).
      // Erros são não-fatais: o import é marcado como 'done' mesmo que o dedup falhe.
      const touchedIds = [...new Set(this._currentTouchedIds)];
      if (touchedIds.length > 0) {
        try {
          const dedupReport = await this.dedupService.runDeduplicationForWorkers(
            touchedIds,
            { dryRun: false, confidence: 0.85 },
          );
          console.log(
            `[Import ${importJobId}] DEDUP | candidates: ${dedupReport.candidatesFound}` +
            ` | analyzed: ${dedupReport.analyzed}` +
            ` | merges: ${dedupReport.mergesExecuted}` +
            ` | errors: ${dedupReport.errors}`,
          );
        } catch (err) {
          console.error(`[Import ${importJobId}] DEDUP ERROR (non-fatal):`, (err as Error).message);
        }
      }

      await this.importJobRepo.updateStatus(importJobId, 'done');

      const totals = {
        workersCreated:   results.reduce((s, r) => s + r.workersCreated, 0),
        workersUpdated:   results.reduce((s, r) => s + r.workersUpdated, 0),
        casesCreated:     results.reduce((s, r) => s + r.casesCreated, 0),
        casesUpdated:     results.reduce((s, r) => s + r.casesUpdated, 0),
        encuadresCreated: results.reduce((s, r) => s + r.encuadresCreated, 0),
        encuadresSkipped: results.reduce((s, r) => s + r.encuadresSkipped, 0),
        errorDetails:     results.flatMap(r => r.errors),
      };
      await this.importJobRepo.updateProgress(importJobId, totals);

      console.log(`[Import ${importJobId}] DONE | workers: +${totals.workersCreated} ~${totals.workersUpdated} | cases: +${totals.casesCreated} ~${totals.casesUpdated} | encuadres: +${totals.encuadresCreated} skipped:${totals.encuadresSkipped} | errors: ${totals.errorDetails.length}`);
      if (totals.errorDetails.length > 0) {
        console.log(`[Import ${importJobId}] first 10 errors:`, totals.errorDetails.slice(0, 10));
      }
    } catch (err) {
      console.error(`[Import ${importJobId}] FATAL ERROR:`, (err as Error).message);
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
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheetName = wb.SheetNames.find(n => n.toLowerCase().includes('ana')) ?? wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];

    console.log(`[Import ${jobId}][AnaCare] sheet: "${sheetName}" | ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][AnaCare`, rows);
    logFieldStats(`Import ${jobId}][AnaCare`, rows, {
      phone: ['Teléfono', 'Telefono', 'TELEFONO'],
      email: ['Email', 'EMAIL', 'CORREO'],
      name: ['Nombre', 'NOMBRE', 'Nombre y Apellido'],
      birthDate: ['Fecha de nacimiento', 'Fecha nacimiento', 'FECHA NACIMIENTO'],
      cuit: ['Número de cédula', 'Cédula', 'CUIT', 'cedula'],
      tipo: ['Tipo', 'TIPO'],
    });

    const progress = makeProgress(sheetName, rows.length);
    console.log(`[Import ${jobId}][AnaCare] Starting to process ${rows.length} rows`);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        if (i % 10 === 0) {
          console.log(`[Import ${jobId}][AnaCare] Processing row ${i + 1}/${rows.length}`);
        }

        const phone = normalizePhoneAR(cleanString(col(row, 'Teléfono', 'Telefono', 'TELEFONO')));
        const rawEmail = cleanString(col(row, 'Email', 'EMAIL', 'CORREO'));
        const email = normalizeEmail(rawEmail);
        const nombre = cleanString(col(row, 'Nombre', 'NOMBRE', 'Nombre y Apellido'));

        if (!phone && !email) {
          progress.errors.push({ row: i + 2, error: 'Sem phone e sem email — ignorado' });
          continue;
        }

        const authUid = generateSecureAuthUid('anacare', phone, email);
        const workerEmail = email ?? `${authUid}@enlite.import`;

        // Cédula é "Si/No" neste arquivo, o número real está em "Número de cédula"
        const cuitValue = cleanString(col(row, 'Número de cédula', 'CUIT', 'cedula'));
        const branchOffice = cleanString(col(row, 'Delegación', 'Sucursal', 'DELEGACION'));
        
        // Normalizar nomes
        const firstName = normalizeProperName(extractFirstName(nombre));
        const lastName = normalizeProperName(extractLastName(nombre));
        
        // Classificar profession
        const rawProfession = cleanString(col(row, 'Tipo', 'TIPO'));
        const classifiedProfession = classifyProfession(rawProfession);

        console.log(`[Import ${jobId}][AnaCare] Row ${i + 1}: Calling upsertWorker for ${phone || email}`);
        const { workerId, created } = await this.upsertWorker({
          authUid,
          phone: phone || undefined,
          email: workerEmail,
          anaCareId: cleanString(col(row, 'ID', 'id')),
          documentType: cuitValue ? 'CUIT' : null,
          documentNumber: cuitValue,
          firstName,
          lastName,
          birthDate: parseExcelDate(col(row, 'Fecha de nacimiento', 'Fecha nacimiento', 'FECHA NACIMIENTO')),
          sex: cleanString(col(row, 'Género', 'GENERO', 'Genero')),
          occupation: normalizeOccupation(classifiedProfession),
          profession: classifiedProfession,
          branchOffice,
          country: 'AR',
          dataSource: 'ana_care',
        });

        if (created) progress.workersCreated++;
        else progress.workersUpdated++;

        // ── Salvar localização do worker (Domicilio) ─────────────────────
        const domicilio = cleanString(col(row, 'Domicilio', 'DOMICILIO', 'Domicilio'));
        if (domicilio && workerId) {
          try {
            await this.workerLocationRepo.upsert({
              workerId,
              address: domicilio,
              country: 'AR',
              dataSource: 'ana_care',
            });
          } catch (locErr) {
            console.warn(`[Import ${jobId}][AnaCare] row ${i + 2}: location save failed: ${(locErr as Error).message}`);
          }
        }
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    console.log(`[Import ${jobId}][AnaCare] DONE | created: ${progress.workersCreated} | updated: ${progress.workersUpdated} | errors: ${progress.errors.length}`);
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
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const progress = makeProgress('Candidatos', 0);
    console.log(`[Import ${jobId}][Candidatos] sheets found: [${wb.SheetNames.join(', ')}]`);

    // --- Aba Talentum ---
    const talentumSheet = wb.Sheets['Talentum'];
    if (talentumSheet) {
      const rows = XLSX.utils.sheet_to_json(talentumSheet, { defval: null }) as Record<string, unknown>[];
      progress.totalRows += rows.length;
      console.log(`[Import ${jobId}][Candidatos.Talentum] ${rows.length} rows`);
      logSheetColumns(`Import ${jobId}][Candidatos.Talentum`, rows);
      logFieldStats(`Import ${jobId}][Candidatos.Talentum`, rows, {
        phone: ['Numeros de telefono', 'Teléfono', 'TELEFONO', 'telefono'],
        name: ['Nombre', 'Nombre y Apellido', 'NOMBRE Y APELLIDO', 'nombre'],
        apellido: ['Apellido'],
        cuit: ['CUIT', 'cuit'],
        status: ['Status', 'STATUS', 'status'],
        email: ['Email', 'EMAIL'],
      });

      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // Talentum tem Nombre + Apellido separados
          const phone = normalizePhoneAR(cleanString(col(row, 'Numeros de telefono', 'Teléfono', 'TELEFONO', 'telefono')));
          const cuit = cleanString(col(row, 'CUIT', 'cuit'));
          const rawFirstName = cleanString(col(row, 'Nombre', 'nombre'));
          const rawLastName = cleanString(col(row, 'Apellido', 'apellido'));
          const nombre = cleanString(col(row, 'Nombre y Apellido', 'NOMBRE Y APELLIDO'))
            ?? (rawFirstName && rawLastName ? `${rawFirstName} ${rawLastName}` : rawFirstName);
          const statusRaw = cleanString(col(row, 'Status', 'STATUS', 'status')) ?? '';

          if (!phone && !cuit) {
            progress.errors.push({ row: i + 2, error: 'Sem phone nem CUIT — ignorado' });
            continue;
          }

          const authUid = generateSecureAuthUid('candidato', phone, cuit);
          const rawEmail = cleanString(col(row, 'Email', 'EMAIL'));
          const email = normalizeEmail(rawEmail) ?? `${authUid}@enlite.import`;
          
          const firstName = normalizeProperName(rawFirstName ?? extractFirstName(nombre));
          const lastName = normalizeProperName(rawLastName ?? extractLastName(nombre));

          const { workerId, created } = await this.upsertWorker({
            authUid,
            phone: phone || undefined,
            email,
            documentType: cuit ? 'CUIT' : null,
            documentNumber: cuit || undefined,
            firstName,
            lastName,
            country: 'AR',
            dataSource: 'candidatos',
          });

          if (created) progress.workersCreated++;
          else progress.workersUpdated++;

          // ── Extrair CASO(s) e criar worker_job_applications ─────────────────
          const casosRaw = cleanString(col(row, 'CASO', 'Caso'));
          if (casosRaw) {
            const caseNumbers = parseTalentSearchCaseNumbers(casosRaw);
            const appStatus = mapTalentSearchStatusToApplicationStatus(statusRaw);
            for (const caseNumber of caseNumbers) {
              try {
                let jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
                if (!jp) {
                  const newJp = await this.jobPostingRepo.upsertByCaseNumber({ caseNumber, country: 'AR' });
                  jp = { id: newJp.id };
                  if (newJp.created) progress.casesCreated++;
                }
                const { created: appCreated } = await this.workerApplicationRepo.upsert(workerId, jp.id, 'candidatos', appStatus);
                if (appCreated) progress.encuadresCreated++;
                else progress.encuadresSkipped++;
              } catch (appErr) {
                console.warn(`[Import ${jobId}][Candidatos.Talentum] row ${i + 2}: application CASO ${caseNumber} falhou: ${(appErr as Error).message}`);
              }
            }
          }

        } catch (err) {
          progress.errors.push({ row: i + 2, error: (err as Error).message });
        }
        progress.processedRows++;
        if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
      }
      console.log(`[Import ${jobId}][Candidatos.Talentum] DONE | created: ${progress.workersCreated} | updated: ${progress.workersUpdated} | errors: ${progress.errors.length}`);
    } else {
      console.warn(`[Import ${jobId}][Candidatos.Talentum] sheet NOT FOUND`);
    }

    // --- Aba NoTerminaronTalentum → PRE_TALENTUM ---
    const naoTerminaramSheet = wb.Sheets['NoTerminaronTalentum'] ?? wb.Sheets['NoTerminaronTalentun'];
    if (naoTerminaramSheet) {
      const rows = XLSX.utils.sheet_to_json(naoTerminaramSheet, { defval: null }) as Record<string, unknown>[];
      progress.totalRows += rows.length;
      console.log(`[Import ${jobId}][Candidatos.NoTerminaron] ${rows.length} rows`);
      logSheetColumns(`Import ${jobId}][Candidatos.NoTerminaron`, rows);
      logFieldStats(`Import ${jobId}][Candidatos.NoTerminaron`, rows, {
        phone: ['Numero de telefono', 'Teléfono', 'TELEFONO', 'telefono'],
        nombre: ['Nombre', 'nombre'],
        apellido: ['Apellido', 'apellido'],
        email: ['Email', 'EMAIL'],
        cuit: ['DNI/CUIT', 'CUIT', 'cuit'],
      });

      const savedBefore = progress.workersCreated;
      for (let i = 0; i < rows.length; i++) {
        const row = rows[i];
        try {
          // NoTerminaron tem Nombre + Apellido separados
          const phone = normalizePhoneAR(cleanString(col(row, 'Numero de telefono', 'Teléfono', 'TELEFONO', 'telefono')));
          const rawFirstName = cleanString(col(row, 'Nombre', 'nombre'));
          const rawLastName = cleanString(col(row, 'Apellido', 'apellido'));
          const nombre = cleanString(col(row, 'Nombre y Apellido', 'NOMBRE Y APELLIDO'))
            ?? (rawFirstName && rawLastName ? `${rawFirstName} ${rawLastName}` : rawFirstName);

          if (!phone && !nombre) continue;

          const authUid = generateSecureAuthUid('pretaln', phone, nombre);
          const rawEmail = cleanString(col(row, 'Email', 'EMAIL'));
          const email = normalizeEmail(rawEmail) ?? `${authUid}@enlite.import`;
          const cuit = cleanString(col(row, 'DNI/CUIT', 'CUIT', 'cuit'));
          const linkedinUrl = cleanString(col(row, 'Linkedin', 'LINKEDIN'));
          const birthDate = parseExcelDate(col(row, 'FEC NAC', 'Fecha Nacimiento'));
          const sex = cleanString(col(row, 'SEXO', 'Sexo'));
          
          const firstName = normalizeProperName(rawFirstName ?? extractFirstName(nombre));
          const lastName = normalizeProperName(rawLastName ?? extractLastName(nombre));
          const rawProfession = cleanString(col(row, 'TIPO PROFESIONAL', 'Tipo Profesional'));
          const classifiedProfession = classifyProfession(rawProfession);

          const { created, workerId } = await this.upsertWorker({
            authUid,
            phone: phone || undefined,
            email,
            documentType: cuit ? 'CUIT' : null,
            documentNumber: cuit || undefined,
            firstName,
            lastName,
            birthDate,
            sex,
            linkedinUrl,
            profession: classifiedProfession,
            country: 'AR',
            dataSource: 'candidatos',
          });

          if (created) progress.workersCreated++;
          else progress.workersUpdated++;

          // ── Salvar localização do worker (ZONA e ZONA INTERÉS) ────────────
          const workZone = cleanString(col(row, 'ZONA', 'Zona'));
          const interestZone = cleanString(col(row, 'ZONA INTERÉS', 'Zona Interes', 'Zona Interés'));
          if ((workZone || interestZone) && workerId) {
            try {
              await this.workerLocationRepo.upsert({
                workerId,
                workZone,
                interestZone,
                country: 'AR',
                dataSource: 'candidatos_no_terminaron',
              });
            } catch (locErr) {
              console.warn(`[Import ${jobId}][Candidatos.NoTerminaron] row ${i + 2}: location save failed: ${(locErr as Error).message}`);
            }
          }
        } catch (err) {
          progress.errors.push({ row: i + 2, error: (err as Error).message });
        }
        progress.processedRows++;
        if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
      }
      console.log(`[Import ${jobId}][Candidatos.NoTerminaron] DONE | created: ${progress.workersCreated - savedBefore} | errors: ${progress.errors.length}`);
    } else {
      console.warn(`[Import ${jobId}][Candidatos.NoTerminaron] sheet NOT FOUND`);
    }

    // --- Aba NoUsarMás → BLACKLIST ---
    const blacklistSheet = wb.Sheets['NoUsarMás'] ?? wb.Sheets['NoUsarMas'];
    if (blacklistSheet) {
      const rows = XLSX.utils.sheet_to_json(blacklistSheet, { defval: null }) as Record<string, unknown>[];
      console.log(`[Import ${jobId}][Candidatos.NoUsarMas] ${rows.length} rows`);
      logSheetColumns(`Import ${jobId}][Candidatos.NoUsarMas`, rows);

      let blCreated = 0;
      for (const row of rows) {
        try {
          // NoUsarMás tem NOMBRE + APELLIDO separados, phone = CONTACTO
          const phone = normalizePhoneAR(cleanString(col(row, 'CONTACTO', 'Teléfono', 'TELEFONO')));
          const firstName = cleanString(col(row, 'NOMBRE', 'Nombre'));
          const lastName = cleanString(col(row, 'APELLIDO', 'Apellido'));
          const nombre = cleanString(col(row, 'Nombre y Apellido'))
            ?? (firstName && lastName ? `${firstName} ${lastName}` : firstName);
          // O "motivo" está na coluna "Resultado" neste arquivo
          const motivo = cleanString(col(row, 'Resultado', 'Motivo', 'MOTIVO', 'Reason'));
          if (!motivo) continue;

          await this.blacklistRepo.upsert({
            workerRawPhone: phone || null,
            workerRawName: nombre,
            reason: motivo,
            detail: cleanString(col(row, 'RESPUESTAS DE LOS CANDIDATOS', 'Detalle', 'DETALLE', 'Respuesta')),
          });
          blCreated++;
        } catch { /* ignora erros de blacklist */ }
      }
      console.log(`[Import ${jobId}][Candidatos.NoUsarMas] DONE | blacklist entries: ${blCreated}`);
    } else {
      console.warn(`[Import ${jobId}][Candidatos.NoUsarMas] sheet NOT FOUND`);
    }

    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // Planilla_Operativa_Encuadre.xlsx
  // ------------------------------------------------
  private async importPlanillaOperativa(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress[]> {
    console.log(`[Import ${jobId}][PlanillaOperativa] sheets: [${wb.SheetNames.join(', ')}]`);
    const results = [
      await this.importIndice(wb, jobId, onProgress),
      await this.importBase1(wb, jobId, onProgress),
      await this.importBlackListSheet(wb, jobId, onProgress),
      await this.importPublicaciones(wb, jobId, onProgress),
    ];

    // Cruzamento: abas individuais por caso (ex: "738 - Silva Lautaro")
    // Complementam _Base1 com HORA ENCUADRE, MEET LINK, ORIGEN, ID ONBOARDING
    results.push(await this.importCaseSheets(wb, jobId, onProgress));

    // _Mod tem campos extras (ORIGEM, ONBOARDING) para um subconjunto modificado de encuadres
    results.push(await this.importModSheet(wb, jobId, onProgress));

    return results;
  }

  private async importIndice(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Índice'] ?? wb.Sheets['_Indice'] ?? wb.Sheets['Índice'];
    const progress = makeProgress('_Índice', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_Índice] sheet NOT FOUND`);
      return progress;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_Índice] ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][_Índice`, rows);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const caseNumber = parseInt(String(col(row, 'CASO', 'Caso') ?? '').trim());
        if (isNaN(caseNumber)) continue;

        const { created } = await this.jobPostingRepo.upsertByCaseNumber({
          caseNumber,
          patientName: cleanString(col(row, 'PACIENTE', 'Paciente')),
          status: normalizeJobStatus(cleanString(col(row, 'ESTADO', 'Estado'))),
          dependency: normalizeDependency(cleanString(col(row, 'DEPENDENCIA', 'Dependencia'))),
          priority: normalizePriority(cleanString(col(row, 'PRIORIDAD', 'Prioridad'))),
          isCovered: normalizeBoolean(col(row, 'Está acompañada?', 'ESTA ACOMPAÑADA', 'Esta acompanada')) ?? false,
          coordinatorName: cleanString(col(row, 'COORDINADOR', 'Coordinador')),
          country: 'AR',
        });

        if (created) progress.casesCreated++;
        else progress.casesUpdated++;
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    console.log(`[Import ${jobId}][_Índice] DONE | cases created: ${progress.casesCreated} | updated: ${progress.casesUpdated} | errors: ${progress.errors.length}`);
    onProgress?.(progress);
    return progress;
  }

  private async importBase1(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Base1'] ?? wb.Sheets['Base1'];
    const progress = makeProgress('_Base1', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_Base1] sheet NOT FOUND`);
      return progress;
    }

    // Usa normalizedRows para lidar com newlines nos nomes das colunas
    const rows = normalizedRows(sheet);
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_Base1] ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][_Base1`, rows);
    logFieldStats(`Import ${jobId}][_Base1`, rows, {
      caso: ['CASO', 'Caso'],
      phone: ['TELEFONO', 'Teléfono'],
      name: ['NOMBRE Y APELLIDO', 'Nombre y Apellido'],
      coordinator: ['COORDINADOR ASIGNADO', 'COORDINADOR\nASIGNADO'],
      fechaEncuadre: ['FECHA ENCUADRE', 'FECHA\nENCUADRE'],
      horaEncuadre: ['HORA ENCUADRE', 'HORA\nENCUADRE'],
      resultado: ['RESULTADO'],
      ocupacion: ['OCUPACION'],
      presente: ['PRESENTE'],
    });

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const caseNumber = parseInt(String(col(row, 'CASO', 'Caso') ?? '').trim());
        const workerPhone = normalizePhoneAR(cleanString(col(row, 'TELEFONO', 'Teléfono')));
        const workerName = cleanString(col(row, 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
        const recruitmentDate = parseExcelDate(col(row, 'FECHA RECLUTAMIENTO', 'FECHA\nRECLUTAMIENTO'));
        // Coluna tem newline: "FECHA\nENCUADRE" → normalizado para "FECHA ENCUADRE"
        const interviewDate = parseExcelDate(col(row, 'FECHA ENCUADRE', 'FECHA\nENCUADRE'));
        // formatExcelTime converte frações decimais do Excel (0.5833 → "14:00") E strings "HH:MM"
        const interviewTime = formatExcelTime(col(row, 'HORA ENCUADRE', 'HORA\nENCUADRE'));

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
              patientName: cleanString(col(row, 'PACIENTE', 'Paciente')),
              country: 'AR',
            });
            jobPostingId = c.id;
            if (c.created) progress.casesCreated++;
          } else {
            jobPostingId = jp.id;
          }
        }

        // Cria ou encontra o worker correspondente (anti-duplicata via phone)
        // Garante que todo registro da planilha vira um worker real — sem duplicatas.
        let workerId: string | null = null;
        if (workerPhone || workerName) {
          try {
            const wAuthUid = `base1import_${workerPhone || normalizeName(workerName ?? '')}`;
            const wEmail = cleanString(col(row, 'CORREO', 'correo')) ?? `${wAuthUid}@enlite.import`;
            const { workerId: wid, created: wCreated } = await this.upsertWorker({
              authUid: wAuthUid,
              phone: workerPhone || undefined,
              email: wEmail,
              firstName: extractFirstName(workerName),
              lastName: extractLastName(workerName),
              country: 'AR',
              dataSource: 'planilla_operativa',
            });
            workerId = wid;
            if (wCreated) progress.workersCreated++;
            else progress.workersUpdated++;
          } catch (wErr) {
            // Falha no worker não bloqueia o encuadre
            progress.errors.push({ row: i + 2, error: `worker: ${(wErr as Error).message}` });
          }
        }

        // Coluna tem newline: "COORDINADOR\nASIGNADO" → normalizado para "COORDINADOR ASIGNADO"
        const { created } = await this.encuadreRepo.upsert({
          workerId,
          jobPostingId,
          workerRawName: workerName,
          workerRawPhone: workerPhone || null,
          occupationRaw: cleanString(col(row, 'OCUPACION', 'Ocupacion')),
          recruiterName: cleanString(col(row, 'RECLUTADOR', 'Reclutador')),
          coordinatorName: cleanString(col(row, 'COORDINADOR ASIGNADO', 'COORDINADOR\nASIGNADO')),
          recruitmentDate,
          interviewDate,
          interviewTime,
          meetLink: cleanString(col(row, 'ID ENCUADRE MEET', 'ID\nENCUADRE MEET')),
          attended: normalizeBoolean(col(row, 'PRESENTE')),
          absenceReason: cleanString(col(row, 'MOTIVO AUSENCIA')),
          acceptsCase: normalizeAcceptsCase(cleanString(col(row, 'ACEPTA CASO'))),
          rejectionReason: cleanString(col(row, 'MOTIVO RECHAZO')),
          resultado: normalizeResultado(cleanString(col(row, 'RESULTADO'))) as Encuadre['resultado'],
          redireccionamiento: cleanString(col(row, 'REDIRECCIONAMIENTO', 'Redireccionamiento')),
          hasCv: normalizeBoolean(col(row, 'CV')),
          hasDni: normalizeBoolean(col(row, 'DNI')),
          hasCertAt: normalizeBoolean(col(row, 'CERT AT')),
          hasAfip: normalizeBoolean(col(row, 'AFIP')),
          hasCbu: normalizeBoolean(col(row, 'CBU')),
          hasAp: normalizeBoolean(col(row, 'AP')),
          hasSeguros: normalizeBoolean(col(row, 'SEG')),
          workerEmail: cleanString(col(row, 'CORREO', 'correo')),
          obsReclutamiento: cleanString(col(row, 'Obs. RECLUTAMIENTO', 'OBS. RECLUTAMIENTO')),
          obsEncuadre: cleanString(col(row, 'Obs. ENCUADRE', 'OBS. ENCUADRE')),
          obsAdicionales: cleanString(col(row, 'Obs. Adicionales', 'OBS. ADICIONALES')),
          dedupHash,
        });

        if (created) progress.encuadresCreated++;
        else progress.encuadresSkipped++;

      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }

      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    console.log(`[Import ${jobId}][_Base1] DONE | encuadres created: ${progress.encuadresCreated} | skipped: ${progress.encuadresSkipped} | cases auto-created: ${progress.casesCreated} | errors: ${progress.errors.length}`);
    if (progress.errors.length > 0) {
      console.log(`[Import ${jobId}][_Base1] first 5 errors:`, progress.errors.slice(0, 5));
    }
    onProgress?.(progress);
    return progress;
  }

  private async importBlackListSheet(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_BlackList'] ?? wb.Sheets['BlackList'] ?? wb.Sheets['_Blacklist'];
    const progress = makeProgress('_BlackList', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_BlackList] sheet NOT FOUND`);
      return progress;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_BlackList] ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][_BlackList`, rows);

    // Log das colunas reais para debug — a _BlackList deste arquivo tem colunas
    // não-padrão: "f" (nome), "WhatsApp" (phone), "Registrado por" (contém o motivo!),
    // "__EMPTY_1" (detalhe), "__EMPTY_2" (quem registrou)
    if (rows.length > 0) {
      console.log(`[Import ${jobId}][_BlackList] sample row keys: [${Object.keys(rows[0]).join(', ')}]`);
      console.log(`[Import ${jobId}][_BlackList] sample row 0:`, JSON.stringify(rows[0]).slice(0, 500));
    }

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // Colunas reais: "f"=nome, "WhatsApp"=phone, "Registrado por"=motivo (confuso mas é assim)
        const phone = normalizePhoneAR(cleanString(col(row, 'WhatsApp', 'TELEFONO', 'Teléfono')));
        const nombre = cleanString(col(row, 'f', 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
        const motivo = cleanString(col(row, 'Registrado por', 'MOTIVO', 'Motivo', 'RAZÓN'));
        if (!motivo) {
          if (i < 3) console.log(`[Import ${jobId}][_BlackList] row ${i + 2}: motivo null, skipped`);
          continue;
        }

        await this.blacklistRepo.upsert({
          workerRawPhone: phone || null,
          workerRawName: nombre,
          reason: motivo,
          detail: cleanString(col(row, '__EMPTY_1', 'DETALLE', 'Detalle', 'Observaciones')),
          registeredBy: cleanString(col(row, '__EMPTY_2', 'QUIEN REGISTRÓ', 'quien_registro')),
          canTakeEventual: normalizeBoolean(col(row, 'PUEDE TOMAR EVENTUAL', 'puede tomar eventual', 'PUEDE EVENTUAL')) ?? false,
        });
        progress.workersCreated++;
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    console.log(`[Import ${jobId}][_BlackList] DONE | entries: ${progress.workersCreated} | errors: ${progress.errors.length}`);
    onProgress?.(progress);
    return progress;
  }

  private async importPublicaciones(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Publicaciones'] ?? wb.Sheets['Publicaciones'];
    const progress = makeProgress('_Publicaciones', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_Publicaciones] sheet NOT FOUND`);
      return progress;
    }

    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_Publicaciones] ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][_Publicaciones`, rows);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const caseNumber = parseInt(String(col(row, 'CASO', 'Caso') ?? '').trim());
        // Colunas reais: "Canal / RRSS", "Grupos / Comunidades"
        const channel = cleanString(col(row, 'Canal / RRSS', 'CANAL', 'Canal'));
        const groupName = cleanString(col(row, 'Grupos / Comunidades', 'GRUPO', 'Grupo'));
        const recruiter = cleanString(col(row, 'RECLUTADOR', 'Reclutador'));
        const publishedAt = parseExcelDate(col(row, 'FECHA', 'Fecha'));

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
          observations: cleanString(col(row, 'Observaciones', 'OBSERVACIONES', 'obs')),
          dedupHash,
        });

        if (created) progress.encuadresCreated++;
        else progress.encuadresSkipped++;

      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    console.log(`[Import ${jobId}][_Publicaciones] DONE | publications created: ${progress.encuadresCreated} | skipped: ${progress.encuadresSkipped} | errors: ${progress.errors.length}`);
    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // importCaseSheets
  // Processa todas as abas individuais por caso (ex: "738 - Silva Lautaro").
  // Essas abas têm a mesma estrutura que _Mod (com HORA, MEET, ORIGEN, ONBOARDING)
  // e COMPLEMENTAM os encuadres já criados pelo _Base1.
  //
  // Estratégia de cruzamento:
  //   1. Tenta soft-match por (job_posting_id + phone + interview_date + recruitment_date)
  //   2. Se encontra: atualiza com campos suplementares (COALESCE — não sobrescreve)
  //   3. Se não encontra: cria novo encuadre com todos os campos disponíveis
  // ------------------------------------------------
  private async importCaseSheets(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    // Identifica abas individuais por caso: padrão "NNN - Nome"
    const caseSheetPattern = /^\d+\s*-\s*.+/;
    const caseSheets = wb.SheetNames.filter(n => caseSheetPattern.test(n));

    const progress = makeProgress('_CaseSheets', 0);
    console.log(`[Import ${jobId}][_CaseSheets] ${caseSheets.length} case sheets to process`);

    let supplemented = 0;
    let newlyCreated = 0;
    let skipped = 0;

    for (const sheetName of caseSheets) {
      const sheet = wb.Sheets[sheetName];
      if (!sheet) continue;

      const rows = normalizedRows(sheet);
      // Filtra linhas com dados (pelo menos NOME ou TELEFONE preenchido)
      const dataRows = rows.filter(r => {
        const name = cleanString(col(r, 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
        const phone = cleanString(col(r, 'TELEFONO', 'Teléfono'));
        return name || phone;
      });

      if (dataRows.length === 0) continue;
      progress.totalRows += dataRows.length;

      // Extrai case number do nome da aba (ex: "738 - Silva Lautaro" → 738)
      const caseNumMatch = sheetName.match(/^(\d+)/);
      const caseNumber = caseNumMatch ? parseInt(caseNumMatch[1]) : NaN;

      let jobPostingId: string | null = null;
      if (!isNaN(caseNumber)) {
        const jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
        jobPostingId = jp?.id ?? null;
      }

      for (let i = 0; i < dataRows.length; i++) {
        const row = dataRows[i];
        try {
          const workerPhone = normalizePhoneAR(cleanString(col(row, 'TELEFONO', 'Teléfono')));
          const workerName = cleanString(col(row, 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
          const recruitmentDate = parseExcelDate(col(row, 'FECHA RECLUTAMIENTO', 'FECHA\nRECLUTAMIENTO'));
          const interviewDate = parseExcelDate(col(row, 'FECHA ENCUADRE', 'FECHA\nENCUADRE'));

          // Campos que só existem nas abas individuais
          const interviewTimeRaw = col(row, 'HORA ENCUADRE', 'HORA\nENCUADRE');
          const interviewTime = formatExcelTime(interviewTimeRaw);
          const meetLink = cleanString(col(row, 'ID ENCUADRE MEET', 'ID\nENCUADRE MEET'));
          const origen = cleanString(col(row, 'ORIGEN', 'Origen'));
          const idOnboarding = cleanString(col(row, 'ID ONBOARDING', 'ID\nONBOARDING'));

          // Cria ou encontra o worker (anti-duplicata via phone)
          let caseWorkerId: string | null = null;
          if (workerPhone || workerName) {
            try {
              const wAuthUid = `caseimport_${workerPhone || normalizeName(workerName ?? '')}`;
              const wEmail = cleanString(col(row, 'CORREO', 'correo')) ?? `${wAuthUid}@enlite.import`;
              const { workerId: wid, created: wCreated } = await this.upsertWorker({
                authUid: wAuthUid,
                phone: workerPhone || undefined,
                email: wEmail,
                firstName: extractFirstName(workerName),
                lastName: extractLastName(workerName),
                country: 'AR',
              });
              caseWorkerId = wid;
              if (wCreated) progress.workersCreated++;
              else progress.workersUpdated++;
            } catch { /* não bloqueia encuadre */ }
          }

          const supplement = {
            interviewTime,
            meetLink,
            origen,
            idOnboarding,
            resultado: normalizeResultado(cleanString(col(row, 'RESULTADO'))) as Encuadre['resultado'],
            hasCv: normalizeBoolean(col(row, 'CV')),
            hasDni: normalizeBoolean(col(row, 'DNI')),
            hasCertAt: normalizeBoolean(col(row, 'CERT AT')),
            hasAfip: normalizeBoolean(col(row, 'AFIP')),
            hasCbu: normalizeBoolean(col(row, 'CBU')),
            hasAp: normalizeBoolean(col(row, 'AP')),
            hasSeguros: normalizeBoolean(col(row, 'SEG')),
            workerEmail: cleanString(col(row, 'CORREO', 'correo')),
            obsEncuadre: cleanString(col(row, 'Obs. ENCUADRE', 'OBS. ENCUADRE')),
            obsAdicionales: cleanString(col(row, 'Obs. Adicionales', 'OBS. ADICIONALES')),
            absenceReason: cleanString(col(row, 'MOTIVO AUSENCIA')),
            rejectionReason: cleanString(col(row, 'MOTIVO RECHAZO')),
            redireccionamiento: cleanString(col(row, 'REDIRECCIONAMIENTO')),
          };

          // Tenta soft-match com encuadre já existente do _Base1
          let matched: import('../../domain/entities/Encuadre').Encuadre | null = null;
          if (jobPostingId && workerPhone) {
            matched = await this.encuadreRepo.findSoftMatch(jobPostingId, workerPhone, interviewDate, recruitmentDate);
          }

          if (matched) {
            await this.encuadreRepo.updateSupplement(matched.id, supplement);
            supplemented++;
          } else {
            // Não encontrou soft match → cria novo encuadre completo
            const dedupHash = hashEncuadre({
              caseNumber: isNaN(caseNumber) ? null : caseNumber,
              workerPhone,
              workerName,
              interviewDate: interviewDate?.toISOString().split('T')[0] ?? null,
              interviewTime,
              recruitmentDate: recruitmentDate?.toISOString().split('T')[0] ?? null,
            });

            const { created } = await this.encuadreRepo.upsert({
              workerId: caseWorkerId,
              jobPostingId,
              workerRawName: workerName,
              workerRawPhone: workerPhone || null,
              occupationRaw: cleanString(col(row, 'OCUPACION', 'Ocupacion')),
              recruiterName: cleanString(col(row, 'RECLUTADOR', 'Reclutador')),
              coordinatorName: cleanString(col(row, 'COORDINADOR ASIGNADO', 'COORDINADOR\nASIGNADO')),
              recruitmentDate,
              interviewDate,
              ...supplement,
              obsReclutamiento: cleanString(col(row, 'Obs. RECLUTAMIENTO', 'OBS. RECLUTAMIENTO')),
              dedupHash,
            });

            if (created) newlyCreated++;
            else skipped++;
          }
        } catch (err) {
          progress.errors.push({ row: i + 2, error: `[${sheetName}] ${(err as Error).message}` });
        }
        progress.processedRows++;
        if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
      }
    }

    progress.encuadresCreated = newlyCreated;
    progress.encuadresSkipped = skipped;
    progress.workersUpdated = supplemented;

    console.log(`[Import ${jobId}][_CaseSheets] DONE | sheets: ${caseSheets.length} | supplemented: ${supplemented} | new: ${newlyCreated} | skipped: ${skipped} | errors: ${progress.errors.length}`);
    if (progress.errors.length > 0) {
      console.log(`[Import ${jobId}][_CaseSheets] first 5 errors:`, progress.errors.slice(0, 5));
    }
    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // importModSheet
  // Processa a aba _Mod (encuadres modificados/especiais).
  // Tem colunas extras: ORIGEN, ID ONBOARDING, HORA ENCUADRE, ID ENCUADRE MEET.
  // Mesma lógica de cruzamento das abas individuais.
  // ------------------------------------------------
  private async importModSheet(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_Mod'] ?? wb.Sheets['Mod'];
    const progress = makeProgress('_Mod', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_Mod] sheet NOT FOUND`);
      return progress;
    }

    const rows = normalizedRows(sheet);
    const dataRows = rows.filter(r => {
      const name = cleanString(col(r, 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
      const phone = cleanString(col(r, 'TELEFONO', 'Teléfono'));
      return name || phone;
    });

    progress.totalRows = dataRows.length;
    console.log(`[Import ${jobId}][_Mod] ${dataRows.length} data rows`);
    logSheetColumns(`Import ${jobId}][_Mod`, dataRows);

    let supplemented = 0;
    let newlyCreated = 0;
    let skipped = 0;

    for (let i = 0; i < dataRows.length; i++) {
      const row = dataRows[i];
      try {
        const caseNumber = parseInt(String(col(row, 'CASO', 'Caso') ?? '').trim());
        const workerPhone = normalizePhoneAR(cleanString(col(row, 'TELEFONO', 'Teléfono')));
        const workerName = cleanString(col(row, 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
        const recruitmentDate = parseExcelDate(col(row, 'FECHA RECLUTAMIENTO', 'FECHA\nRECLUTAMIENTO'));
        const interviewDate = parseExcelDate(col(row, 'FECHA ENCUADRE', 'FECHA\nENCUADRE'));
        const interviewTimeRaw = col(row, 'HORA ENCUADRE', 'HORA\nENCUADRE');
        const interviewTime = formatExcelTime(interviewTimeRaw);
        const meetLink = cleanString(col(row, 'ID ENCUADRE MEET', 'ID\nENCUADRE MEET'));
        const origen = cleanString(col(row, 'ORIGEN', 'Origen'));
        const idOnboarding = cleanString(col(row, 'ID ONBOARDING', 'ID\nONBOARDING'));

        let jobPostingId: string | null = null;
        if (!isNaN(caseNumber)) {
          const jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
          if (!jp) {
            const c = await this.jobPostingRepo.upsertByCaseNumber({
              caseNumber,
              patientName: cleanString(col(row, 'PACIENTE', 'Paciente')),
              country: 'AR',
            });
            jobPostingId = c.id;
            if (c.created) progress.casesCreated++;
          } else {
            jobPostingId = jp.id;
          }
        }

        // Cria ou encontra o worker (anti-duplicata via phone)
        let modWorkerId: string | null = null;
        if (workerPhone || workerName) {
          try {
            const wAuthUid = `modimport_${workerPhone || normalizeName(workerName ?? '')}`;
            const wEmail = cleanString(col(row, 'CORREO', 'correo')) ?? `${wAuthUid}@enlite.import`;
            const { workerId: wid, created: wCreated } = await this.upsertWorker({
              authUid: wAuthUid,
              phone: workerPhone || undefined,
              email: wEmail,
              firstName: extractFirstName(workerName),
              lastName: extractLastName(workerName),
              country: 'AR',
            });
            modWorkerId = wid;
            if (wCreated) progress.workersCreated++;
            else progress.workersUpdated++;
          } catch { /* não bloqueia encuadre */ }
        }

        const supplement = {
          interviewTime,
          meetLink,
          origen,
          idOnboarding,
          resultado: normalizeResultado(cleanString(col(row, 'RESULTADO'))) as Encuadre['resultado'],
          hasCv: normalizeBoolean(col(row, 'CV')),
          hasDni: normalizeBoolean(col(row, 'DNI')),
          hasCertAt: normalizeBoolean(col(row, 'CERT AT')),
          hasAfip: normalizeBoolean(col(row, 'AFIP')),
          hasCbu: normalizeBoolean(col(row, 'CBU')),
          hasAp: normalizeBoolean(col(row, 'AP')),
          hasSeguros: normalizeBoolean(col(row, 'SEG')),
          workerEmail: cleanString(col(row, 'CORREO', 'correo')),
          obsEncuadre: cleanString(col(row, 'Obs. ENCUADRE', 'OBS. ENCUADRE')),
          obsAdicionales: cleanString(col(row, 'Obs. Adicionales', 'OBS. ADICIONALES')),
          absenceReason: cleanString(col(row, 'MOTIVO AUSENCIA')),
          rejectionReason: cleanString(col(row, 'MOTIVO RECHAZO')),
          redireccionamiento: cleanString(col(row, 'REDIRECCIONAMIENTO')),
        };

        let matched: import('../../domain/entities/Encuadre').Encuadre | null = null;
        if (jobPostingId && workerPhone) {
          matched = await this.encuadreRepo.findSoftMatch(jobPostingId, workerPhone, interviewDate, recruitmentDate);
        }

        if (matched) {
          await this.encuadreRepo.updateSupplement(matched.id, supplement);
          supplemented++;
        } else {
          const dedupHash = hashEncuadre({
            caseNumber: isNaN(caseNumber) ? null : caseNumber,
            workerPhone,
            workerName,
            interviewDate: interviewDate?.toISOString().split('T')[0] ?? null,
            interviewTime,
            recruitmentDate: recruitmentDate?.toISOString().split('T')[0] ?? null,
          });

          const { created } = await this.encuadreRepo.upsert({
            workerId: modWorkerId,
            jobPostingId,
            workerRawName: workerName,
            workerRawPhone: workerPhone || null,
            occupationRaw: cleanString(col(row, 'OCUPACION', 'Ocupacion')),
            recruiterName: cleanString(col(row, 'RECLUTADOR', 'Reclutador')),
            coordinatorName: cleanString(col(row, 'COORDINADOR ASIGNADO', 'COORDINADOR\nASIGNADO')),
            recruitmentDate,
            interviewDate,
            ...supplement,
            obsReclutamiento: cleanString(col(row, 'Obs. RECLUTAMIENTO', 'OBS. RECLUTAMIENTO')),
            dedupHash,
          });

          if (created) newlyCreated++;
          else skipped++;
        }
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    progress.encuadresCreated = newlyCreated;
    progress.encuadresSkipped = skipped;
    progress.workersUpdated = supplemented;

    console.log(`[Import ${jobId}][_Mod] DONE | supplemented: ${supplemented} | new: ${newlyCreated} | skipped: ${skipped} | errors: ${progress.errors.length}`);
    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // Talent Search CSV export (ATS/CRM)
  // ex: export_2026-03-20.csv
  //
  // Colunas-chave:
  //   Nombre, Apellido, Emails, Numeros de telefono, Status,
  //   Pre screenings (casos vinculados), CUIT (longa pergunta), Ocupacion (longa pergunta)
  //
  // Fluxo:
  //   1. Upsert worker (phone/email, cuit, funnel_stage, occupation)
  //   2. Parseia "Pre screenings" para extrair case numbers
  //   3. Para cada case number: cria/encontra job_posting e upsert worker_job_application
  // ------------------------------------------------
  private async importTalentSearch(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<ImportProgress> {
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rows = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];

    const progress = makeProgress('TalentSearch', rows.length);
    console.log(`[Import ${jobId}][TalentSearch] ${rows.length} rows | sheet: "${sheetName}"`);
    logSheetColumns(`Import ${jobId}][TalentSearch`, rows);
    logFieldStats(`Import ${jobId}][TalentSearch`, rows, {
      phone:  ['Numeros de telefono'],
      email:  ['Emails'],
      status: ['Status'],
      pre:    ['Pre screenings'],
    });

    let applicationsCreated = 0;
    let applicationsSkipped = 0;

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        // ── Dados do worker ──────────────────────────────────────────────
        const firstName  = cleanString(col(row, 'Nombre'));
        const lastName   = cleanString(col(row, 'Apellido'));
        const rawPhone   = cleanString(col(row, 'Numeros de telefono', 'Números de teléfono'));
        const phone      = normalizePhoneAR(extractPrimaryPhone(rawPhone));
        const rawEmail   = cleanString(col(row, 'Emails', 'Email'));
        const email      = normalizeEmail(rawEmail);
        const cuit       = cleanString(col(
          row,
          '¿Me pasás por favor tu número de CUIT o CUIL? (Solo los 11 números, sin guiones).',
          'CUIT', 'cuit',
        ));
        const statusRaw  = cleanString(col(row, 'Status', 'STATUS')) ?? '';
        const occRaw     = cleanString(col(
          row,
          '¿Vas a brindar servicios como Acompañante Terapéutico (con certificado) o como Cuidador/a? 🤝',
          'Ocupacion', 'Tipo',
        ));
        const preScreenings = cleanString(col(row, 'Pre screenings', 'Prescreenings'));

        if (!phone && !email) {
          progress.errors.push({ row: i + 2, error: 'Sem phone e sem email — ignorado' });
          progress.processedRows++;
          if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
          continue;
        }

        const authUid = generateSecureAuthUid('talentsearch', phone, email);
        const workerEmail = email ?? `${authUid}@enlite.import`;
        const linkedinUrl = cleanString(col(row, 'Linkedin', 'LINKEDIN'));
        
        const normalizedFirstName = normalizeProperName(firstName);
        const normalizedLastName = normalizeProperName(lastName);
        const classifiedProfession = classifyProfession(occRaw);

        const { workerId, created } = await this.upsertWorker({
          authUid,
          phone: phone || undefined,
          email: workerEmail,
          documentType: cuit ? 'CUIT' : null,
          documentNumber: cuit,
          firstName: normalizedFirstName,
          lastName: normalizedLastName,
          linkedinUrl,
          occupation: normalizeOccupation(classifiedProfession),
          profession: classifiedProfession,
          country: 'AR',
          dataSource: 'talent_search',
        });

        if (created) progress.workersCreated++;
        else progress.workersUpdated++;

        // ── Pre-screenings → worker_job_applications ─────────────────────
        const caseNumbers = parseTalentSearchCaseNumbers(preScreenings);
        const appStatus = mapTalentSearchStatusToApplicationStatus(statusRaw);
        for (const caseNumber of caseNumbers) {
          try {
            let jp = await this.jobPostingRepo.findByCaseNumber(caseNumber);
            if (!jp) {
              // Cria um job posting mínimo para o caso ainda não importado
              const newJp = await this.jobPostingRepo.upsertByCaseNumber({ caseNumber, country: 'AR' });
              jp = { id: newJp.id };
              if (newJp.created) progress.casesCreated++;
            }
            const { created: appCreated } = await this.workerApplicationRepo.upsert(workerId, jp.id, 'talent_search', appStatus);
            if (appCreated) applicationsCreated++;
            else applicationsSkipped++;
          } catch (appErr) {
            console.warn(`[Import ${jobId}][TalentSearch] row ${i + 2}: application CASO ${caseNumber} falhou: ${(appErr as Error).message}`);
          }
        }
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }

      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    // encuadresCreated/Skipped reutilizados para contagem de applications
    progress.encuadresCreated = applicationsCreated;
    progress.encuadresSkipped = applicationsSkipped;

    console.log(`[Import ${jobId}][TalentSearch] DONE | workers: +${progress.workersCreated} ~${progress.workersUpdated} | casos auto-criados: ${progress.casesCreated} | applications: +${applicationsCreated} skip:${applicationsSkipped} | errors: ${progress.errors.length}`);
    if (progress.errors.length > 0) {
      console.log(`[Import ${jobId}][TalentSearch] first 5 errors:`, progress.errors.slice(0, 5));
    }
    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // Helpers
  // ------------------------------------------------
  private detectType(wb: XLSX.WorkBook, filename: string): SpreadsheetType {
    const fn = filename.toLowerCase();
    if (fn.includes('ana_care') || fn.includes('anacare') || fn.includes('ana care')) return 'ana_care';
    if (fn.includes('candidatos')) return 'candidatos';
    if (fn.includes('planilla') || fn.includes('operativa') || fn.includes('encuadre')) return 'planilla_operativa';

    // CSV files: inspeciona os headers da primeira aba para detectar Talent Search
    if (fn.endsWith('.csv') && wb.SheetNames.length > 0) {
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (firstSheet) {
        const firstRow = (XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' })[0] ?? []) as string[];
        if (
          firstRow.some(h => String(h).includes('Pre screenings')) &&
          firstRow.some(h => String(h).includes('Numeros de telefono'))
        ) {
          return 'talent_search';
        }
      }
      throw new Error(`Arquivo CSV não reconhecido — headers inesperados: ${filename}`);
    }

    const sheetNames = wb.SheetNames.map(n => n.toLowerCase());
    if (sheetNames.some(n => n.includes('_base1') || n.includes('base1'))) return 'planilla_operativa';
    if (sheetNames.some(n => n.includes('talentum'))) return 'candidatos';
    if (sheetNames.some(n => n.includes('ana care') || n.includes('anacare'))) return 'ana_care';

    throw new Error(`Tipo de planilha não reconhecido: ${filename}`);
  }

  private async upsertWorker(data: {
    authUid: string; phone?: string; email: string;
    anaCareId?: string | null;
    documentType?: 'DNI' | 'CUIT' | 'PASSPORT' | null;
    documentNumber?: string | null;
    firstName?: string | null; lastName?: string | null;
    birthDate?: Date | null; sex?: string | null;
    occupation?: string | null;
    profession?: string | null;
    linkedinUrl?: string | null;
    branchOffice?: string | null;
    country?: string;
    dataSource?: string;
  }): Promise<{ workerId: string; created: boolean }> {
    console.log(`[upsertWorker] START | phone: ${data.phone} | email: ${data.email}`);
    if (data.phone) {
      console.log(`[upsertWorker] Checking existing by phone: ${data.phone}`);
      const existing = await this.workerRepo.findByPhone(data.phone);
      if (existing.isSuccess && existing.getValue()) {
        const worker = existing.getValue()!;
        console.log(`[upsertWorker] Found existing by phone, updating worker ${worker.id}`);
        await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
        console.log(`[upsertWorker] Update complete for ${worker.id}`);
        if (data.dataSource) {
          try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
        }
        this._currentTouchedIds.push(worker.id);
        return { workerId: worker.id, created: false };
      }
    }

    console.log(`[upsertWorker] Checking existing by email: ${data.email}`);
    const existingByEmail = await this.workerRepo.findByEmail(data.email);
    if (existingByEmail.isSuccess && existingByEmail.getValue()) {
      const worker = existingByEmail.getValue()!;
      console.log(`[upsertWorker] Found existing by email, updating worker ${worker.id}`);
      await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
      console.log(`[upsertWorker] Update complete for ${worker.id}`);
      if (data.dataSource) {
        try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
      }
      this._currentTouchedIds.push(worker.id);
      return { workerId: worker.id, created: false };
    }

    // ── 3ª chave: CUIT/CUIL argentino ──────────────────────────────────────
    // Garante que o mesmo worker vindo de fontes diferentes (uma com phone,
    // outra sem phone) seja reconhecido pelo identificador fiscal, que é único.
    if (data.documentNumber && data.documentType === 'CUIT') {
      console.log(`[upsertWorker] Checking existing by CUIT: ${data.documentNumber}`);
      const existingByCuit = await this.workerRepo.findByCuit(data.documentNumber);
      if (existingByCuit.isSuccess && existingByCuit.getValue()) {
        const worker = existingByCuit.getValue()!;
        console.log(`[upsertWorker] Found existing by CUIT, updating worker ${worker.id}`);
        await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
        console.log(`[upsertWorker] Update complete for ${worker.id}`);
        if (data.dataSource) {
          try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
        }
        this._currentTouchedIds.push(worker.id);
        return { workerId: worker.id, created: false };
      }
    }

    console.log(`[upsertWorker] Creating NEW worker | authUid: ${data.authUid}`);
    const result = await this.workerRepo.create({
      authUid: data.authUid,
      email: data.email,
      phone: data.phone,
      country: data.country ?? 'AR',
    });

    if (result.isFailure) {
      console.error(`[upsertWorker] FAILED to create worker: ${result.error}`);
      throw new Error(`Falha ao criar worker: ${result.error}`);
    }

    const workerId = result.getValue().id;
    console.log(`[upsertWorker] Worker created successfully: ${workerId}`);

    // Aplica occupation após criar (overall_status já é setado em updateFromImport)
    if (data.occupation) {
      console.log(`[upsertWorker] Updating occupation for ${workerId}`);
      await this.workerRepo.updateFromImport(workerId, { occupation: data.occupation });
    }

    // Persiste todos os demais campos do import (firstName, lastName, birthDate, sex,
    // documentType/documentNumber, anaCareId, profession) que não são passados ao create().
    console.log(`[upsertWorker] Updating PII fields for ${workerId}`);
    await this.workerRepo.updateFromImport(workerId, {
      firstName: data.firstName,
      lastName: data.lastName,
      birthDate: data.birthDate,
      sex: data.sex,
      documentType: data.documentType,
      documentNumber: data.documentNumber,
      anaCareId: data.anaCareId,
      profession: data.profession,
      linkedinUrl: data.linkedinUrl,
      branchOffice: data.branchOffice,
      overallStatus: 'ACTIVE',
    });
    console.log(`[upsertWorker] PII fields updated for ${workerId}`);

    if (data.dataSource) {
      console.log(`[upsertWorker] Adding data source ${data.dataSource} for ${workerId}`);
      try { await this.workerRepo.addDataSource(workerId, data.dataSource); } catch { /* non-fatal */ }
    }

    this._currentTouchedIds.push(workerId);
    console.log(`[upsertWorker] COMPLETE | workerId: ${workerId} | created: true`);
    return { workerId, created: true };
  }

  private async flushProgress(
    jobId: string,
    progress: ImportProgress,
    onProgress?: (p: ImportProgress) => void,
  ): Promise<void> {
    await this.importJobRepo.updateProgress(jobId, {
      workersCreated: progress.workersCreated,
      workersUpdated: progress.workersUpdated,
      casesCreated: progress.casesCreated,
      casesUpdated: progress.casesUpdated,
      encuadresCreated: progress.encuadresCreated,
      encuadresSkipped: progress.encuadresSkipped,
      errorDetails: progress.errors,
    });
    onProgress?.({ ...progress });
    await new Promise<void>(resolve => setImmediate(resolve));
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

/**
 * Converte um valor de tempo do Excel para string "HH:MM".
 * No Excel, horários são frações do dia: 0.5 = 12:00, 0.583... = 14:00
 */
function formatExcelTime(raw: unknown): string | null {
  if (raw === null || raw === undefined || raw === '') return null;
  if (typeof raw === 'number') {
    const totalMinutes = Math.round(raw * 24 * 60);
    const hours = Math.floor(totalMinutes / 60) % 24;
    const minutes = totalMinutes % 60;
    return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
  }
  if (typeof raw === 'string') {
    const s = raw.trim();
    if (/^\d{1,2}:\d{2}/.test(s)) return s.slice(0, 5);
    return s || null;
  }
  return null;
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
  if (s.includes('ACOMPAÑANTE') || s.includes('AT')) return 'AT';
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
  if (s.includes('RTA RAPIDA') || s.includes('RAPIDA')) return 'active';
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

// ------------------------------------------------
// Helpers exclusivos do Talent Search
// ------------------------------------------------

/**
 * Extrai o telefone primário de uma string que pode conter múltiplos telefones
 * separados por vírgula (ex: "1168719747, +5491176195348").
 * Prioriza o número que normaliza para 13 dígitos com prefixo 549.
 */
function extractPrimaryPhone(raw: string | null): string | null {
  if (!raw) return null;
  const parts = raw.split(',').map(s => s.trim()).filter(Boolean);
  // Prefere o que normaliza para 549XXXXXXXXXX (13 dígitos)
  for (const part of parts) {
    const norm = normalizePhoneAR(part);
    if (norm.length === 13 && norm.startsWith('549')) return part;
  }
  return parts[0] ?? null;
}

/**
 * Extrai case numbers da coluna "Pre screenings".
 * Formato: "CASO 694, CASO 672, CASO 701, AT, para pacientes..."
 * Retorna somente os números (ignora texto livre não-numérico).
 */
function parseTalentSearchCaseNumbers(prescreenings: string | null): number[] {
  if (!prescreenings) return [];
  const matches = [...String(prescreenings).matchAll(/[Cc][Aa][Ss][Oo]\s+(\d+)/g)];
  const cases = matches.map(m => parseInt(m[1], 10));
  return [...new Set(cases)]; // deduplicação
}

/**
 * Mapeia o status do Talent Search ATS para application_status do banco.
 *   QUALIFIED      → approved (já qualificado para a vaga)
 *   MESSAGE_SENT   → applied (contactado, processo iniciado)
 *   IN_DOUBT       → under_review (em análise/dúvida)
 *   NOT_QUALIFIED  → rejected (não qualificou)
 */
function mapTalentSearchStatusToApplicationStatus(status: string | null): string {
  if (!status) return 'applied';
  const s = status.toUpperCase().trim();
  if (s === 'QUALIFIED') return 'approved';
  if (s === 'NOT_QUALIFIED') return 'rejected';
  if (s === 'IN_DOUBT') return 'under_review';
  return 'applied'; // MESSAGE_SENT e outros
}

/**
 * Mapeia o status do Talent Search ATS para o FunnelStage interno.
 *   QUALIFIED    → QUALIFIED  (já passou o processo)
 *   MESSAGE_SENT → PRE_TALENTUM (contactado, ainda em avaliação)
 *   IN_DOUBT     → PRE_TALENTUM (em dúvida)
 *   NOT_QUALIFIED→ PRE_TALENTUM (não qualificou — mantém na base)
 */
function normalizeFunnelStageFromTalentSearch(status: string): FunnelStage {
  if (status.toUpperCase().trim() === 'QUALIFIED') return 'QUALIFIED';
  return 'PRE_TALENTUM';
}
