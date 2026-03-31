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
import { DatabaseConnection } from '../database/DatabaseConnection';
import { WorkerRepository } from '../repositories/WorkerRepository';
import { EncuadreRepository } from '../repositories/EncuadreRepository';
import {
  BlacklistRepository,
  PublicationRepository,
  ImportJobRepository,
  JobPostingARRepository,
  WorkerApplicationRepository,
  WorkerLocationRepository,
  PlacementAuditRepository,
  CoordinatorScheduleRepository,
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
import { WorkerOccupation, ImportPhase, ImportLogLine } from '../../domain/entities/OperationalEntities';
import { ApplicationFunnelStage } from '../../domain/entities/WorkerJobApplication';
import { importEventBus } from '../services/ImportEventBus';
import type { Encuadre } from '../../domain/entities/Encuadre';
import { WorkerDeduplicationService } from '../services/WorkerDeduplicationService';
import { PatientRepository } from '../repositories/PatientRepository';
import { JobPostingEnrichmentService } from '../services/JobPostingEnrichmentService';

export type SpreadsheetType = 'ana_care' | 'candidatos' | 'planilla_operativa' | 'talent_search' | 'clickup';

/**
 * Lançada quando o AbortSignal de um job é acionado durante o import.
 * Tratada de forma distinta de erros inesperados — não gera log de erro fatal.
 */
export class ImportCancelledError extends Error {
  constructor() {
    super('Import cancelado pelo usuário');
    this.name = 'ImportCancelledError';
  }
}

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

/**
 * Busca fuzzy de coluna: tenta exact match primeiro, depois includes.
 * Útil para colunas com nomes levemente diferentes entre versões do arquivo.
 */
function colFuzzy(row: Record<string, unknown>, ...keys: string[]): unknown {
  const rowKeys = Object.keys(row);

  // FASE 1: Exact match (case-insensitive)
  for (const k of keys) {
    const target = k.toLowerCase().trim();
    for (const rowKey of rowKeys) {
      if (rowKey.toLowerCase().trim() === target) {
        const val = row[rowKey];
        if (val !== undefined && val !== null) return val;
      }
    }
  }

  // FASE 2: Includes (fuzzy)
  for (const k of keys) {
    const target = k.toLowerCase().trim();
    for (const rowKey of rowKeys) {
      if (rowKey.toLowerCase().trim().includes(target)) {
        const val = row[rowKey];
        if (val !== undefined && val !== null) return val;
      }
    }
  }

  return null;
}

/**
 * Auto-detecta a linha de header em um array de linhas brutas.
 * Busca nas primeiras 20 linhas por pelo menos 2 keywords.
 * Retorna índice 0 caso não encontre (fallback seguro).
 */
function findHeaderRow(rawData: unknown[][], keywords: string[]): number {
  for (let i = 0; i < Math.min(rawData.length, 20); i++) {
    const row = rawData[i];
    if (!row || (row as unknown[]).length === 0) continue;
    const rowStr = (row as unknown[])
      .map((c: unknown) => String(c).toLowerCase().trim())
      .join(' ');
    const matchCount = keywords.filter(kw => rowStr.includes(kw)).length;
    if (matchCount >= 2) return i;
  }
  return 0;
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
  private patientRepo = new PatientRepository();
  private importJobRepo = new ImportJobRepository();
  private workerApplicationRepo = new WorkerApplicationRepository();
  private workerLocationRepo = new WorkerLocationRepository();
  private placementAuditRepo = new PlacementAuditRepository();
  private coordinatorScheduleRepo = new CoordinatorScheduleRepository();
  private dedupService = new WorkerDeduplicationService();

  /** IDs de workers tocados (criados/atualizados) no import em curso.
   *  Populado por upsertWorker; resetado no início de cada importBuffer.
   *  Passado ao dedupService.runDeduplicationForWorkers ao final do import. */
  private _currentTouchedIds: string[] = [];

  /**
   * AbortSignal do job em curso — armazenado como campo de instância para
   * evitar threading manual pelo chain de sub-importers.
   * Seguro pois a ImportQueue garante execução serial (nunca dois imports simultâneos).
   * Checado em flushProgress após cada CHUNK_SIZE (100) linhas.
   * Latência máxima de cancelamento: ~100 linhas × tempo/linha.
   */
  private _currentSignal?: AbortSignal;

  /** Atualiza current_phase no DB e emite no bus SSE. Erros são não-fatais. */
  private async emitPhase(jobId: string, phase: ImportPhase, message?: string): Promise<void> {
    await this.importJobRepo.updatePhase(jobId, phase).catch(() => {});
    importEventBus.emit(jobId, { type: 'phase', phase, at: new Date().toISOString() });
    if (message) {
      const logLine: ImportLogLine = { ts: new Date().toISOString(), level: 'info', message };
      await this.importJobRepo.appendLog(jobId, logLine).catch(() => {});
      importEventBus.emit(jobId, { type: 'log', ...logLine });
    }
  }

  /** Persiste uma linha de log no DB e emite no bus SSE. Erros são não-fatais. */
  private async emitLog(jobId: string, level: ImportLogLine['level'], message: string): Promise<void> {
    const logLine: ImportLogLine = { ts: new Date().toISOString(), level, message };
    await this.importJobRepo.appendLog(jobId, logLine).catch(() => {});
    importEventBus.emit(jobId, { type: 'log', ...logLine });
  }

  async importBuffer(
    buffer: Buffer,
    filename: string,
    importJobId: string,
    onProgress?: (p: ImportProgress) => void,
    signal?: AbortSignal,
  ): Promise<ImportProgress[]> {
    console.log(`[Import ${importJobId}] START | filename: ${filename} | size: ${(buffer.length / 1024).toFixed(1)}KB`);

    // Reseta o tracker de workers tocados neste job
    this._currentTouchedIds = [];
    // Armazena o signal para uso em flushProgress (execução é sempre serial via ImportQueue)
    this._currentSignal = signal;

    // ── Fase: parsing ──────────────────────────────────────────────────────
    await this.emitPhase(importJobId, 'parsing', `Lendo arquivo "${filename}" (${(buffer.length / 1024).toFixed(1)}KB)...`);

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
      await this.emitLog(importJobId, 'info', `Tipo detectado: ${type} | sheets: [${workbook.SheetNames.join(', ')}]`);

      // ── Fase: importing ────────────────────────────────────────────────
      await this.emitPhase(importJobId, 'importing', `Iniciando importação (${type})...`);

      if (type === 'ana_care') {
        results.push(await this.importAnaCare(workbook, importJobId, onProgress));
      } else if (type === 'candidatos') {
        results.push(await this.importCandidatos(workbook, importJobId, onProgress));
      } else if (type === 'planilla_operativa') {
        results.push(...await this.importPlanillaOperativa(workbook, importJobId, onProgress));
      } else if (type === 'talent_search') {
        results.push(await this.importTalentSearch(workbook, importJobId, onProgress));
      } else if (type === 'clickup') {
        results.push(await this.importClickUp(workbook, importJobId, onProgress));
      } else {
        throw new Error(`Tipo de planilha não reconhecido: ${filename}`);
      }

      const rowCount = results.reduce((s, r) => s + r.processedRows, 0);
      await this.emitLog(importJobId, 'info', `${rowCount} linhas processadas`);

      // Verifica cancelamento entre fases (após loops de linhas, antes do pós-processamento)
      if (signal?.aborted) throw new ImportCancelledError();

      // ── Fase: post_processing ─────────────────────────────────────────
      await this.emitPhase(importJobId, 'post_processing', 'Linkando encuadres e blacklist por telefone...');
      console.log(`[Import ${importJobId}] linking encuadres/blacklist by phone...`);
      const linkedEnc = await this.encuadreRepo.linkWorkersByPhone();
      const linkedBl = await this.blacklistRepo.linkWorkersByPhone();
      console.log(`[Import ${importJobId}] linked: ${linkedEnc} encuadres, ${linkedBl} blacklist entries`);
      await this.emitLog(importJobId, 'info', `Linked: ${linkedEnc} encuadres, ${linkedBl} blacklist entries`);

      if (signal?.aborted) throw new ImportCancelledError();

      // ── Fase: linking ─────────────────────────────────────────────────
      await this.emitPhase(importJobId, 'linking', 'Sincronizando encuadres → worker_job_applications...');
      try {
        const synced = await this.encuadreRepo.syncToWorkerJobApplications();
        console.log(`[Import ${importJobId}] synced ${synced} encuadres → worker_job_applications`);
        await this.emitLog(importJobId, 'info', `Sincronizados ${synced} encuadres → worker_job_applications`);
      } catch (err) {
        console.error(`[Import ${importJobId}] SYNC ERROR (non-fatal):`, (err as Error).message);
        await this.emitLog(importJobId, 'warn', `Sync error (non-fatal): ${(err as Error).message}`);
      }

      // ── Fase: dedup ───────────────────────────────────────────────────
      const touchedIds = [...new Set(this._currentTouchedIds)];
      if (touchedIds.length > 0) {
        await this.emitPhase(importJobId, 'dedup', `Deduplicando ${touchedIds.length} workers tocados...`);
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
          await this.emitLog(importJobId, 'info', `Dedup: ${dedupReport.mergesExecuted} merges, ${dedupReport.errors} erros`);
        } catch (err) {
          console.error(`[Import ${importJobId}] DEDUP ERROR (non-fatal):`, (err as Error).message);
          await this.emitLog(importJobId, 'warn', `Dedup error (non-fatal): ${(err as Error).message}`);
        }
      }

      const totals = {
        workersCreated:   results.reduce((s, r) => s + r.workersCreated, 0),
        workersUpdated:   results.reduce((s, r) => s + r.workersUpdated, 0),
        casesCreated:     results.reduce((s, r) => s + r.casesCreated, 0),
        casesUpdated:     results.reduce((s, r) => s + r.casesUpdated, 0),
        encuadresCreated: results.reduce((s, r) => s + r.encuadresCreated, 0),
        encuadresSkipped: results.reduce((s, r) => s + r.encuadresSkipped, 0),
        errorDetails:     results.flatMap(r => r.errors),
      };

      // ── Fase: done ────────────────────────────────────────────────────
      await this.emitPhase(importJobId, 'done',
        `Import concluído: +${totals.workersCreated} workers, +${totals.encuadresCreated} encuadres, ${totals.errorDetails.length} erros`);
      await this.importJobRepo.updateStatus(importJobId, 'done');
      await this.importJobRepo.updateProgress(importJobId, totals);

      console.log(`[Import ${importJobId}] DONE | workers: +${totals.workersCreated} ~${totals.workersUpdated} | cases: +${totals.casesCreated} ~${totals.casesUpdated} | encuadres: +${totals.encuadresCreated} skipped:${totals.encuadresSkipped} | errors: ${totals.errorDetails.length}`);
      if (totals.errorDetails.length > 0) {
        console.log(`[Import ${importJobId}] first 10 errors:`, totals.errorDetails.slice(0, 10));
      }

      for (const errDetail of totals.errorDetails.slice(0, 20)) {
        await this.emitLog(importJobId, 'warn', `Linha ${errDetail.row}: ${errDetail.error}`);
      }
    } catch (err) {
      if (err instanceof ImportCancelledError) {
        // Deixa o ImportQueue.doRun gerenciar o estado 'cancelled' no DB e bus
        throw err;
      }
      console.error(`[Import ${importJobId}] FATAL ERROR:`, (err as Error).message);
      // emitPhase sem mensagem (fase 'error') + emitLog com level correto para aparecer nos logs
      await this.emitPhase(importJobId, 'error');
      await this.emitLog(importJobId, 'error', `Erro fatal: ${(err as Error).message}`);
      await this.importJobRepo.updateStatus(importJobId, 'error');
      throw err;
    } finally {
      this._currentSignal = undefined;
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
  // ClickUp Export → clickup_cases table
  // Colunas esperadas: Task Type, Task ID, Task Name, Status/Estado, Priority,
  //   Caso Número (number), Diagnóstico, Zona o Barrio Paciente,
  //   Perfil del Prestador Buscado, Días y Horarios, Date Created, Date Updated, etc.
  // ------------------------------------------------
  private async importClickUp(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheetName = wb.SheetNames[0];
    const sheet = wb.Sheets[sheetName];
    const rawData = XLSX.utils.sheet_to_json<unknown[]>(sheet, { header: 1, defval: '' });

    // Auto-detecta linha de header buscando "Task Type" ou "task type"
    let headerIdx = -1;
    for (let i = 0; i < Math.min(rawData.length, 20); i++) {
      const row = rawData[i] as unknown[];
      if (row && String(row[0]).trim().toLowerCase() === 'task type') {
        headerIdx = i;
        break;
      }
    }

    if (headerIdx === -1) {
      throw new Error('ClickUp: header row não encontrado (esperado "Task Type" na coluna A)');
    }

    const headers = (rawData[headerIdx] as unknown[]).map(h => String(h).trim().toLowerCase());
    const rows: Record<string, string>[] = [];

    for (let i = headerIdx + 1; i < rawData.length; i++) {
      const row = rawData[i] as unknown[];
      if (!row || row.length === 0) continue;

      const obj: Record<string, string> = {};
      headers.forEach((h, idx) => {
        if (h) obj[h] = String(row[idx] ?? '').trim();
      });

      // Só processa linhas do tipo "task" — ignora seções, pastas e headers duplicados
      const taskType = (obj['task type'] ?? '').toLowerCase().trim();
      if (taskType !== 'task') continue;

      rows.push(obj);
    }

    const progress = makeProgress(sheetName, rows.length);
    console.log(`[Import ${jobId}][ClickUp] ${rows.length} rows para processar`);

    // Usa jobPostingRepo — job_postings é a fonte de verdade das vacantes.
    // upsertFromClickUp incrementa os campos do ClickUp sem sobrescrever
    // dados de outras fontes (planilla operativa, etc.).

    // IDs com perfil de texto que precisam de enriquecimento LLM após o loop
    const toEnrich: string[] = [];

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const casoNumRaw = cleanString(col(row, 'caso número (number)', 'caso numero', 'caso número', 'case number'));
        if (!casoNumRaw) {
          progress.errors.push({ row: i + headerIdx + 2, error: 'Número de caso ausente' });
          continue;
        }

        const caseNumber = Math.floor(parseFloat(casoNumRaw));
        if (isNaN(caseNumber) || caseNumber <= 0) {
          progress.errors.push({ row: i + headerIdx + 2, error: `Número de caso inválido: ${casoNumRaw}` });
          continue;
        }

        // Normaliza status: remove acentos e converte para maiúsculas
        let status = cleanString(col(row, 'estado', 'status')) ?? '';
        status = status.normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase();

        // Columns with type suffix in ClickUp export (e.g. 'Zona o Barrio Paciente (short text)')
        // colFuzzy handles both exact and partial matching.
        const taskId        = cleanString(colFuzzy(row, 'task id'));
        const lastComment   = cleanString(colFuzzy(row, 'latest comment', 'last comment'));
        const commentCountRaw = cleanString(colFuzzy(row, 'comment count'));
        const commentCount  = commentCountRaw ? parseInt(commentCountRaw, 10) : null;
        const safeCommentCount = (commentCount !== null && !isNaN(commentCount)) ? commentCount : null;

        const weeklyHoursRaw   = cleanString(colFuzzy(row, 'horas semanales'));
        const weeklyHours      = weeklyHoursRaw ? parseFloat(weeklyHoursRaw) : null;
        const activeProvsRaw   = cleanString(colFuzzy(row, 'q prestadores activos'));
        const activeProviders  = activeProvsRaw ? parseInt(activeProvsRaw, 10) : null;

        // ── 1. Upsert patient ─────────────────────────────────────────────
        let patientId: string | null = null;
        if (taskId) {
          const parseBool = (v: unknown): boolean | null => {
            const s = String(v ?? '').trim().toLowerCase();
            if (s === 'true' || s === '1' || s === 'yes' || s === 'si' || s === 'sí') return true;
            if (s === 'false' || s === '0' || s === 'no') return false;
            return null;
          };

          // Build addresses array — only include entries with at least one value
          const addresses = [
            {
              addressType:      'primary',
              addressFormatted: cleanString(colFuzzy(row, 'domicilio 1 principal paciente')),
              addressRaw:       cleanString(colFuzzy(row, 'domicilio informado paciente 1')),
              displayOrder:     1,
            },
            {
              addressType:      'secondary',
              addressFormatted: cleanString(colFuzzy(row, 'domicilio 2 paciente')),
              addressRaw:       cleanString(colFuzzy(row, 'domicilio informado paciente 2')),
              displayOrder:     2,
            },
            {
              addressType:      'tertiary',
              addressFormatted: null,
              addressRaw:       cleanString(colFuzzy(row, 'domicilio informado paciente 3')),
              displayOrder:     3,
            },
          ].filter(a => a.addressFormatted || a.addressRaw);

          // Build professionals array — ordered 1, 2, 3 + multidisciplinary team
          // Use col() with exact keys (headers are already lowercased) to avoid fuzzy
          // false-positives (e.g. 'email profesional tratante principal' also contains
          // 'profesional tratante principal' as a substring).
          const professionals = [
            {
              name:         cleanString(col(row, 'profesional tratante principal (short text)')),
              phone:        cleanString(col(row, 'tel profesional tratante principal (phone)')),
              email:        cleanString(col(row, 'email profesional tratante principal (email)')),
              displayOrder: 1,
              isTeam:       false,
            },
            {
              name:         cleanString(col(row, 'profesional tratante 2 (short text)')),
              phone:        cleanString(col(row, 'tel profesional tratante 2 (phone)')),
              email:        cleanString(col(row, 'email profesional tratante 2 (email)')),
              displayOrder: 2,
              isTeam:       false,
            },
            {
              name:         cleanString(col(row, 'profesional tratante 3 (short text)')),
              phone:        cleanString(col(row, 'tel profesional tratante 3 (phone)')),
              email:        cleanString(col(row, 'email profesional tratante 3 (email)')),
              displayOrder: 3,
              isTeam:       false,
            },
            {
              name:         cleanString(col(row, 'equipo tratante multidisciplinario (drop down)')),
              phone:        null,
              email:        null,
              displayOrder: 4,
              isTeam:       true,
            },
          ].filter((p): p is typeof p & { name: string } => !!p.name);

          const { id } = await this.patientRepo.upsertFromClickUp({
            clickupTaskId: taskId,
            firstName:     cleanString(colFuzzy(row, 'nombre de paciente', 'nombre paciente')),
            lastName:      cleanString(colFuzzy(row, 'apellido del paciente', 'apellido paciente')),
            birthDate:     parseExcelDate(colFuzzy(row, 'fecha de nacimiento')),
            documentType:  cleanString(colFuzzy(row, 'tipo de documento paciente')),
            documentNumber: cleanString(colFuzzy(row, 'número de documento paciente', 'numero de documento paciente')),
            affiliateId:   cleanString(colFuzzy(row, 'número id afiliado paciente', 'id afiliado')),
            sex:           cleanString(colFuzzy(row, 'sexo asignado al nacer')),
            phoneWhatsapp: cleanString(colFuzzy(row, 'número de whatsapp paciente', 'numero whatsapp paciente')),
            // Clinical
            diagnosis:         cleanString(colFuzzy(row, 'diagnóstico', 'diagnostico')),
            dependencyLevel:   cleanString(colFuzzy(row, 'dependencia')),
            clinicalSegments:  cleanString(colFuzzy(row, 'segmentos clínicos', 'segmentos clinicos')),
            serviceType:       cleanString(colFuzzy(row, 'servicio')),
            deviceType:        cleanString(colFuzzy(row, 'tipo de dispositivo')),
            additionalComments: cleanString(colFuzzy(row, 'comentarios adicionales paciente')),
            hasJudicialProtection: parseBool(colFuzzy(row, 'amparo judicial')),
            hasCud:    parseBool(colFuzzy(row, 'posee cud')),
            hasConsent: parseBool(colFuzzy(row, 'consentimiento')),
            // Insurance
            insuranceInformed: cleanString(colFuzzy(row, 'cobertura informada')),
            insuranceVerified: cleanString(colFuzzy(row, 'cobertura verificada')),
            // General location (kept on patient for quick matching)
            cityLocality:    cleanString(colFuzzy(row, 'ciudad / localidad del paciente', 'ciudad localidad')),
            province:        cleanString(colFuzzy(row, 'provincia del paciente', 'provincia')),
            zoneNeighborhood: cleanString(colFuzzy(row, 'zona o barrio paciente', 'zona barrio')),
            // Responsible
            responsibleFirstName:   cleanString(colFuzzy(row, 'nombre de responsable')),
            responsibleLastName:    cleanString(colFuzzy(row, 'apellido del responsable')),
            responsibleRelationship: cleanString(colFuzzy(row, 'relación con el paciente', 'relacion con el paciente')),
            responsiblePhone:       cleanString(colFuzzy(row, 'número de whatsapp responsable', 'numero whatsapp responsable')),
            responsibleDocumentType: cleanString(colFuzzy(row, 'tipo de documento responsable')),
            responsibleDocumentNumber: cleanString(colFuzzy(row, 'número do documento responsable')),
            // Normalized relations
            addresses,
            professionals,
            country: 'AR',
          });
          patientId = id;
        }

        // ── 2. Upsert job_posting with patient link and new fields ────────
        const { id: jobPostingId, created } = await this.jobPostingRepo.upsertFromClickUp({
          caseNumber,
          clickupTaskId:       taskId,
          status,
          priority:            cleanString(colFuzzy(row, 'priority', 'prioridad')),
          workerProfileSought: cleanString(colFuzzy(row, 'perfil del prestador buscado')),
          scheduleDaysHours:   cleanString(colFuzzy(row, 'días y horarios de acompañamiento', 'dias y horarios')),
          sourceCreatedAt:     parseExcelDate(colFuzzy(row, 'date created')),
          sourceUpdatedAt:     parseExcelDate(colFuzzy(row, 'date updated')),
          dueDate:             parseExcelDate(colFuzzy(row, 'due date')),
          searchStartDate:     parseExcelDate(colFuzzy(row, 'inicio búsqueda', 'inicio busqueda')),
          lastComment,
          commentCount:        safeCommentCount,
          assignee:            cleanString(colFuzzy(row, 'assignee')),
          description:         cleanString(colFuzzy(row, 'task content')),
          patientId,
          weeklyHours:         (!weeklyHours || isNaN(weeklyHours)) ? null : weeklyHours,
          providersNeeded:     cleanString(colFuzzy(row, 'q prestadores necesarios')),
          activeProviders:     (!activeProviders || isNaN(activeProviders)) ? null : activeProviders,
          authorizedPeriod:    parseExcelDate(colFuzzy(row, 'período autorizado', 'periodo autorizado')),
          marketingChannel:    cleanString(colFuzzy(row, 'canales de marketing')),
          // Endereço de atendimento — Domicilio 1 Principal é o local da vaga
          serviceAddressFormatted: cleanString(colFuzzy(row, 'domicilio 1 principal paciente')),
          serviceAddressRaw:       cleanString(colFuzzy(row, 'domicilio informado paciente 1')),
          country:             'AR',
        });

        // ── 3. Save comment history if changed ───────────────────────────
        if (lastComment) {
          await this.jobPostingRepo.saveCommentIfNew({
            jobPostingId,
            commentText:  lastComment,
            commentCount: safeCommentCount,
          });
        }

        // Collect for LLM enrichment if there is profile text
        const profileText = cleanString(colFuzzy(row, 'perfil del prestador buscado'));
        if (profileText) toEnrich.push(jobPostingId);

        if (created) progress.casesCreated++;
        else progress.casesUpdated++;
      } catch (err) {
        progress.errors.push({ row: i + headerIdx + 2, error: (err as Error).message });
      }

      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) {
        await this.flushProgress(jobId, progress, onProgress);
      }
    }

    console.log(
      `[Import ${jobId}][ClickUp] DONE | created: ${progress.casesCreated}` +
      ` | updated: ${progress.casesUpdated} | errors: ${progress.errors.length}`
    );
    onProgress?.(progress);

    // Fire LLM enrichment in background for job postings that need it
    // (llm_enriched_at IS NULL = new or profile text changed since last enrich)
    if (toEnrich.length > 0) {
      console.log(`[Import ${jobId}][ClickUp] Agendando enriquecimento LLM para ${toEnrich.length} job postings: [${toEnrich.join(', ')}]`);
      setImmediate(async () => {
        let enrichmentService: JobPostingEnrichmentService;
        try {
          enrichmentService = new JobPostingEnrichmentService();
        } catch (err) {
          console.error(`[Import ${jobId}][ClickUp] ERRO ao instanciar JobPostingEnrichmentService (GROQ_API_KEY ausente?):`, (err as Error).message);
          return;
        }
        let enriched = 0;
        for (const id of toEnrich) {
          console.log(`[Import ${jobId}][ClickUp] Processando enriquecimento ${enriched + 1}/${toEnrich.length}: ID ${id}`);
          try {
            const ran = await enrichmentService.enrichIfNeeded(id);
            if (ran) {
              enriched++;
              console.log(`[Import ${jobId}][ClickUp] Enriquecimento OK para ID ${id} (${enriched}/${toEnrich.length})`);
              await new Promise(r => setTimeout(r, 2100)); // ~28 req/min, below Groq free limit
            }
          } catch (err) {
            console.error(`[Import ${jobId}][ClickUp] ERRO no enriquecimento para ID ${id}:`, (err as Error).message);
            console.error(`[Import ${jobId}][ClickUp] Stack:`, (err as Error).stack);
          }
        }
        console.log(`[Import ${jobId}][ClickUp] Enriquecimento LLM concluído: ${enriched}/${toEnrich.length} enriquecidos`);
      });
    }

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

    // Auditoria pós-alocação (rating 1–5 por worker alocado)
    results.push(await this.importAuditoriaOnboarding(wb, jobId, onProgress));

    // Horas semanais por coordenadora (capacidade operacional)
    results.push(await this.importHorasSemanales(wb, jobId, onProgress));

    return results;
  }

  // ------------------------------------------------
  // importAuditoriaOnboarding
  // Aba _AuditoriaOnboarding: avaliação pós-alocação (Calificación 1–5).
  // É o único feedback estruturado de qualidade do worker em serviço.
  // Chave de dedup: audit_id (--1, --2, ...) — idempotente em re-imports.
  // ------------------------------------------------
  private async importAuditoriaOnboarding(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_AuditoriaOnboarding'] ?? wb.Sheets['AuditoriaOnboarding'] ?? wb.Sheets['_Auditoria'];
    const progress = makeProgress('_AuditoriaOnboarding', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_AuditoriaOnboarding] sheet NOT FOUND — pulando`);
      return progress;
    }

    const rows = normalizedRows(sheet);
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_AuditoriaOnboarding] ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][_AuditoriaOnboarding`, rows);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const auditId = cleanString(col(row, '--', 'ID', 'ORDEN', 'N°', 'Nro'));
        if (!auditId) continue;

        const caseNumberRaw = parseInt(String(col(row, 'CASO', 'Caso') ?? '').trim());
        const workerRawName = cleanString(col(row, 'NOMBRE Y APELLIDO', 'Nombre y Apellido', 'AT', 'WORKER'));
        const patientRawName = cleanString(col(row, 'PACIENTE', 'Paciente', 'NOMBRE PACIENTE'));
        const coordinatorName = cleanString(col(row, 'COORDINADOR', 'Coordinador', 'COORD'));
        const auditDate = parseExcelDate(col(row, 'FECHA', 'Fecha', 'FECHA AUDITORIA'));
        const ratingRaw = col(row, 'CALIFICACION', 'Calificación', 'CALIFICACIÓN', 'RATING', 'NOTA');
        const rating = ratingRaw !== null ? parseInt(String(ratingRaw)) : null;
        const observations = cleanString(col(row, 'OBSERVACIONES', 'Observaciones', 'OBS'));

        let jobPostingId: string | null = null;
        if (!isNaN(caseNumberRaw)) {
          const jp = await this.jobPostingRepo.findByCaseNumber(caseNumberRaw);
          jobPostingId = jp?.id ?? null;
        }

        const { created } = await this.placementAuditRepo.upsert({
          auditId,
          auditDate,
          jobPostingId,
          workerRawName,
          patientRawName,
          coordinatorName,
          caseNumberRaw: isNaN(caseNumberRaw) ? null : caseNumberRaw,
          rating: rating !== null && !isNaN(rating) && rating >= 1 && rating <= 5 ? rating : null,
          observations,
        });

        if (created) progress.encuadresCreated++;
        else progress.encuadresSkipped++;
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    // Tenta linkar job_postings por case_number (para auditorias sem jobPostingId)
    await this.placementAuditRepo.linkJobPostingsByCaseNumber();

    console.log(`[Import ${jobId}][_AuditoriaOnboarding] DONE | created: ${progress.encuadresCreated} | skipped: ${progress.encuadresSkipped} | errors: ${progress.errors.length}`);
    onProgress?.(progress);
    return progress;
  }

  // ------------------------------------------------
  // importHorasSemanales
  // Aba _HorasSemanales: horas semanais de cada coordenadora por período.
  // Informa capacidade operacional — coordenadora com 3h/semana não pode
  // gerenciar muitos casos. Chave de dedup: (name, from_date, to_date).
  // ------------------------------------------------
  private async importHorasSemanales(
    wb: XLSX.WorkBook,
    jobId: string,
    onProgress?: (p: ImportProgress) => void
  ): Promise<ImportProgress> {
    const sheet = wb.Sheets['_HorasSemanales'] ?? wb.Sheets['HorasSemanales'] ?? wb.Sheets['_Horas'];
    const progress = makeProgress('_HorasSemanales', 0);
    if (!sheet) {
      console.warn(`[Import ${jobId}][_HorasSemanales] sheet NOT FOUND — pulando`);
      return progress;
    }

    const rows = normalizedRows(sheet);
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_HorasSemanales] ${rows.length} rows`);
    logSheetColumns(`Import ${jobId}][_HorasSemanales`, rows);

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const coordinatorName = cleanString(col(row, 'COORDINADOR', 'Coordinador', 'NOMBRE', 'Nombre'));
        if (!coordinatorName) continue;

        const fromDate = parseExcelDate(col(row, 'DESDE', 'Desde', 'FECHA INICIO', 'FROM'));
        const toDate = parseExcelDate(col(row, 'HASTA', 'Hasta', 'FECHA FIN', 'TO'));
        if (!fromDate || !toDate) continue;

        const weeklyHoursRaw = col(row, 'HORAS', 'Horas', 'HORAS SEMANALES', 'HS');
        const weeklyHours = weeklyHoursRaw !== null ? parseFloat(String(weeklyHoursRaw)) : null;
        const coordinatorDni = cleanString(col(row, 'DNI', 'Dni'));

        const { created } = await this.coordinatorScheduleRepo.upsert({
          coordinatorName,
          coordinatorDni,
          fromDate,
          toDate,
          weeklyHours: weeklyHours !== null && !isNaN(weeklyHours) ? weeklyHours : null,
        });

        if (created) progress.workersCreated++;
        else progress.workersUpdated++;
      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }
      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    console.log(`[Import ${jobId}][_HorasSemanales] DONE | created: ${progress.workersCreated} | updated: ${progress.workersUpdated} | errors: ${progress.errors.length}`);
    onProgress?.(progress);
    return progress;
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

        // dependency_level removed from job_postings (migration 080) — lives in patients table
        const { created } = await this.jobPostingRepo.upsertByCaseNumber({
          caseNumber,
          status: normalizeJobStatus(cleanString(col(row, 'ESTADO', 'Estado'))),
          priority: normalizePriority(cleanString(col(row, 'PRIORIDAD', 'Prioridad'))),
          isCovered: normalizeBoolean(col(row, 'Está acompañada?', 'ESTA ACOMPAÑADA', 'Esta acompanada')) ?? false,
          coordinatorName: cleanString(col(row, 'COORDINADOR', 'Coordinador')),
          dailyObs: cleanString(col(row, 'OBSERVACIONES', 'Observaciones', 'OBS', 'obs')),
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

    const rows = normalizedRows(sheet);
    progress.totalRows = rows.length;
    console.log(`[Import ${jobId}][_Base1] ${rows.length} rows — building caches...`);
    logSheetColumns(`Import ${jobId}][_Base1`, rows);

    // ── Pre-load caches: 2 DB calls instead of 2 per row ──────────────────
    const workerCache = await this.buildWorkerPhoneCache();
    const jpCache = await this.buildJobPostingCaseCache();
    console.log(`[Import ${jobId}][_Base1] cache: ${workerCache.size} workers, ${jpCache.size} job_postings — starting bulk import`);

    const BULK_SIZE = 500;
    const encuadreBatch: import('../../domain/entities/Encuadre').CreateEncuadreDTO[] = [];

    const flushBatch = async () => {
      if (encuadreBatch.length === 0) return;
      const raw = encuadreBatch.splice(0, encuadreBatch.length);
      // Deduplicate by dedupHash — PostgreSQL rejects batches with duplicate conflict keys
      const seen = new Map<string, typeof raw[0]>();
      for (const dto of raw) seen.set(dto.dedupHash, dto);
      const batch = Array.from(seen.values());
      try {
        const { created, updated } = await this.encuadreRepo.bulkUpsert(batch);
        progress.encuadresCreated += created;
        progress.encuadresSkipped += updated;
      } catch (err) {
        progress.errors.push({ row: -1, error: `bulk upsert: ${(err as Error).message}` });
      }
    };

    for (let i = 0; i < rows.length; i++) {
      const row = rows[i];
      try {
        const caseNumber = parseInt(String(col(row, 'CASO', 'Caso') ?? '').trim());
        const workerPhone = normalizePhoneAR(cleanString(col(row, 'TELEFONO', 'Teléfono')));
        const workerName = cleanString(col(row, 'NOMBRE Y APELLIDO', 'Nombre y Apellido'));
        const recruitmentDate = parseExcelDate(col(row, 'FECHA RECLUTAMIENTO', 'FECHA\nRECLUTAMIENTO'));
        const interviewDate = parseExcelDate(col(row, 'FECHA ENCUADRE', 'FECHA\nENCUADRE'));
        const interviewTime = formatExcelTime(col(row, 'HORA ENCUADRE', 'HORA\nENCUADRE'));

        const dedupHash = hashEncuadre({
          caseNumber: isNaN(caseNumber) ? null : caseNumber,
          workerPhone,
          workerName,
          interviewDate: interviewDate?.toISOString().split('T')[0] ?? null,
          interviewTime,
          recruitmentDate: recruitmentDate?.toISOString().split('T')[0] ?? null,
        });

        // ── job_posting: cache lookup first, DB only on miss ──────────────
        let jobPostingId: string | null = null;
        if (!isNaN(caseNumber)) {
          jobPostingId = jpCache.get(caseNumber) ?? null;
          if (!jobPostingId) {
            const c = await this.jobPostingRepo.upsertByCaseNumber({ caseNumber, country: 'AR' });
            jobPostingId = c.id;
            jpCache.set(caseNumber, c.id);
            if (c.created) progress.casesCreated++;
          }
        }

        // ── worker: cache lookup first, DB only on miss ───────────────────
        let workerId: string | null = null;
        if (workerPhone || workerName) {
          try {
            workerId = (workerPhone ? workerCache.get(workerPhone) : undefined) ?? null;
            if (!workerId) {
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
              if (workerPhone) workerCache.set(workerPhone, wid);
              if (wCreated) progress.workersCreated++;
              else progress.workersUpdated++;
            }
          } catch (wErr) {
            progress.errors.push({ row: i + 2, error: `worker: ${(wErr as Error).message}` });
          }
        }

        encuadreBatch.push({
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
          rejectionReason: normalizeRejectionReason(cleanString(col(row, 'MOTIVO RECHAZO', 'MOTIVO DE RECHAZO'))),
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

        if (encuadreBatch.length >= BULK_SIZE) await flushBatch();

      } catch (err) {
        progress.errors.push({ row: i + 2, error: (err as Error).message });
      }

      progress.processedRows++;
      if (progress.processedRows % CHUNK_SIZE === 0) await this.flushProgress(jobId, progress, onProgress);
    }

    await flushBatch();

    console.log(`[Import ${jobId}][_Base1] DONE | encuadres created: ${progress.encuadresCreated} | updated: ${progress.encuadresSkipped} | cases auto-created: ${progress.casesCreated} | errors: ${progress.errors.length}`);
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

        const geoZone = inferGeographicZone(groupName);

        const { created } = await (this.publicationRepo.upsert as Function)({
          jobPostingId,
          channel,
          groupName,
          recruiterName: recruiter,
          publishedAt,
          observations: cleanString(col(row, 'Observaciones', 'OBSERVACIONES', 'obs')),
          groupGeographicZone: geoZone,
          dedupHash,
        });

        // Retroalimenta inferred_zone no job_posting se inferimos a zona
        if (geoZone && jobPostingId) {
          await this.jobPostingRepo.upsertByCaseNumber({
            caseNumber: isNaN(caseNumber) ? -1 : caseNumber,
            inferredZone: geoZone,
            country: 'AR',
          }).catch(() => { /* não bloqueia se falhar */ });
        }

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
            rejectionReason: normalizeRejectionReason(cleanString(col(row, 'MOTIVO RECHAZO', 'MOTIVO DE RECHAZO'))),
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
          rejectionReason: normalizeRejectionReason(cleanString(col(row, 'MOTIVO RECHAZO', 'MOTIVO DE RECHAZO'))),
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
        let workerId: string;
        let created: boolean;
        
        try {
          const result = await this.upsertWorker({
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
          workerId = result.workerId;
          created = result.created;
        } catch (upsertErr: any) {
          // Se falhou por email duplicado, buscar o worker existente pelo email
          if (upsertErr.message?.includes('workers_email_key') || upsertErr.message?.includes('duplicate key')) {
            const existingByEmail = await this.workerRepo.findByEmail(workerEmail);
            if (existingByEmail.isSuccess && existingByEmail.getValue()) {
              workerId = existingByEmail.getValue()!.id;
              created = false;
              console.warn(`[Import ${jobId}][TalentSearch] row ${i + 2}: Email duplicado ${workerEmail}, usando worker existente ${workerId}`);
            } else {
              throw upsertErr;
            }
          } else {
            throw upsertErr;
          }
        }

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

    // ClickUp: nome do arquivo contém "clickup" OU primeira célula é "Task Type"
    if (fn.includes('clickup')) return 'clickup';
    if (wb.SheetNames.length > 0) {
      const firstSheet = wb.Sheets[wb.SheetNames[0]];
      if (firstSheet) {
        const sample = XLSX.utils.sheet_to_json<unknown[]>(firstSheet, { header: 1, defval: '' });
        for (let i = 0; i < Math.min(sample.length, 5); i++) {
          const row = sample[i] as unknown[];
          if (row && String(row[0]).trim().toLowerCase() === 'task type') return 'clickup';
        }
      }
    }

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

  /** Carrega todos os workers com phone em memória: Map<phone, workerId> */
  private async buildWorkerPhoneCache(): Promise<Map<string, string>> {
    const pool = DatabaseConnection.getInstance().getPool();
    const result = await pool.query('SELECT id, phone FROM workers WHERE phone IS NOT NULL');
    const cache = new Map<string, string>();
    for (const row of result.rows) cache.set(row.phone as string, row.id as string);
    return cache;
  }

  /** Carrega todos os job_postings com case_number em memória: Map<caseNumber, jpId> */
  private async buildJobPostingCaseCache(): Promise<Map<number, string>> {
    const pool = DatabaseConnection.getInstance().getPool();
    const result = await pool.query('SELECT id, case_number FROM job_postings WHERE case_number IS NOT NULL AND deleted_at IS NULL');
    const cache = new Map<number, string>();
    for (const row of result.rows) cache.set(Number(row.case_number), row.id as string);
    return cache;
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
    if (data.phone) {
      const existing = await this.workerRepo.findByPhone(data.phone);
      if (existing.isSuccess && existing.getValue()) {
        const worker = existing.getValue()!;
        await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
        if (data.dataSource) {
          try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
        }
        this._currentTouchedIds.push(worker.id);
        return { workerId: worker.id, created: false };
      }
    }

    const existingByEmail = await this.workerRepo.findByEmail(data.email);
    if (existingByEmail.isSuccess && existingByEmail.getValue()) {
      const worker = existingByEmail.getValue()!;
      await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
      if (data.dataSource) {
        try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
      }
      this._currentTouchedIds.push(worker.id);
      return { workerId: worker.id, created: false };
    }

    // ── 3ª chave: CUIT/CUIL argentino ──────────────────────────────────────
    if (data.documentNumber && data.documentType === 'CUIT') {
      const existingByCuit = await this.workerRepo.findByCuit(data.documentNumber);
      if (existingByCuit.isSuccess && existingByCuit.getValue()) {
        const worker = existingByCuit.getValue()!;
        await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
        if (data.dataSource) {
          try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
        }
        this._currentTouchedIds.push(worker.id);
        return { workerId: worker.id, created: false };
      }
    }

    const result = await this.workerRepo.create({
      authUid: data.authUid,
      email: data.email,
      phone: data.phone,
      country: data.country ?? 'AR',
    });

    if (result.isFailure) {
      const errorMsg = result.error || 'Unknown error';
      console.log(`[upsertWorker] Create failed: ${errorMsg}`);
      
      // Se falhou por email duplicado, tentar encontrar o worker existente
      if (errorMsg.includes('workers_email_key') || errorMsg.includes('duplicate key')) {
        console.warn(`[upsertWorker] Email duplicado detectado, buscando worker existente: ${data.email}`);
        const existingByEmail = await this.workerRepo.findByEmail(data.email);
        console.log(`[upsertWorker] findByEmail result: success=${existingByEmail.isSuccess}, found=${!!existingByEmail.getValue()}`);
        
        if (existingByEmail.isSuccess && existingByEmail.getValue()) {
          const worker = existingByEmail.getValue()!;
          console.log(`[upsertWorker] Worker encontrado via email: ${worker.id}, atualizando...`);
          await this.workerRepo.updateFromImport(worker.id, { ...data, email: data.email });
          if (data.dataSource) {
            try { await this.workerRepo.addDataSource(worker.id, data.dataSource); } catch { /* non-fatal */ }
          }
          this._currentTouchedIds.push(worker.id);
          return { workerId: worker.id, created: false };
        } else {
          console.error(`[upsertWorker] findByEmail não encontrou worker com email: ${data.email}`);
        }
      }
      console.error(`[upsertWorker] FAILED to create worker: ${errorMsg}`);
      throw new Error(`Falha ao criar worker: ${errorMsg}`);
    }

    const workerId = result.getValue().id;

    if (data.occupation) {
      await this.workerRepo.updateFromImport(workerId, { occupation: data.occupation });
    }

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
    });

    if (data.dataSource) {
      try { await this.workerRepo.addDataSource(workerId, data.dataSource); } catch { /* non-fatal */ }
    }

    this._currentTouchedIds.push(workerId);
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
    // Cede o event loop antes de checar o signal (CHUNK_SIZE = 100 linhas por janela)
    await new Promise<void>(resolve => setImmediate(resolve));
    if (this._currentSignal?.aborted) throw new ImportCancelledError();
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
    const match = s.match(/^(\d{1,2}):(\d{2})/);
    if (match) {
      const h = String(parseInt(match[1])).padStart(2, '0');
      return `${h}:${match[2]}`;
    }
    return null;
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
  // Valores diretos do novo enum
  if (s === 'AT') return 'AT';
  if (s === 'CAREGIVER') return 'CAREGIVER';
  if (s === 'NURSE') return 'NURSE';
  if (s === 'KINESIOLOGIST') return 'KINESIOLOGIST';
  if (s === 'PSYCHOLOGIST') return 'PSYCHOLOGIST';
  // Mapeamento de valores legacy em espanhol/português
  if (s === 'CUIDADOR' || s === 'CARER') return 'CAREGIVER';
  if (s === 'ENFERMERO' || s === 'ENFERMERA' || s === 'ENFERMEIRO') return 'NURSE';
  if (s === 'KINESIOLOGO' || s === 'KINESIÓLOGA' || s === 'FISIOTERAPEUTA') return 'KINESIOLOGIST';
  if (s === 'PSICOLOGO' || s === 'PSICÓLOGA' || s === 'PSYCHOLOGA') return 'PSYCHOLOGIST';
  // Legacy: BOTH/AMBOS/STUDENT não existem mais — mapear para null
  if (s === 'BOTH' || s === 'AMBOS' || s === 'STUDENT' || s === 'ESTUDANTE' || s === 'ESTUDIANTE') return null;
  // Padrões de texto livre
  if (s.includes('CUIDADOR') || s.includes('CARER')) return 'CAREGIVER';
  if (s.includes('ENFERM')) return 'NURSE';
  if (s.includes('KINESIO') || s.includes('FISIO')) return 'KINESIOLOGIST';
  if (s.includes('PSICOL') || s.includes('PSYCHO')) return 'PSYCHOLOGIST';
  if (s.includes('ACOMPAÑANTE') || s.includes('AT')) return 'AT';
  return null;
}


/**
 * Normaliza status da planilha (_Índice) para slugs em inglês.
 * Esses slugs são compartilhados com o ClickUp — nunca usar palavras em espanhol.
 *
 * Mapeamento (valores reais encontrados na planilha):
 *   ACTIVO       → active
 *   RTA RAPIDA   → rta_rapida   (busca urgente com resposta rápida — mantém semântica única)
 *   REEMPLAZO    → replacement  (cobertura imediata — fila prioritária separada)
 *   SUSPENDIDO   → paused
 *   BUSQUEDA     → searching
 *   EN ESPERA    → on_hold
 *   CERRADO      → closed
 *   CUBIERTO     → filled
 */
function normalizeJobStatus(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().trim();
  if (s === 'ACTIVO' || s === 'ACTIVA') return 'active';
  if (s.includes('RTA RAPIDA') || s.includes('RAPIDA')) return 'rta_rapida';
  if (s.includes('REEMPLAZO') || s.includes('REEMPLAZOS')) return 'replacement';
  if (s.includes('SUSPENDIDO') || s.includes('SUSPENDIDA')) return 'paused';
  if (s.includes('BUSQUEDA') || s.includes('BÚSQUEDA')) return 'searching';
  if (s.includes('EN ESPERA') || s.includes('ESPERA')) return 'on_hold';
  if (s.includes('CERRADO') || s.includes('CERRADA')) return 'closed';
  if (s.includes('CUBIERTO') || s.includes('CUBIERTA')) return 'filled';
  // Valor não reconhecido: retorna null (não sobrescreve o que já existe)
  return null;
}

/**
 * Normaliza prioridade para slugs em inglês.
 * Alinhado com o formato que o ClickUp já usa (urgent/high/normal/low).
 *
 * Mapeamento:
 *   URGENTE → urgent
 *   ALTA    → high
 *   NORMAL  → normal
 *   BAJA    → low
 */
function normalizePriority(raw: string | null): string | null {
  if (!raw) return null;
  const s = raw.toUpperCase().trim();
  if (s.includes('URGENTE') || s === 'URGENT') return 'urgent';
  if (s.includes('ALTA') || s === 'HIGH')      return 'high';
  if (s.includes('NORMAL'))                    return 'normal';
  if (s.includes('BAJA') || s === 'LOW')       return 'low';
  return null;
}

/**
 * Normaliza motivo de rechazo para os 3 slugs em inglês do CHECK constraint.
 * Valores fora dos 3 conhecidos retornam null (não viola a constraint).
 *
 *   Otros                    → other
 *   Horarios incompatibles   → incompatible_schedule
 *   Distancia al dispositivo → distance
 */
function normalizeRejectionReason(raw: string | null): 'other' | 'incompatible_schedule' | 'distance' | null {
  if (!raw) return null;
  const s = raw.trim().toLowerCase();
  if (s.includes('distancia') || s.includes('distance')) return 'distance';
  if (s.includes('horario') || s.includes('schedule'))   return 'incompatible_schedule';
  if (s.includes('otro') || s.includes('other'))         return 'other';
  return null;
}

/**
 * Infere zona geográfica a partir do nome do grupo de publicação.
 * Os nomes dos grupos em _Publicaciones são a proxy geográfica mais confiável
 * que existe na planilha — o caso não tem cidade/bairro explícito.
 *
 * Exemplos:
 *   'AT´s Zona Norte'                           → 'zona_norte'
 *   'Acompañantes Terapéuticos Mar del Plata'   → 'mar_del_plata'
 *   'Bolsa de trabajos en Bahía Blanca'         → 'bahia_blanca'
 *   'CAMPANA ANUNCIOS'                          → 'campana'
 *   'Grupos AT Zona Oeste'                      → 'zona_oeste'
 */
function inferGeographicZone(groupName: string | null): string | null {
  if (!groupName) return null;
  const s = groupName.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '');

  if (s.includes('mar del plata') || s.includes('mdp'))     return 'mar_del_plata';
  if (s.includes('bahia blanca') || s.includes('bahia bl')) return 'bahia_blanca';
  if (s.includes('zona norte') || s.includes('znorte'))     return 'zona_norte';
  if (s.includes('zona sur') || s.includes('zsur'))         return 'zona_sur';
  if (s.includes('zona oeste') || s.includes('zoeste'))     return 'zona_oeste';
  if (s.includes('zona centro') || s.includes('zcentro'))   return 'zona_centro';
  if (s.includes('campana'))                                return 'campana';
  if (s.includes('rosario'))                                return 'rosario';
  if (s.includes('cordoba') || s.includes('córdoba'))       return 'cordoba';
  if (s.includes('tucuman') || s.includes('tucumán'))       return 'tucuman';
  if (s.includes('mendoza'))                                return 'mendoza';
  if (s.includes('caba') || s.includes('capital federal'))  return 'caba';
  if (s.includes('gba') || s.includes('gran buenos aires')) return 'gran_buenos_aires';
  return null;
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
 * Formato principal: "CASO 694, CASO 672, CASO 701, AT, para pacientes..."
 *
 * FALLBACK ROBUSTO (porta da lógica do Dashboard):
 *   1. Tenta regex "CASO NNN" (case-insensitive)
 *   2. Se falhar, tenta string puramente numérica: "502, 492" / "502-492" / "502; 492 & 418"
 *   3. Se falhar, tenta números de 3-4 dígitos sem palavras longas (≥3 letras)
 *
 * Retorna array de inteiros únicos, sem NaN.
 */
function parseTalentSearchCaseNumbers(prescreenings: string | null): number[] {
  if (!prescreenings) return [];

  const results: number[] = [];
  const str = String(prescreenings).trim();

  // FASE 1: padrão "CASO NNN"
  const casoMatches = [...str.matchAll(/[Cc][Aa][Ss][Oo]\s+(\d+)/g)];
  results.push(...casoMatches.map(m => parseInt(m[1], 10)));

  if (results.length === 0) {
    // FASE 2: string composta só de números e pontuação comum
    if (/^[\d\s,.\-;&y]+$/.test(str)) {
      const nums = str.match(/\d+/g);
      if (nums) results.push(...nums.map(n => parseInt(n, 10)));
    } else {
      // FASE 3: números de 3-4 dígitos sem palavras longas no contexto
      const nums = str.match(/\b(\d{3,4})\b/g);
      if (nums && !/[a-zA-Z]{3,}/.test(str)) {
        results.push(...nums.map(n => parseInt(n, 10)));
      }
    }
  }

  return [...new Set(results)].filter(n => !isNaN(n));
}

/**
 * Mapeia o status do Talent Search ATS para application_funnel_stage do banco.
 *   QUALIFIED      → QUALIFIED
 *   NOT_QUALIFIED  → NOT_QUALIFIED
 *   IN_DOUBT       → IN_DOUBT
 *   MESSAGE_SENT e outros → INITIATED (contactado, processo iniciado)
 */
function mapTalentSearchStatusToApplicationStatus(status: string | null): ApplicationFunnelStage {
  if (!status) return 'INITIATED';
  const s = status.toUpperCase().trim();
  if (s === 'QUALIFIED') return 'QUALIFIED';
  if (s === 'NOT_QUALIFIED') return 'NOT_QUALIFIED';
  if (s === 'IN_DOUBT') return 'IN_DOUBT';
  return 'INITIATED';
}

