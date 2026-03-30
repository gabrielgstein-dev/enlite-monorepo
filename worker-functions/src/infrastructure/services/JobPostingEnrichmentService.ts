/**
 * JobPostingEnrichmentService
 *
 * Parseia os campos de texto livre de job_postings (worker_profile_sought,
 * schedule_days_hours) com LLM e salva os resultados estruturados na tabela.
 *
 * Os campos estruturados são usados pelo MatchmakingService nas fases de
 * hard filter e scoring.
 */

import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';

export interface JobPostingLLMFields {
  required_sex: 'M' | 'F' | 'BOTH' | null;
  required_profession: ('AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST')[] | null;
  required_specialties: string[];
  required_diagnoses: string[];
  parsed_schedule: {
    days: number[]; // 0=Domingo, 1=Segunda, ..., 6=Sábado
    slots: { start: string; end: string }[];
    interpretation: string;
  } | null;
}

export class JobPostingEnrichmentService {
  private db: Pool;
  private apiKey: string;
  private model: string;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.apiKey = process.env.GROQ_API_KEY ?? '';
    this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
    if (!this.apiKey) throw new Error('GROQ_API_KEY não configurado. Obter em https://console.groq.com');
  }

  /**
   * Enriquece um job_posting com campos LLM estruturados.
   * Sempre re-processa (sobrescreve llm_enriched_at), útil para re-enriquecimento manual.
   */
  async enrichJobPosting(jobPostingId: string): Promise<JobPostingLLMFields> {
    console.log(`[LLM Enrich] Iniciando enriquecimento para job_posting ${jobPostingId}`);

    const result = await this.db.query(
      `SELECT jp.worker_profile_sought, jp.schedule_days_hours,
              jp.case_number, p.diagnosis, p.zone_neighborhood AS patient_zone, p.service_type
       FROM job_postings jp
       LEFT JOIN patients p ON jp.patient_id = p.id
       WHERE jp.id = $1`,
      [jobPostingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Job posting ${jobPostingId} não encontrado`);
    }

    const { worker_profile_sought, schedule_days_hours, diagnosis, case_number } = result.rows[0];

    console.log(`[LLM Enrich] Caso #${case_number ?? '?'} | ID ${jobPostingId}`);
    console.log(`[LLM Enrich]   worker_profile_sought: ${worker_profile_sought ? `"${worker_profile_sought}"` : '(vazio)'}`);
    console.log(`[LLM Enrich]   schedule_days_hours:   ${schedule_days_hours ? `"${schedule_days_hours}"` : '(vazio)'}`);
    console.log(`[LLM Enrich]   diagnosis:             ${diagnosis ? `"${diagnosis}"` : '(vazio)'}`);

    if (!worker_profile_sought && !schedule_days_hours && !diagnosis) {
      console.warn(`[LLM Enrich] AVISO: Todos os campos de entrada estão vazios — o resultado da LLM será genérico`);
    }

    const parsed = await this.callGroq(worker_profile_sought, schedule_days_hours, diagnosis);

    console.log(`[LLM Enrich] Resultado validado para caso #${case_number ?? '?'}:`);
    console.log(`[LLM Enrich]   required_sex:         ${JSON.stringify(parsed.required_sex)}`);
    console.log(`[LLM Enrich]   required_profession:  ${JSON.stringify(parsed.required_profession)}`);
    console.log(`[LLM Enrich]   required_specialties: ${JSON.stringify(parsed.required_specialties)}`);
    console.log(`[LLM Enrich]   required_diagnoses:   ${JSON.stringify(parsed.required_diagnoses)}`);
    console.log(`[LLM Enrich]   parsed_schedule:      ${JSON.stringify(parsed.parsed_schedule)}`);

    // Write to job_postings_llm_enrichment table (migration 082)
    const updateResult = await this.db.query(
      `INSERT INTO job_postings_llm_enrichment (
         job_posting_id, llm_required_sex, llm_required_profession,
         llm_required_specialties, llm_required_diagnoses,
         llm_parsed_schedule, llm_enriched_at
       ) VALUES ($1, $2, $3, $4, $5, $6, NOW())
       ON CONFLICT (job_posting_id) DO UPDATE SET
         llm_required_sex        = EXCLUDED.llm_required_sex,
         llm_required_profession = EXCLUDED.llm_required_profession,
         llm_required_specialties = EXCLUDED.llm_required_specialties,
         llm_required_diagnoses  = EXCLUDED.llm_required_diagnoses,
         llm_parsed_schedule     = EXCLUDED.llm_parsed_schedule,
         llm_enriched_at         = NOW()
       RETURNING job_posting_id, llm_enriched_at`,
      [
        jobPostingId,
        parsed.required_sex,
        JSON.stringify(parsed.required_profession),  // JSONB
        JSON.stringify(parsed.required_specialties),
        JSON.stringify(parsed.required_diagnoses),
        parsed.parsed_schedule ? JSON.stringify(parsed.parsed_schedule) : null,
      ]
    );

    if (updateResult.rowCount === 0) {
      console.error(`[LLM Enrich] ERRO: UPSERT não afetou nenhuma linha para ID ${jobPostingId}`);
    } else {
      console.log(`[LLM Enrich] DB atualizado com sucesso para caso #${case_number ?? '?'} em ${updateResult.rows[0].llm_enriched_at}`);
    }

    return parsed;
  }

  /**
   * Enriches only if llm_enriched_at IS NULL (never enriched or reset due to text change).
   * Returns true if enrichment ran, false if skipped.
   */
  async enrichIfNeeded(jobPostingId: string): Promise<boolean> {
    const check = await this.db.query<{ needs: boolean; case_number: string }>(
      `SELECT
         (le.llm_enriched_at IS NULL) AS needs,
         jp.case_number
       FROM job_postings jp
       LEFT JOIN job_postings_llm_enrichment le ON le.job_posting_id = jp.id
       WHERE jp.id = $1`,
      [jobPostingId]
    );
    if (!check.rows[0]?.needs) {
      console.log(`[LLM Enrich] Caso #${check.rows[0]?.case_number ?? '?'} (ID ${jobPostingId}): já enriquecido, pulando`);
      return false;
    }
    await this.enrichJobPosting(jobPostingId);
    return true;
  }

  private async callGroq(
    workerProfileSought: string | null,
    scheduleDaysHours: string | null,
    diagnosis: string | null
  ): Promise<JobPostingLLMFields> {
    const systemPrompt = `Eres un asistente especializado en análisis de requerimientos de trabajo para Acompañantes Terapéuticos (AT) y Cuidadores en Argentina. Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.`;

    const userPrompt = `Analiza los siguientes campos de una vacante y extrae información estructurada para matching de candidatos.

Perfil buscado: ${workerProfileSought || 'No especificado'}
Horarios: ${scheduleDaysHours || 'No especificado'}
Diagnóstico del paciente: ${diagnosis || 'No especificado'}

Devuelve exactamente este JSON (sin comentarios, sin texto extra):
{
  "required_sex": "M" | "F" | "BOTH" | null,
  "required_profession": ["AT"] | ["CAREGIVER"] | ["NURSE"] | ["KINESIOLOGIST"] | ["PSYCHOLOGIST"] | ["AT","CAREGIVER"] | null,
  "required_specialties": ["especialidad1", "especialidad2"],
  "required_diagnoses": ["TEA", "ACV", "Alzheimer"],
  "parsed_schedule": {
    "days": [1, 2, 3, 4, 5],
    "slots": [{"start": "08:00", "end": "16:00"}],
    "interpretation": "descripción legible del horario"
  }
}

REGLAS para required_sex:
- "M"    → texto menciona explícitamente varón, hombre, masculino, chico
- "F"    → texto menciona explícitamente mujer, femenino, chica, señora
- "BOTH" → texto dice "indistinto", "cualquiera", "hombre o mujer", "no importa el sexo"
- null   → no se menciona sexo en absoluto

REGLAS para required_profession (array, puede tener 1 o más valores):
- "AT"            → Acompañante Terapéutico, AT con certificado, acompañante
- "CAREGIVER"     → Cuidador, cuidadora, asistente, acompañante sin certificación formal
- "NURSE"         → Enfermero/a con matrícula, licenciado/a en enfermería
- "KINESIOLOGIST" → Kinesiólogo/a, fisioterapeuta
- "PSYCHOLOGIST"  → Psicólogo/a, terapeuta con matrícula
- Si el texto acepta más de una, incluir todas. Ej: "AT o Cuidador" → ["AT","CAREGIVER"]
- null → no se especifica o no hay texto suficiente para determinar

REGLAS para parsed_schedule:
- days: 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
- null si no hay información de horario. Si hay días pero no horario, usar slots:[]`;

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
        max_tokens: 600,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[LLM Enrich] Groq API erro HTTP ${response.status}: ${errBody}`);
      throw new Error(`Groq API error ${response.status}: ${errBody}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }>; usage?: Record<string, number> };
    const content = data.choices[0]?.message?.content;

    console.log(`[LLM Enrich] Resposta bruta da Groq: ${content ?? '(null)'}`);
    if (data.usage) {
      console.log(`[LLM Enrich] Tokens usados: prompt=${data.usage.prompt_tokens} completion=${data.usage.completion_tokens}`);
    }

    if (!content) throw new Error('Resposta vazia da Groq API');

    let raw: Partial<JobPostingLLMFields>;
    try {
      raw = JSON.parse(content);
    } catch (parseErr) {
      console.error(`[LLM Enrich] ERRO ao fazer JSON.parse da resposta: ${(parseErr as Error).message}`);
      console.error(`[LLM Enrich] Conteúdo que falhou no parse: ${content}`);
      throw new Error(`Falha ao parsear JSON da LLM: ${(parseErr as Error).message}`);
    }

    console.log(`[LLM Enrich] JSON parseado (antes da validação): ${JSON.stringify(raw)}`);
    return this.validate(raw);
  }

  private validate(raw: Partial<JobPostingLLMFields>): JobPostingLLMFields {
    const validSex = ['M', 'F', 'BOTH'];
    const validProfession = ['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST'];

    // Validate required_sex
    const rawSex = raw.required_sex as string;
    const resolvedSex = validSex.includes(rawSex) ? (rawSex as 'M' | 'F' | 'BOTH') : null;
    if (rawSex && !resolvedSex) {
      console.warn(`[LLM Enrich] validate: required_sex "${rawSex}" inválido — descartado (esperado: M, F, BOTH ou null)`);
    }

    // Validate required_profession
    let requiredProfession: ('AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST')[] | null = null;
    if (Array.isArray(raw.required_profession)) {
      const filtered = raw.required_profession.filter(p => validProfession.includes(p as string)) as ('AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST')[];
      const discarded = raw.required_profession.filter(p => !validProfession.includes(p as string));
      if (discarded.length > 0) {
        console.warn(`[LLM Enrich] validate: required_profession valores inválidos descartados: ${JSON.stringify(discarded)}`);
      }
      requiredProfession = filtered.length > 0 ? filtered : null;
    } else if (raw.required_profession !== null && raw.required_profession !== undefined) {
      console.warn(`[LLM Enrich] validate: required_profession não é um array (tipo: ${typeof raw.required_profession}, valor: ${JSON.stringify(raw.required_profession)}) — descartado`);
    }

    // Validate parsed_schedule
    let resolvedSchedule = null;
    if (raw.parsed_schedule) {
      if (!Array.isArray(raw.parsed_schedule.days)) {
        console.warn(`[LLM Enrich] validate: parsed_schedule.days não é array — schedule descartado. Valor: ${JSON.stringify(raw.parsed_schedule)}`);
      } else {
        resolvedSchedule = {
          days: raw.parsed_schedule.days.filter(d => typeof d === 'number' && d >= 0 && d <= 6),
          slots: Array.isArray(raw.parsed_schedule.slots)
            ? raw.parsed_schedule.slots.filter(
                s => s && typeof s.start === 'string' && typeof s.end === 'string'
              )
            : [],
          interpretation: typeof raw.parsed_schedule.interpretation === 'string'
            ? raw.parsed_schedule.interpretation
            : '',
        };
      }
    }

    return {
      required_sex: resolvedSex,
      required_profession: requiredProfession,
      required_specialties: Array.isArray(raw.required_specialties)
        ? raw.required_specialties.filter(s => typeof s === 'string')
        : [],
      required_diagnoses: Array.isArray(raw.required_diagnoses)
        ? raw.required_diagnoses.filter(d => typeof d === 'string')
        : [],
      parsed_schedule: resolvedSchedule,
    };
  }
}
