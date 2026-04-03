/**
 * TalentumDescriptionService
 *
 * Uses Groq (Llama 3.3 70B) to generate the formatted vacancy description
 * that Talentum expects when creating a prescreening project.
 *
 * The output has 3 sections:
 *   1. "Descripcion de la Propuesta:" — objective summary
 *   2. "Perfil Profesional Sugerido:" — ideal candidate profile
 *   3. "El Marco de Acompanamiento:" — fixed institutional text
 *
 * Follows the same Groq integration pattern as JobPostingEnrichmentService.
 */

import { Pool } from 'pg';
import { DatabaseConnection } from '../database/DatabaseConnection';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface GenerateDescriptionInput {
  caseNumber: string;
  title: string;
  workerProfileSought: string;
  scheduleDaysHours: string;
  patientAge?: number;
  patientDiagnosis?: string;
  patientDependencyLevel?: string;
  patientCity?: string;
  patientState?: string;
  llmRequiredSex?: string;
  llmRequiredProfession?: string[];
}

export interface GeneratedDescription {
  title: string;
  description: string;
}

// ─────────────────────────────────────────────────────────────────
// Fixed text for section 3 (always appended verbatim)
// ─────────────────────────────────────────────────────────────────

const MARCO_TEXT =
  'El Marco de Acompañamiento:\n' +
  'EnLite Health Solutions ofrece a los prestadores un marco de trabajo ' +
  'profesional y organizado, donde cada acompañamiento o cuidado se ' +
  'realiza dentro de un proyecto terapéutico claro, con supervisión ' +
  'clínica y soporte continuo del equipo de Coordinación Clínica ' +
  'formado por psicólogas. Nuestra propuesta de valor es brindarles ' +
  'casos acordes a su perfil y formación, con respaldo administrativo ' +
  'y clínico, para que puedan enfocarse en lo más importante: el ' +
  'bienestar del paciente.';

// ─────────────────────────────────────────────────────────────────
// System prompt
// ─────────────────────────────────────────────────────────────────

const SYSTEM_PROMPT = `Sos un especialista en redacción de propuestas de prestación de servicios terapéuticos para EnLite Health Solutions.

Tu tarea es generar el texto de descripción de una vacante para publicar en la plataforma Talentum. El texto debe tener EXACTAMENTE estas 2 secciones (la tercera se agrega automáticamente):

1. "Descripción de la Propuesta:" — Resumen objetivo del caso sin datos sensibles del paciente. Incluir: tipo de profesional buscado, zona, horarios, objetivo del acompañamiento.

2. "Perfil Profesional Sugerido:" — Descripción del perfil ideal. Incluir: sexo (si excluyente), formación, experiencia requerida, habilidades específicas.

Reglas:
- NUNCA incluir nombre del paciente, datos de contacto o ID interno
- NUNCA inventar datos que no están en el input
- Usar español argentino profesional
- Ser conciso pero completo (max 200 palabras para las 2 secciones)
- Retornar SOLO el texto, sin markdown, sin títulos extras`;

// ─────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────

export class TalentumDescriptionService {
  private db: Pool;
  private apiKey: string;
  private model: string;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
    this.apiKey = process.env.GROQ_API_KEY ?? '';
    this.model = process.env.GROQ_MODEL ?? 'llama-3.3-70b-versatile';
    if (!this.apiKey) throw new Error('GROQ_API_KEY não configurado');
  }

  /**
   * Generates a Talentum-ready description for a job posting.
   * Fetches vacancy + patient data from DB, calls Groq, appends the fixed
   * "Marco de Acompañamiento" section, and saves to job_postings.talentum_description.
   */
  async generateDescription(jobPostingId: string): Promise<GeneratedDescription> {
    console.log(`[TalentumDesc] Generating description for job_posting ${jobPostingId}`);

    const result = await this.db.query(
      `SELECT
         jp.case_number,
         jp.title,
         jp.worker_profile_sought,
         jp.schedule_days_hours,
         p.age                  AS patient_age,
         p.diagnosis            AS patient_diagnosis,
         p.dependency_level     AS patient_dependency_level,
         p.zone_neighborhood    AS patient_city,
         p.province             AS patient_state,
         le.llm_required_sex,
         le.llm_required_profession
       FROM job_postings jp
       LEFT JOIN patients p ON jp.patient_id = p.id
       LEFT JOIN job_postings_llm_enrichment le ON le.job_posting_id = jp.id
       WHERE jp.id = $1`,
      [jobPostingId]
    );

    if (result.rows.length === 0) {
      throw new Error(`Job posting ${jobPostingId} not found`);
    }

    const row = result.rows[0];
    const input: GenerateDescriptionInput = {
      caseNumber: row.case_number?.toString() ?? '',
      title: row.title ?? `Caso ${row.case_number}`,
      workerProfileSought: row.worker_profile_sought ?? '',
      scheduleDaysHours: row.schedule_days_hours ?? '',
      patientAge: row.patient_age ?? undefined,
      patientDiagnosis: row.patient_diagnosis ?? undefined,
      patientDependencyLevel: row.patient_dependency_level ?? undefined,
      patientCity: row.patient_city ?? undefined,
      patientState: row.patient_state ?? undefined,
      llmRequiredSex: row.llm_required_sex ?? undefined,
      llmRequiredProfession: row.llm_required_profession ?? undefined,
    };

    const llmText = await this.callGroq(input);

    // Append the fixed institutional section 3
    const fullDescription = `${llmText.trim()}\n\n${MARCO_TEXT}`;

    // Persist in job_postings.talentum_description (CA-3.6)
    await this.db.query(
      `UPDATE job_postings SET talentum_description = $1, updated_at = NOW() WHERE id = $2`,
      [fullDescription, jobPostingId]
    );

    console.log(`[TalentumDesc] Description saved for job_posting ${jobPostingId}`);

    return {
      title: input.title,
      description: fullDescription,
    };
  }

  private async callGroq(input: GenerateDescriptionInput): Promise<string> {
    const profession = Array.isArray(input.llmRequiredProfession)
      ? input.llmRequiredProfession.join(', ')
      : 'No especificado';

    const userPrompt = `Datos de la vacante:
- Caso: ${input.caseNumber || 'No especificado'}
- Perfil buscado: ${input.workerProfileSought || 'No especificado'}
- Horarios: ${input.scheduleDaysHours || 'No especificado'}
- Zona: ${[input.patientCity, input.patientState].filter(Boolean).join(', ') || 'No especificado'}
- Diagnóstico: ${input.patientDiagnosis || 'No especificado'}
- Edad paciente: ${input.patientAge ? `${input.patientAge} años` : 'No especificado'}
- Nivel de dependencia: ${input.patientDependencyLevel || 'No especificado'}
- Sexo requerido: ${input.llmRequiredSex || 'No especificado'}
- Profesión: ${profession}`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.3,
        max_tokens: 800,
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(`[TalentumDesc] Groq API error HTTP ${response.status}: ${errBody}`);
      throw new Error(`Groq API error ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as {
      choices: Array<{ message: { content: string } }>;
      usage?: Record<string, number>;
    };
    const content = data.choices[0]?.message?.content;

    if (data.usage) {
      console.log(
        `[TalentumDesc] Groq tokens: prompt=${data.usage.prompt_tokens} completion=${data.usage.completion_tokens}`
      );
    }

    if (!content) throw new Error('Empty response from Groq API');

    return content;
  }
}
