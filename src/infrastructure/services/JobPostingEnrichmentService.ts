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
  required_sex: 'M' | 'F' | null;
  required_profession: 'AT' | 'CUIDADOR' | 'AMBOS' | null;
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
    const result = await this.db.query(
      `SELECT jp.worker_profile_sought, jp.schedule_days_hours,
              p.diagnosis, p.zone_neighborhood AS patient_zone, p.service_type
       FROM job_postings jp
       LEFT JOIN patients p ON jp.patient_id = p.id
       WHERE jp.id = $1`,
      [jobPostingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Job posting ${jobPostingId} não encontrado`);
    }

    const { worker_profile_sought, schedule_days_hours, diagnosis } = result.rows[0];

    const parsed = await this.callGroq(worker_profile_sought, schedule_days_hours, diagnosis);

    await this.db.query(
      `UPDATE job_postings SET
         llm_required_sex        = $1,
         llm_required_profession = $2,
         llm_required_specialties = $3,
         llm_required_diagnoses  = $4,
         llm_parsed_schedule     = $5,
         llm_enriched_at         = NOW()
       WHERE id = $6`,
      [
        parsed.required_sex,
        parsed.required_profession,
        JSON.stringify(parsed.required_specialties),
        JSON.stringify(parsed.required_diagnoses),
        parsed.parsed_schedule ? JSON.stringify(parsed.parsed_schedule) : null,
        jobPostingId,
      ]
    );

    return parsed;
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

Devuelve exactamente este JSON:
{
  "required_sex": "M" | "F" | null,
  "required_profession": "AT" | "CUIDADOR" | "AMBOS" | null,
  "required_specialties": ["especialidad1", "especialidad2"],
  "required_diagnoses": ["TEA", "ACV", "Alzheimer"],
  "parsed_schedule": {
    "days": [1, 2, 3, 4, 5],
    "slots": [{"start": "08:00", "end": "16:00"}],
    "interpretation": "descripción legible del horario"
  }
}

Guía de extracción:
- required_sex: solo si se menciona EXPLÍCITAMENTE que se busca hombre o mujer ("se busca mujer" → "F", "se busca varón" → "M"), null si no se especifica
- required_profession: AT = Acompañante Terapéutico, CUIDADOR, AMBOS si acepta ambos roles, null si no está claro
- required_specialties: habilidades o tipos de atención específicos mencionados (ej: "movilización de pacientes", "estimulación cognitiva")
- required_diagnoses: diagnósticos clínicos del paciente que el AT/cuidador debe conocer (extraer del campo diagnóstico y del perfil buscado)
- days: 0=Domingo, 1=Lunes, 2=Martes, 3=Miércoles, 4=Jueves, 5=Viernes, 6=Sábado
- parsed_schedule: null si no hay información de horario. Si hay días pero no horario, omitir slots (array vacío)`;

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
      throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da Groq API');

    return this.validate(JSON.parse(content));
  }

  private validate(raw: Partial<JobPostingLLMFields>): JobPostingLLMFields {
    const validSex = ['M', 'F'];
    const validProfession = ['AT', 'CUIDADOR', 'AMBOS'];

    return {
      required_sex: validSex.includes(raw.required_sex as string)
        ? (raw.required_sex as 'M' | 'F')
        : null,
      required_profession: validProfession.includes(raw.required_profession as string)
        ? (raw.required_profession as 'AT' | 'CUIDADOR' | 'AMBOS')
        : null,
      required_specialties: Array.isArray(raw.required_specialties)
        ? raw.required_specialties.filter(s => typeof s === 'string')
        : [],
      required_diagnoses: Array.isArray(raw.required_diagnoses)
        ? raw.required_diagnoses.filter(d => typeof d === 'string')
        : [],
      parsed_schedule:
        raw.parsed_schedule && Array.isArray(raw.parsed_schedule.days)
          ? {
              days: raw.parsed_schedule.days.filter(d => typeof d === 'number' && d >= 0 && d <= 6),
              slots: Array.isArray(raw.parsed_schedule.slots)
                ? raw.parsed_schedule.slots.filter(
                    s => s && typeof s.start === 'string' && typeof s.end === 'string'
                  )
                : [],
              interpretation: typeof raw.parsed_schedule.interpretation === 'string'
                ? raw.parsed_schedule.interpretation
                : '',
            }
          : null,
    };
  }
}
