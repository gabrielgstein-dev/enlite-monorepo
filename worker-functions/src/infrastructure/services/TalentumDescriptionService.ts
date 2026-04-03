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
  requiredProfessions: string[];
  requiredSex?: string;
  requiredExperience?: string;
  workerAttributes?: string;
  ageRangeMin?: number;
  ageRangeMax?: number;
  providersNeeded?: number;
  schedule?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
  workSchedule?: string;
  city?: string;
  state?: string;
  serviceDeviceTypes?: string[];
  pathologyTypes?: string;
  dependencyLevel?: string;
  salaryText?: string;
  paymentDay?: string;
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

1. "Descripción de la Propuesta:" — Resumen objetivo del caso. DEBE incluir: tipo de profesional buscado, zona y localidad, dispositivo de servicio, días y horarios disponibles, jornada, cantidad de prestadores necesarios, y objetivo general del acompañamiento basado en las patologías y nivel de dependencia.

2. "Perfil Profesional Sugerido:" — Descripción del perfil ideal. DEBE incluir: sexo (si es excluyente), rango etario del prestador (si aplica), formación requerida, experiencia necesaria, y atributos valorados.

Reglas:
- OBLIGATORIO: Incluir TODA la información proporcionada en el input. No omitir ningún dato.
- NUNCA incluir nombre del paciente, datos de contacto o ID interno
- NUNCA inventar datos que no están en el input
- Usar español argentino profesional
- Ser conciso pero completo (max 250 palabras para las 2 secciones)
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
         jp.case_number, jp.title,
         jp.required_professions, jp.required_sex,
         jp.required_experience, jp.worker_attributes,
         jp.age_range_min, jp.age_range_max,
         jp.providers_needed, jp.schedule, jp.work_schedule,
         jp.city, jp.state, jp.service_device_types,
         jp.pathology_types, jp.dependency_level,
         jp.salary_text, jp.payment_day
       FROM job_postings jp
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
      requiredProfessions: row.required_professions ?? [],
      requiredSex: row.required_sex ?? undefined,
      requiredExperience: row.required_experience ?? undefined,
      workerAttributes: row.worker_attributes ?? undefined,
      ageRangeMin: row.age_range_min ?? undefined,
      ageRangeMax: row.age_range_max ?? undefined,
      providersNeeded: row.providers_needed ?? undefined,
      schedule: row.schedule ?? undefined,
      workSchedule: row.work_schedule ?? undefined,
      city: row.city ?? undefined,
      state: row.state ?? undefined,
      serviceDeviceTypes: row.service_device_types ?? undefined,
      pathologyTypes: row.pathology_types ?? undefined,
      dependencyLevel: row.dependency_level ?? undefined,
      salaryText: row.salary_text ?? undefined,
      paymentDay: row.payment_day ?? undefined,
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

  private formatSchedule(schedule?: Array<{ dayOfWeek: number; startTime: string; endTime: string }>): string {
    if (!schedule || schedule.length === 0) return 'No especificado';
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    return schedule
      .map(s => `${days[s.dayOfWeek] ?? '?'}: ${s.startTime}-${s.endTime}`)
      .join(', ');
  }

  private formatAgeRange(min?: number, max?: number): string {
    if (min && max) return `De ${min} a ${max} años`;
    if (min) return `Desde ${min} años`;
    if (max) return `Hasta ${max} años`;
    return 'No especificado';
  }

  private async callGroq(input: GenerateDescriptionInput): Promise<string> {
    const profession = input.requiredProfessions.length > 0
      ? input.requiredProfessions.join(', ')
      : 'No especificado';
    const devices = input.serviceDeviceTypes && input.serviceDeviceTypes.length > 0
      ? input.serviceDeviceTypes.join(', ')
      : 'No especificado';

    const userPrompt = `Datos de la vacante (INCLUIR TODOS en la descripción):
- N° de Caso: ${input.caseNumber || 'No especificado'}
- Tipo de Profesional: ${profession}
- Sexo requerido: ${input.requiredSex || 'Indistinto'}
- Rango etario del prestador: ${this.formatAgeRange(input.ageRangeMin, input.ageRangeMax)}
- Experiencia requerida: ${input.requiredExperience || 'No especificado'}
- Atributos del prestador: ${input.workerAttributes || 'No especificado'}
- Cantidad de prestadores: ${input.providersNeeded ?? 1}
- Zona: ${[input.city, input.state].filter(Boolean).join(', ') || 'No especificado'}
- Dispositivo de servicio: ${devices}
- Jornada: ${input.workSchedule || 'No especificado'}
- Horarios: ${this.formatSchedule(input.schedule)}
- Patologías: ${input.pathologyTypes || 'No especificado'}
- Nivel de dependencia: ${input.dependencyLevel || 'No especificado'}
- Salario: ${input.salaryText || 'A convenir'}
- Día de pago: ${input.paymentDay || 'No especificado'}`;

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
