/**
 * MatchmakingService
 *
 * Matching em 3 fases entre job_postings e workers:
 *
 * Fase 1 — Hard Filter (SQL)
 *   Elimina candidatos incompatíveis por occupation, funnel_stage,
 *   blacklist e sobreposição mínima de disponibilidade.
 *
 * Fase 2 — Structured Score (em memória, 0-100)
 *   Scoring determinístico: occupation, geo, diagnósticos, rejection history.
 *
 * Fase 3 — LLM Score (top N candidatos, 0-100)
 *   MatchmakingLLMScorer chama Groq com perfil completo.
 *   Descriptografa sex/nome via KMS apenas para esses N workers.
 *
 * Score final = structured_score * 0.35 + llm_score * 0.65
 */

import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { KMSEncryptionService } from '@shared/security/KMSEncryptionService';
import {
  JobPosting,
  WorkerCandidate,
  ScoredCandidate,
  MatchResult,
  registrationWarning,
  haversineKm,
} from './MatchmakingTypes';
import { MatchmakingLLMScorer } from './MatchmakingLLMScorer';

export type { ScoredCandidate, MatchResult } from './MatchmakingTypes';

// ─── Service ──────────────────────────────────────────────────────────────────

export class MatchmakingService {
  private db: Pool;
  private kms: KMSEncryptionService;
  private llmScorer: MatchmakingLLMScorer;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.kms = new KMSEncryptionService();
    this.llmScorer = new MatchmakingLLMScorer(
      process.env.GROQ_API_KEY ?? '',
      process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile',
    );
  }

  async matchWorkersForJob(
    jobPostingId: string,
    topN = 20,
    radiusKm: number | null = null,
    excludeWithActiveCases = false,
  ): Promise<MatchResult> {
    // worker_eligibility materialized view was cascade-dropped by migration 096.
    // Eligibility is now checked inline: status = 'REGISTERED' AND deleted_at IS NULL.

    const job = await this.loadJob(jobPostingId);

    const candidates = await this.hardFilter(job, radiusKm, excludeWithActiveCases);
    console.log(
      `[Matchmaking] ${candidates.length} candidatos passaram no hard filter para vaga ${jobPostingId}` +
      `${radiusKm ? ` (raio: ${radiusKm}km)` : ''}` +
      `${excludeWithActiveCases ? ' (excluindo com casos ativos)' : ''}`,
    );

    const rankedByStructured = candidates
      .map(w => {
        const { score: structuredScore, distanceKm } = this.computeStructuredScore(w, job);
        return { worker: w, structuredScore, distanceKm };
      })
      .sort((a, b) => b.structuredScore - a.structuredScore)
      .slice(0, topN);

    console.log(`[Matchmaking] Rodando LLM para ${rankedByStructured.length} candidatos...`);

    const finalCandidates: ScoredCandidate[] = [];

    for (const { worker, structuredScore, distanceKm } of rankedByStructured) {
      const [firstName, lastName, sex] = await Promise.all([
        this.kms.decrypt(worker.firstNameEncrypted),
        this.kms.decrypt(worker.lastNameEncrypted),
        this.kms.decrypt(worker.sexEncrypted),
      ]);

      const nameParts = firstName === lastName
        ? [firstName].filter(Boolean)
        : [firstName, lastName].filter(Boolean);
      const workerName = nameParts.join(' ') || 'Sin nombre';

      let llmScore: number | null = null;
      let llmReasoning: string | null = null;
      let llmRedFlags: string[] = [];
      let llmStrengths: string[] = [];

      try {
        const llmResult = await this.llmScorer.score(job, worker, sex ?? '', distanceKm, worker.activeCases);
        llmScore = llmResult.score;
        llmReasoning = llmResult.reasoning;
        llmRedFlags = llmResult.red_flags;
        llmStrengths = llmResult.strengths;
      } catch (err) {
        console.error(`[Matchmaking] LLM falhou para worker ${worker.workerId}:`, (err as Error).message);
      }

      const finalScore =
        llmScore !== null
          ? Math.round(structuredScore * 0.35 + llmScore * 0.65)
          : structuredScore;

      finalCandidates.push({
        workerId: worker.workerId,
        workerName,
        workerPhone: worker.phone,
        occupation: worker.occupation,
        workZone: worker.workZone ?? worker.workerAddress,
        distanceKm: distanceKm !== null ? Math.round(distanceKm * 10) / 10 : null,
        activeCasesCount: worker.activeCases.length,
        workerStatus: worker.workerStatus,
        registrationWarning: registrationWarning(worker.workerStatus),
        structuredScore,
        llmScore,
        finalScore,
        llmReasoning,
        llmRedFlags,
        llmStrengths,
        alreadyApplied: worker.alreadyApplied,
      });

      await sleep(100); // Rate limit Groq free: 30 req/min
    }

    finalCandidates.sort((a, b) => b.finalScore - a.finalScore);
    await this.saveMatchResults(jobPostingId, finalCandidates);

    return {
      jobPostingId,
      radiusKm: radiusKm ?? null,
      matchSummary: {
        hardFilteredCount: candidates.length,
        llmScoredCount: finalCandidates.filter(c => c.llmScore !== null).length,
      },
      candidates: finalCandidates,
    };
  }

  // ─── Fase 1a: Carregar vaga ──────────────────────────────────────────────

  private async loadJob(jobPostingId: string): Promise<JobPosting> {
    const result = await this.db.query(
      `SELECT jp.id, jp.worker_profile_sought, jp.schedule_days_hours,
              jp.service_lat, jp.service_lng,
              jp.required_sex, jp.required_professions,
              p.diagnosis, p.zone_neighborhood AS patient_zone
       FROM job_postings jp
       LEFT JOIN patients p ON jp.patient_id = p.id
       WHERE jp.id = $1`,
      [jobPostingId],
    );

    if (result.rows.length === 0) {
      throw new Error(`Job posting ${jobPostingId} não encontrado`);
    }

    const row = result.rows[0];
    return {
      id: row.id,
      workerProfileSought: row.worker_profile_sought,
      scheduleDaysHours: row.schedule_days_hours,
      diagnosis: row.diagnosis,
      patientZone: row.patient_zone,
      serviceLat: row.service_lat ? parseFloat(row.service_lat) : null,
      serviceLng: row.service_lng ? parseFloat(row.service_lng) : null,
      requiredSex: row.required_sex,
      requiredProfessions: Array.isArray(row.required_professions) && row.required_professions.length > 0
        ? row.required_professions as string[]
        : null,
      // pathologyTypes sourced from patients.diagnosis (jp.pathology_types dropped in migration 152)
      pathologyTypes: row.diagnosis,
    };
  }

  // ─── Fase 1b: Hard filter via SQL ────────────────────────────────────────

  private async hardFilter(
    job: JobPosting,
    radiusKm: number | null,
    excludeWithActiveCases: boolean,
  ): Promise<WorkerCandidate[]> {
    const requiredProfession = job.requiredProfessions;
    const applyGeo = radiusKm !== null && job.serviceLat !== null && job.serviceLng !== null;

    const result = await this.db.query(
      `SELECT
         w.id                                     AS worker_id,
         w.phone,
         w.occupation,
         w.status                                 AS worker_status,
         COALESCE(w.diagnostic_preferences, '{}') AS diagnostic_preferences,
         w.sex_encrypted,
         w.first_name_encrypted,
         w.last_name_encrypted,
         wl.work_zone,
         wl.address                               AS worker_address,
         wl.interest_zone,
         wl.lat                                   AS worker_lat,
         wl.lng                                   AS worker_lng,
         (
           SELECT COALESCE(json_agg(json_build_object(
             'case_number', jp2.case_number,
             'schedule_text', jp2.schedule_days_hours
           )), '[]'::json)
           FROM encuadres ea
           JOIN job_postings jp2 ON jp2.id = ea.job_posting_id
           WHERE ea.worker_id = w.id
             AND ea.resultado = 'SELECCIONADO'
             AND jp2.is_covered = false
         ) AS active_cases,
         EXISTS (
           SELECT 1 FROM worker_job_applications wja
           WHERE wja.worker_id = w.id AND wja.job_posting_id = $1
         ) AS already_applied,
         (
           SELECT COALESCE(json_object_agg(rej.cat, rej.cnt), '{}'::json)
           FROM (
             SELECT rejection_reason_category AS cat, COUNT(*)::integer AS cnt
             FROM encuadres e_rej
             WHERE e_rej.worker_id = w.id
               AND e_rej.rejection_reason_category IS NOT NULL
             GROUP BY rejection_reason_category
           ) rej
         ) AS rejection_history,
         w.avg_quality_rating
       FROM workers w
       LEFT JOIN blacklist bl ON bl.worker_id = w.id
       LEFT JOIN worker_locations wl ON wl.worker_id = w.id
       WHERE w.merged_into_id IS NULL
         AND w.status = 'REGISTERED'
         AND w.deleted_at IS NULL
         AND bl.id IS NULL
         AND (
           $2::JSONB IS NULL
           OR $2::JSONB ? w.occupation
         )
         AND (
           NOT $3::BOOLEAN
           OR ST_DWithin(
             wl.location,
             ST_MakePoint($4::FLOAT, $5::FLOAT)::geography,
             $6::FLOAT * 1000
           )
         )
         AND (
           NOT $7::BOOLEAN
           OR NOT EXISTS (
             SELECT 1 FROM encuadres ea2
             JOIN job_postings jp3 ON jp3.id = ea2.job_posting_id
             WHERE ea2.worker_id = w.id
               AND ea2.resultado = 'SELECCIONADO'
               AND jp3.is_covered = false
           )
         )
       GROUP BY w.id, wl.work_zone, wl.address, wl.interest_zone, wl.lat, wl.lng`,
      [
        job.id,
        requiredProfession !== null ? JSON.stringify(requiredProfession) : null,
        applyGeo,
        applyGeo ? job.serviceLng : 0,
        applyGeo ? job.serviceLat : 0,
        radiusKm ?? 0,
        excludeWithActiveCases,
      ],
    );

    const candidates: WorkerCandidate[] = result.rows.map(row => ({
      workerId: row.worker_id as string,
      phone: row.phone as string,
      occupation: row.occupation as string | null,
      workerStatus: row.worker_status as string | null,
      diagnosticPreferences: (row.diagnostic_preferences as string[]) ?? [],
      sexEncrypted: row.sex_encrypted as string | null,
      firstNameEncrypted: row.first_name_encrypted as string | null,
      lastNameEncrypted: row.last_name_encrypted as string | null,
      workZone: row.work_zone as string | null,
      workerAddress: row.worker_address as string | null,
      interestZone: row.interest_zone as string | null,
      activeCases: (row.active_cases as WorkerCandidate['activeCases']) ?? [],
      workerLat: row.worker_lat ? parseFloat(row.worker_lat as string) : null,
      workerLng: row.worker_lng ? parseFloat(row.worker_lng as string) : null,
      alreadyApplied: row.already_applied as boolean,
      rejectionHistory: (row.rejection_history as Record<string, number>) ?? {},
      avgQualityRating: row.avg_quality_rating ? parseFloat(row.avg_quality_rating as string) : null,
    }));

    const filteredCandidates: WorkerCandidate[] = [];
    for (const candidate of candidates) {
      if (job.requiredSex && job.requiredSex !== 'BOTH') {
        const workerSex = await this.kms.decrypt(candidate.sexEncrypted);
        if (workerSex !== job.requiredSex) continue;
      }
      if (job.serviceLat !== null && job.serviceLng !== null && candidate.workerLat !== null && candidate.workerLng !== null) {
        const distance = haversineKm(job.serviceLat, job.serviceLng, candidate.workerLat, candidate.workerLng);
        if (radiusKm !== null && distance > radiusKm) continue;
      }
      filteredCandidates.push(candidate);
    }

    return filteredCandidates;
  }

  // ─── Fase 2: Structured scoring ──────────────────────────────────────────

  private computeStructuredScore(worker: WorkerCandidate, job: JobPosting): { score: number; distanceKm: number | null } {
    let score = 0;

    // Occupation match (0-40 pts)
    if (job.requiredProfessions && job.requiredProfessions.length > 0) {
      if (worker.occupation && job.requiredProfessions.includes(worker.occupation)) score += 40;
    } else {
      score += 20;
    }

    // Proximidade geográfica (0-35 pts)
    let distanceKm: number | null = null;
    if (job.serviceLat && job.serviceLng && worker.workerLat && worker.workerLng) {
      distanceKm = haversineKm(job.serviceLat, job.serviceLng, worker.workerLat, worker.workerLng);
      if      (distanceKm <  5) score += 35;
      else if (distanceKm < 10) score += 28;
      else if (distanceKm < 20) score += 18;
      else if (distanceKm < 40) score += 8;
      else                      score += 2;
    } else if (job.patientZone && (worker.workZone || worker.interestZone)) {
      const zone = job.patientZone.toLowerCase();
      const wz   = (worker.workZone ?? '').toLowerCase();
      const iz   = (worker.interestZone ?? '').toLowerCase();
      if (wz && (zone.includes(wz) || wz.includes(zone))) score += 35;
      else if (iz && (zone.includes(iz) || iz.includes(zone))) score += 20;
      else score += 5;
    } else {
      score += 15;
    }

    // Diagnósticos / patologias (0-25 pts)
    const jobPathologies = (job.pathologyTypes ?? '')
      .split(/[,;/]/)
      .map(p => p.trim().toLowerCase())
      .filter(Boolean);
    if (jobPathologies.length > 0 && worker.diagnosticPreferences.length > 0) {
      const workerDx = worker.diagnosticPreferences.map(p => p.toLowerCase());
      const matches  = jobPathologies.filter(d => workerDx.some(p => p.includes(d) || d.includes(p)));
      score += Math.round((matches.length / jobPathologies.length) * 25);
    } else if (jobPathologies.length === 0) {
      score += 12;
    }

    // Penalty: rejection history
    const rejHist = worker.rejectionHistory;
    if (rejHist) {
      if ((rejHist['DISTANCE'] ?? 0) >= 2) score -= 10;
      if ((rejHist['SCHEDULE_INCOMPATIBLE'] ?? 0) >= 2) score -= 15;
      if ((rejHist['DEPENDENCY_MISMATCH'] ?? 0) >= 3) score -= 20;
      if ((rejHist['INSUFFICIENT_EXPERIENCE'] ?? 0) >= 3) score -= 15;
    }

    // Bonus/penalty: quality rating
    const qr = worker.avgQualityRating;
    if (qr !== null) {
      if (qr >= 4.5) score += 15;
      else if (qr >= 4.0) score += 10;
      else if (qr < 3.0) score -= 10;
    }

    return { score: Math.min(100, Math.max(0, score)), distanceKm };
  }

  // ─── Persistência ─────────────────────────────────────────────────────────

  private async saveMatchResults(jobPostingId: string, candidates: ScoredCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.db.query(
        `INSERT INTO worker_job_applications
           (worker_id, job_posting_id, match_score, application_status, application_funnel_stage, internal_notes)
         VALUES ($1, $2, $3, 'under_review', 'INITIATED', $4)
         ON CONFLICT (worker_id, job_posting_id) DO UPDATE SET
           match_score    = EXCLUDED.match_score,
           internal_notes = EXCLUDED.internal_notes,
           updated_at     = NOW()`,
        [candidate.workerId, jobPostingId, candidate.finalScore, candidate.llmReasoning],
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
