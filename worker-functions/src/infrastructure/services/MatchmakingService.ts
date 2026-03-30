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
 *   Scoring determinístico usando campos estruturados:
 *   occupation match, sobreposição de horário, preferências diagnósticas,
 *   e potencial de follow-up extraído de encuadres anteriores.
 *
 * Fase 3 — LLM Score (top N candidatos, 0-100)
 *   LLM analisa o perfil completo (texto livre da vaga + dados do worker)
 *   e dá uma nota com reasoning, strengths e red flags.
 *   Descriptografa sex/nome via KMS apenas para esses N workers.
 *
 * Score final = structured_score * 0.35 + llm_score * 0.65
 */

import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';
import { JobPostingEnrichmentService } from './JobPostingEnrichmentService';
import { KMSEncryptionService } from '../security/KMSEncryptionService';

// ─── Tipos internos ───────────────────────────────────────────────────────────

interface EnrichedJobPosting {
  id: string;
  workerProfileSought: string | null;
  scheduleDaysHours: string | null;
  diagnosis: string | null;
  patientZone: string | null;
  serviceLat: number | null;
  serviceLng: number | null;
  llmRequiredSex: string | null;
  llmRequiredProfession: string[] | null;
  llmRequiredSpecialties: string[];
  llmRequiredDiagnoses: string[];
  llmParsedSchedule: {
    days: number[];
    slots: { start: string; end: string }[];
    interpretation: string;
  } | null;
  llmEnrichedAt: Date | null;
}

interface ActiveCase {
  case_number: number | null;
  parsed_schedule: { days: number[]; slots: { start: string; end: string }[]; interpretation: string } | null;
  schedule_text: string | null;
}

interface WorkerCandidate {
  workerId: string;
  phone: string;
  occupation: string | null;
  overallStatus: string | null;
  diagnosticPreferences: string[];
  sexEncrypted: string | null;
  firstNameEncrypted: string | null;
  lastNameEncrypted: string | null;
  workZone: string | null;
  workerAddress: string | null;
  interestZone: string | null;
  workerLat: number | null;
  workerLng: number | null;
  activeCases: ActiveCase[];
  latestLlmExperience: { diagnoses: string[]; specialties: string[]; years: number | null; zones: string[] } | null;
  latestLlmAvailabilityNotes: string | null;
  latestLlmFollowUpPotential: boolean;
  latestLlmInterestLevel: string | null;
  alreadyApplied: boolean;
}

interface LLMMatchScore {
  score: number;
  reasoning: string;
  strengths: string[];
  red_flags: string[];
}

// ─── Tipos públicos ───────────────────────────────────────────────────────────

export interface ScoredCandidate {
  workerId: string;
  workerName: string;
  workerPhone: string;
  occupation: string | null;
  workZone: string | null;
  distanceKm: number | null;
  activeCasesCount: number;
  overallStatus: string | null;
  registrationWarning: string | null;
  structuredScore: number;
  llmScore: number | null;
  finalScore: number;
  llmReasoning: string | null;
  llmRedFlags: string[];
  llmStrengths: string[];
  alreadyApplied: boolean;
}

export interface MatchResult {
  jobPostingId: string;
  jobEnriched: boolean;
  radiusKm: number | null;
  matchSummary: {
    hardFilteredCount: number;
    llmScoredCount: number;
  };
  candidates: ScoredCandidate[];
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function registrationWarning(overallStatus: string | null): string | null {
  switch (overallStatus) {
    case 'PRE_TALENTUM':   return 'Registro incompleto no Talentum';
    case 'QUALIFIED':      return 'Qualificado pelo Talentum, aguardando documentação';
    case 'IN_DOUBT':       return 'Perfil com dúvidas no Talentum';
    case 'MESSAGE_SENT':   return 'Mensagem enviada para subir documentação';
    case 'ACTIVE':         return null;
    default:               return null;
  }
}

function haversineKm(lat1: number, lng1: number, lat2: number, lng2: number): number {
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLng = ((lng2 - lng1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// ─── Service ──────────────────────────────────────────────────────────────────

export class MatchmakingService {
  private db: Pool;
  private enrichmentService: JobPostingEnrichmentService;
  private kms: KMSEncryptionService;
  private apiKey: string;
  private model: string;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.enrichmentService = new JobPostingEnrichmentService();
    this.kms = new KMSEncryptionService();
    this.apiKey = process.env.GROQ_API_KEY ?? '';
    this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
  }

  async matchWorkersForJob(
    jobPostingId: string,
    topN = 20,
    radiusKm: number | null = null,
    excludeWithActiveCases = false
  ): Promise<MatchResult> {
    // Refresh materialized view antes de rodar matching (leve, ~50ms para <10k workers)
    await this.db.query('REFRESH MATERIALIZED VIEW CONCURRENTLY worker_eligibility');

    // Fase 1a: Carrega e auto-enriquece a vaga se necessário
    const job = await this.loadAndEnrichJob(jobPostingId);

    // Fase 1b: Hard filter via SQL (inclui geo se radiusKm e vaga tiver coords)
    const candidates = await this.hardFilter(job, radiusKm, excludeWithActiveCases);
    console.log(
      `[Matchmaking] ${candidates.length} candidatos passaram no hard filter para vaga ${jobPostingId}` +
      `${radiusKm ? ` (raio: ${radiusKm}km)` : ''}` +
      `${excludeWithActiveCases ? ' (excluindo com casos ativos)' : ''}`
    );

    // Fase 2: Structured scoring em memória → pega top N
    const rankedByStructured = candidates
      .map(w => {
        const { score: structuredScore, distanceKm } = this.computeStructuredScore(w, job);
        return { worker: w, structuredScore, distanceKm };
      })
      .sort((a, b) => b.structuredScore - a.structuredScore)
      .slice(0, topN);

    console.log(`[Matchmaking] Rodando LLM para ${rankedByStructured.length} candidatos...`);

    // Fase 3: LLM scoring para os top N
    const finalCandidates: ScoredCandidate[] = [];

    for (const { worker, structuredScore, distanceKm } of rankedByStructured) {
      // Descriptografa nome e sexo via KMS (apenas para esses N workers)
      const [firstName, lastName, sex] = await Promise.all([
        this.kms.decrypt(worker.firstNameEncrypted),
        this.kms.decrypt(worker.lastNameEncrypted),
        this.kms.decrypt(worker.sexEncrypted),
      ]);

      // Evita duplicar nome quando first_name === last_name (problema de import)
      const nameParts = firstName === lastName
        ? [firstName].filter(Boolean)
        : [firstName, lastName].filter(Boolean);
      const workerName = nameParts.join(' ') || 'Sin nombre';

      let llmScore: number | null = null;
      let llmReasoning: string | null = null;
      let llmRedFlags: string[] = [];
      let llmStrengths: string[] = [];

      try {
        const llmResult = await this.callMatchLLM(job, worker, sex, distanceKm, worker.activeCases);
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
        overallStatus: worker.overallStatus,
        registrationWarning: registrationWarning(worker.overallStatus),
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

    // Ordena pelo score final
    finalCandidates.sort((a, b) => b.finalScore - a.finalScore);

    // Salva resultados em worker_job_applications
    await this.saveMatchResults(jobPostingId, finalCandidates);

    return {
      jobPostingId,
      jobEnriched: job.llmEnrichedAt !== null,
      radiusKm: radiusKm ?? null,
      matchSummary: {
        hardFilteredCount: candidates.length,
        llmScoredCount: finalCandidates.filter(c => c.llmScore !== null).length,
      },
      candidates: finalCandidates,
    };
  }

  // ─── Fase 1a: Carregar e auto-enriquecer ─────────────────────────────────

  private async loadAndEnrichJob(jobPostingId: string): Promise<EnrichedJobPosting> {
    const result = await this.db.query(
      `SELECT jp.id, jp.worker_profile_sought, jp.schedule_days_hours,
              jp.service_lat, jp.service_lng,
              p.diagnosis, p.zone_neighborhood AS patient_zone,
              le.llm_required_sex, le.llm_required_profession, le.llm_required_specialties,
              le.llm_required_diagnoses, le.llm_parsed_schedule, le.llm_enriched_at
       FROM job_postings jp
       LEFT JOIN patients p ON jp.patient_id = p.id
       LEFT JOIN job_postings_llm_enrichment le ON le.job_posting_id = jp.id
       WHERE jp.id = $1`,
      [jobPostingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Job posting ${jobPostingId} não encontrado`);
    }

    const row = result.rows[0];

    // Auto-enriquece se ainda não foi processado
    if (!row.llm_enriched_at) {
      console.log(`[Matchmaking] Auto-enriquecendo job posting ${jobPostingId}...`);
      await this.enrichmentService.enrichJobPosting(jobPostingId);
      return this.loadAndEnrichJob(jobPostingId);
    }

    return {
      id: row.id,
      workerProfileSought: row.worker_profile_sought,
      scheduleDaysHours: row.schedule_days_hours,
      diagnosis: row.diagnosis,
      patientZone: row.patient_zone,
      serviceLat: row.service_lat ? parseFloat(row.service_lat) : null,
      serviceLng: row.service_lng ? parseFloat(row.service_lng) : null,
      llmRequiredSex: row.llm_required_sex,
      llmRequiredProfession: row.llm_required_profession,
      llmRequiredSpecialties: row.llm_required_specialties ?? [],
      llmRequiredDiagnoses: row.llm_required_diagnoses ?? [],
      llmParsedSchedule: row.llm_parsed_schedule ?? null,
      llmEnrichedAt: row.llm_enriched_at,
    };
  }

  // ─── Fase 1b: Hard filter via SQL ────────────────────────────────────────

  private async hardFilter(
    job: EnrichedJobPosting,
    radiusKm: number | null,
    excludeWithActiveCases: boolean
  ): Promise<WorkerCandidate[]> {
    const requiredProfession = job.llmRequiredProfession && job.llmRequiredProfession.length > 0
      ? job.llmRequiredProfession
      : null;
    const applyGeo = radiusKm !== null && job.serviceLat !== null && job.serviceLng !== null;

    const result = await this.db.query(
      `SELECT
         w.id                                     AS worker_id,
         w.phone,
         w.occupation,
         w.overall_status,
         COALESCE(w.diagnostic_preferences, '{}') AS diagnostic_preferences,
         w.sex_encrypted,
         w.first_name_encrypted,
         w.last_name_encrypted,
         wl.work_zone,
         wl.address                               AS worker_address,
         wl.interest_zone,
         wl.lat                                   AS worker_lat,
         wl.lng                                   AS worker_lng,
         -- Casos ativos: SELECCIONADO em vagas não cobertas + horário parseado
         (
           SELECT COALESCE(json_agg(json_build_object(
             'case_number', jp2.case_number,
             'parsed_schedule', le2.llm_parsed_schedule,
             'schedule_text', jp2.schedule_days_hours
           )), '[]'::json)
           FROM encuadres ea
           JOIN job_postings jp2 ON jp2.id = ea.job_posting_id
           LEFT JOIN job_postings_llm_enrichment le2 ON le2.job_posting_id = jp2.id
           WHERE ea.worker_id = w.id
             AND ea.resultado = 'SELECCIONADO'
             AND jp2.is_covered = false
         ) AS active_cases,
         (
           SELECT e.llm_extracted_experience
           FROM encuadres e
           WHERE e.worker_id = w.id AND e.llm_processed_at IS NOT NULL
           ORDER BY e.llm_processed_at DESC LIMIT 1
         ) AS latest_llm_experience,
         (
           SELECT e.llm_availability_notes
           FROM encuadres e
           WHERE e.worker_id = w.id AND e.llm_processed_at IS NOT NULL
           ORDER BY e.llm_processed_at DESC LIMIT 1
         ) AS latest_llm_availability_notes,
         COALESCE(
           (
             SELECT e.llm_follow_up_potential
             FROM encuadres e
             WHERE e.worker_id = w.id AND e.llm_processed_at IS NOT NULL
             ORDER BY e.llm_processed_at DESC LIMIT 1
           ),
           false
         ) AS latest_llm_follow_up_potential,
         (
           SELECT e.llm_interest_level
           FROM encuadres e
           WHERE e.worker_id = w.id AND e.llm_processed_at IS NOT NULL
           ORDER BY e.llm_processed_at DESC LIMIT 1
         ) AS latest_llm_interest_level,
         EXISTS (
           SELECT 1 FROM worker_job_applications wja
           WHERE wja.worker_id = w.id AND wja.job_posting_id = $1
         ) AS already_applied
       FROM workers w
       INNER JOIN worker_eligibility we ON we.id = w.id
       LEFT JOIN blacklist bl ON bl.worker_id = w.id
       LEFT JOIN worker_locations wl ON wl.worker_id = w.id
       WHERE w.merged_into_id IS NULL
         AND we.is_matchable = TRUE
         AND bl.id IS NULL
         -- Hard filter: occupation do worker deve estar no array de profissões da vaga
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
        requiredProfession,
        applyGeo,
        applyGeo ? job.serviceLng : 0,
        applyGeo ? job.serviceLat : 0,
        radiusKm ?? 0,
        excludeWithActiveCases,
      ]
    );

    const candidates = result.rows.map(row => ({
      workerId: row.worker_id,
      phone: row.phone,
      occupation: row.occupation,
      overallStatus: row.overall_status,
      diagnosticPreferences: row.diagnostic_preferences ?? [],
      sexEncrypted: row.sex_encrypted,
      firstNameEncrypted: row.first_name_encrypted,
      lastNameEncrypted: row.last_name_encrypted,
      workZone: row.work_zone,
      workerAddress: row.worker_address,
      interestZone: row.interest_zone,
      activeCases: row.active_cases ?? [],
      workerLat: row.worker_lat ? parseFloat(row.worker_lat) : null,
      workerLng: row.worker_lng ? parseFloat(row.worker_lng) : null,
      latestLlmExperience: row.latest_llm_experience,
      latestLlmAvailabilityNotes: row.latest_llm_availability_notes,
      latestLlmFollowUpPotential: row.latest_llm_follow_up_potential ?? false,
      latestLlmInterestLevel: row.latest_llm_interest_level,
      alreadyApplied: row.already_applied,
    }));

    // Hard filter em memória: sexo e distância obrigatórios quando especificados
    const filteredCandidates: WorkerCandidate[] = [];

    for (const candidate of candidates) {
      // Hard filter: sexo (descriptografa apenas para filtrar)
      // Se vaga pede M ou F: só passa worker com esse sexo
      // Se vaga = AMBOS ou null: passa todos
      if (job.llmRequiredSex && job.llmRequiredSex !== 'BOTH') {
        const workerSex = await this.kms.decrypt(candidate.sexEncrypted);
        if (workerSex !== job.llmRequiredSex) {
          continue; // Elimina worker com sexo incompatível
        }
      }

      // Hard filter: distância obrigatória quando vaga tem coordenadas
      if (job.serviceLat !== null && job.serviceLng !== null && candidate.workerLat !== null && candidate.workerLng !== null) {
        const distance = haversineKm(job.serviceLat, job.serviceLng, candidate.workerLat, candidate.workerLng);
        
        // Se radiusKm foi especificado, usa como hard filter
        if (radiusKm !== null && distance > radiusKm) {
          continue; // Elimina worker fora do raio
        }
      }

      filteredCandidates.push(candidate);
    }

    return filteredCandidates;
  }

  // ─── Fase 2: Structured scoring ──────────────────────────────────────────

  private computeStructuredScore(worker: WorkerCandidate, job: EnrichedJobPosting): { score: number; distanceKm: number | null } {
    let score = 0;

    // Occupation match (0-40 pts)
    if (job.llmRequiredProfession && job.llmRequiredProfession.length > 0) {
      if (worker.occupation && job.llmRequiredProfession.includes(worker.occupation)) score += 40;
    } else {
      score += 20; // neutro
    }

    // Proximidade geográfica (0-35 pts) — usa lat/lng se disponível, fallback texto
    let distanceKm: number | null = null;
    if (job.serviceLat && job.serviceLng && worker.workerLat && worker.workerLng) {
      distanceKm = haversineKm(job.serviceLat, job.serviceLng, worker.workerLat, worker.workerLng);
      if      (distanceKm <  5) score += 35;
      else if (distanceKm < 10) score += 28;
      else if (distanceKm < 20) score += 18;
      else if (distanceKm < 40) score += 8;
      else                      score += 2;
    } else if (job.patientZone && (worker.workZone || worker.interestZone)) {
      // Fallback: comparação textual de zona
      const zone = job.patientZone.toLowerCase();
      const wz   = (worker.workZone ?? '').toLowerCase();
      const iz   = (worker.interestZone ?? '').toLowerCase();
      if (wz && (zone.includes(wz) || wz.includes(zone))) score += 35;
      else if (iz && (zone.includes(iz) || iz.includes(zone))) score += 20;
      else score += 5;
    } else {
      score += 15; // neutro
    }

    // Diagnósticos / especialidades (0-25 pts)
    if (job.llmRequiredDiagnoses.length > 0 && worker.diagnosticPreferences.length > 0) {
      const jobDx    = job.llmRequiredDiagnoses.map(d => d.toLowerCase());
      const workerDx = worker.diagnosticPreferences.map(p => p.toLowerCase());
      const matches  = jobDx.filter(d => workerDx.some(p => p.includes(d) || d.includes(p)));
      score += Math.round((matches.length / jobDx.length) * 25);
    } else if (job.llmRequiredDiagnoses.length === 0) {
      score += 12; // neutro
    }

    return { score: Math.min(100, score), distanceKm };
  }

  // ─── Fase 3: LLM scoring ─────────────────────────────────────────────────

  private async callMatchLLM(
    job: EnrichedJobPosting,
    worker: WorkerCandidate,
    sex: string,
    distanceKm: number | null,
    activeCases: ActiveCase[]
  ): Promise<LLMMatchScore> {
    const systemPrompt = `Eres un experto en reclutamiento de Acompañantes Terapéuticos (AT) y Cuidadores en Argentina. Evalúa la compatibilidad entre una vacante y un candidato. Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.`;

    const workerExpText = worker.latestLlmExperience
      ? [
          worker.latestLlmExperience.diagnoses?.length
            ? `Diagnósticos: ${worker.latestLlmExperience.diagnoses.join(', ')}`
            : null,
          worker.latestLlmExperience.specialties?.length
            ? `Especialidades: ${worker.latestLlmExperience.specialties.join(', ')}`
            : null,
          worker.latestLlmExperience.years
            ? `Años de experiencia: ${worker.latestLlmExperience.years}`
            : null,
        ]
          .filter(Boolean)
          .join('. ')
      : 'Sin datos de entrevistas previas';

    const userPrompt = `VACANTE:
- Perfil buscado: ${job.workerProfileSought || 'No especificado'}
- Horarios requeridos: ${job.scheduleDaysHours || 'No especificado'}
- Diagnóstico del paciente: ${job.diagnosis || 'No especificado'}
- Zona del paciente: ${job.patientZone || 'No especificada'}
- Profesión requerida: ${job.llmRequiredProfession?.join(', ') || 'No especificada'}
- Sexo requerido: ${job.llmRequiredSex || 'Sin preferencia'}
- Especialidades requeridas: ${job.llmRequiredSpecialties.join(', ') || 'Ninguna especificada'}
- Diagnósticos relevantes: ${job.llmRequiredDiagnoses.join(', ') || 'Ninguno especificado'}

CANDIDATO:
- Ocupación registrada: ${worker.occupation || 'No especificada'}
- Sexo: ${sex || 'No informado'}
- Zona/dirección: ${worker.workZone || worker.workerAddress || 'No registrada'} | Zona de interés: ${worker.interestZone || 'No registrada'}
- Distancia al paciente: ${distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'Sin coordenadas'}
- Casos activos actuales (${activeCases.length}): ${
  activeCases.length === 0
    ? 'Sin casos activos'
    : activeCases.map(c => {
        const sched = c.parsed_schedule?.interpretation || c.schedule_text || 'horario no disponible';
        return `Caso ${c.case_number ?? '?'} (${sched.substring(0, 80)})`;
      }).join(' | ')
}
- Notas de disponibilidad (encuadre): ${worker.latestLlmAvailabilityNotes || 'No disponible'}
- Experiencia extraída de entrevistas: ${workerExpText}
- Preferencias diagnósticas declaradas: ${worker.diagnosticPreferences.join(', ') || 'No especificadas'}
- Potencial de seguimiento (encuadre previo): ${worker.latestLlmFollowUpPotential ? 'Sí' : 'No'}
- Nivel de interés (encuadre previo): ${worker.latestLlmInterestLevel || 'Desconocido'}

Evalúa la compatibilidad considerando: adecuación del perfil profesional, compatibilidad de horarios, experiencia con el diagnóstico del paciente, e interés demostrado en entrevistas previas.

Devuelve exactamente este JSON:
{
  "score": 0-100,
  "reasoning": "explicación concisa en 1-3 oraciones",
  "strengths": ["fortaleza1", "fortaleza2"],
  "red_flags": ["alerta1", "alerta2"]
}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 400,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da Groq API');

    const parsed = JSON.parse(content) as Partial<LLMMatchScore>;
    return {
      score: typeof parsed.score === 'number' ? Math.min(100, Math.max(0, Math.round(parsed.score))) : 50,
      reasoning: typeof parsed.reasoning === 'string' ? parsed.reasoning : '',
      strengths: Array.isArray(parsed.strengths)
        ? parsed.strengths.filter(s => typeof s === 'string')
        : [],
      red_flags: Array.isArray(parsed.red_flags)
        ? parsed.red_flags.filter(s => typeof s === 'string')
        : [],
    };
  }

  // ─── Persistência ─────────────────────────────────────────────────────────

  private async saveMatchResults(jobPostingId: string, candidates: ScoredCandidate[]): Promise<void> {
    for (const candidate of candidates) {
      await this.db.query(
        `INSERT INTO worker_job_applications
           (worker_id, job_posting_id, match_score, application_status, internal_notes)
         VALUES ($1, $2, $3, 'under_review', $4)
         ON CONFLICT (worker_id, job_posting_id) DO UPDATE SET
           match_score    = EXCLUDED.match_score,
           internal_notes = EXCLUDED.internal_notes,
           updated_at     = NOW()`,
        [candidate.workerId, jobPostingId, candidate.finalScore, candidate.llmReasoning]
      );
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
