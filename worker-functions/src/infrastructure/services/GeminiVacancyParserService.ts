/**
 * GeminiVacancyParserService
 *
 * Calls Google Gemini to parse free-text vacancy data into structured JSON.
 * Replaces the manual Gem workflow where recruiters would paste case data
 * into Google AI Studio and manually copy results.
 *
 * Input:  free text with case details + worker type (AT or CUIDADOR)
 * Output: structured JSON with vacancy fields, prescreening questions,
 *         FAQ, and Talentum description sections.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

// ─────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────

export interface ParsedVacancyResult {
  vacancy: {
    case_number: number | null;
    title: string;
    required_professions: string[];
    required_sex: string | null;
    age_range_min: number | null;
    age_range_max: number | null;
    required_experience: string | null;
    worker_attributes: string | null;
    schedule: Array<{ dayOfWeek: number; startTime: string; endTime: string }>;
    work_schedule: string | null;
    pathology_types: string | null;
    dependency_level: string | null;
    service_device_types: string[];
    providers_needed: number;
    salary_text: string | null;
    payment_day: string | null;
    daily_obs: string | null;
    city: string | null;
    state: string | null;
    status: string;
  };
  prescreening: {
    questions: Array<{
      question: string;
      responseType: string[];
      desiredResponse: string;
      weight: number;
      required: boolean;
      analyzed: boolean;
      earlyStoppage: boolean;
    }>;
    faq: Array<{
      question: string;
      answer: string;
    }>;
  };
  description: {
    titulo_propuesta: string;
    descripcion_propuesta: string;
    perfil_profesional: string;
  };
}

export type WorkerType = 'AT' | 'CUIDADOR';

// ─────────────────────────────────────────────────────────────────
// JSON output format (appended to every system prompt)
// ─────────────────────────────────────────────────────────────────

const TALENTUM_VACANCY_ONLY_INSTRUCTIONS = `
FORMATO DE RESPUESTA OBLIGATORIO:
Tu respuesta DEBE ser ÚNICAMENTE un JSON válido con la estructura descrita abajo.
No incluyas texto, markdown ni explicaciones fuera del JSON.

CONTEXTO:
Estás parseando la descripción de un proyecto publicado en Talentum (plataforma de pre-screening).
Tu tarea es extraer SOLO los campos de vacancy. NO generes prescreening ni description — ya existen en Talentum.

MAPEO DE VALORES (usar SIEMPRE estos códigos, no texto libre):
- Sexo: Hombre→"M", Mujer→"F", Indistinto→"BOTH", no especificado→null
- Profesión: AT→"AT", Cuidador/a→"CAREGIVER", Enfermero/a→"NURSE", Kinesiólogo/a→"KINESIOLOGIST", Psicólogo/a→"PSYCHOLOGIST"
  - Si el texto menciona "acompañante terapéutico" o "AT" → "AT"
  - Si el texto menciona "cuidador/a", "asistente domiciliario/a", o funciones de cuidado sin mención terapéutica → "CAREGIVER"
- Dispositivo: domiciliario→"DOMICILIARIO", escolar→"ESCOLAR", ambulatorio→"AMBULATORIO", internación/institución→"INSTITUCIONAL"
- Jornada: jornada completa→"full-time", medio turno→"part-time", flexible→"flexible"
- Día de semana: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb

ESQUEMA JSON:
{
  "required_professions": ["AT"|"CAREGIVER"|"NURSE"|"KINESIOLOGIST"|"PSYCHOLOGIST"],
  "required_sex": "M"|"F"|"BOTH"|null,
  "age_range_min": <integer o null>,
  "age_range_max": <integer o null>,
  "required_experience": "<texto o null>",
  "worker_attributes": "<atributos separados por coma o null>",
  "schedule": [
    { "dayOfWeek": <0-6>, "startTime": "HH:MM", "endTime": "HH:MM" }
  ],
  "work_schedule": "full-time"|"part-time"|"flexible"|null,
  "pathology_types": "<diagnósticos o null>",
  "dependency_level": "<nivel o null>",
  "service_device_types": ["DOMICILIARIO"|"ESCOLAR"|"AMBULATORIO"|"INSTITUCIONAL"],
  "providers_needed": <integer, default 1>,
  "salary_text": "<texto o null>",
  "payment_day": "<texto o null>",
  "daily_obs": "<observaciones o null>",
  "city": "<ciudad/barrio o null>",
  "state": "<provincia, ej: CABA, Provincia de Buenos Aires, o null>",
  "status": "BUSQUEDA"
}

REGLAS:
- Extraer SOLO lo que está en el texto. Si un campo no puede inferirse, devolver null.
- NUNCA inventar datos que no estén en la descripción.
- providers_needed default 1 si no se especifica.
- status siempre "BUSQUEDA".
`;

const JSON_OUTPUT_INSTRUCTIONS = `
FORMATO DE RESPUESTA OBLIGATORIO:
Tu respuesta DEBE ser ÚNICAMENTE un JSON válido con la estructura descrita abajo.
No incluyas texto, markdown ni explicaciones fuera del JSON.

MAPEO DE VALORES (usar SIEMPRE estos códigos, no texto libre):
- Sexo: Hombre→"M", Mujer→"F", Indistinto→"BOTH", no especificado→null
- Profesión: AT→"AT", Cuidador/a→"CAREGIVER", Enfermero/a→"NURSE", Kinesiólogo/a→"KINESIOLOGIST", Psicólogo/a→"PSYCHOLOGIST"
- Dispositivo: domiciliario→"DOMICILIARIO", escolar→"ESCOLAR", ambulatorio→"AMBULATORIO", internación/institución→"INSTITUCIONAL"
- Jornada: jornada completa→"full-time", medio turno→"part-time", flexible→"flexible"
- Día de semana: 0=Dom, 1=Lun, 2=Mar, 3=Mié, 4=Jue, 5=Vie, 6=Sáb

ESQUEMA JSON:
{
  "vacancy": {
    "case_number": <integer o null>,
    "title": "CASO <number>",
    "required_professions": ["AT"|"CAREGIVER"|"NURSE"|"KINESIOLOGIST"|"PSYCHOLOGIST"],
    "required_sex": "M"|"F"|"BOTH"|null,
    "age_range_min": <integer o null>,
    "age_range_max": <integer o null>,
    "required_experience": "<texto o null>",
    "worker_attributes": "<atributos separados por coma o null>",
    "schedule": [
      { "dayOfWeek": <0-6>, "startTime": "HH:MM", "endTime": "HH:MM" }
    ],
    "work_schedule": "full-time"|"part-time"|"flexible",
    "pathology_types": "<diagnósticos>",
    "dependency_level": "<nivel>",
    "service_device_types": ["DOMICILIARIO"|"ESCOLAR"|"AMBULATORIO"|"INSTITUCIONAL"],
    "providers_needed": <integer, default 1>,
    "salary_text": "<texto o 'A convenir'>",
    "payment_day": "<texto o null>",
    "daily_obs": "<observaciones o null>",
    "city": "<ciudad/barrio>",
    "state": "<provincia, ej: CABA, Provincia de Buenos Aires>",
    "status": "BUSQUEDA"
  },
  "prescreening": {
    "questions": [
      {
        "question": "<pregunta en español argentino con voseo>",
        "responseType": ["text", "audio"],
        "desiredResponse": "Apto: ... / Aceptable: ... / No Apto: ...",
        "weight": <1-10>,
        "required": <boolean>,
        "analyzed": true,
        "earlyStoppage": <boolean>
      }
    ],
    "faq": [
      { "question": "<pregunta frecuente>", "answer": "<respuesta>" }
    ]
  },
  "description": {
    "titulo_propuesta": "CASO <N>, <TIPO> - <ZONA>",
    "descripcion_propuesta": "<texto Descripción de la Propuesta>",
    "perfil_profesional": "<texto Perfil Profesional Sugerido>"
  }
}

REGLAS PARA PRESCREENING:
- Generar entre 5 y 8 preguntas relevantes al caso
- Usar voseo argentino (¿Tenés...?, ¿Podés...?, ¿Contás con...?)
- desiredResponse con criterios Apto/Aceptable/No Apto
- weight 8-10 para formación y experiencia, 5-7 para disponibilidad, 3-5 para soft skills
- earlyStoppage: true en preguntas sobre formación obligatoria o zona
- Generar entre 3 y 5 FAQ (horario, zona, pago, supervisión)

REGLAS PARA DESCRIPCIÓN:
- Español argentino profesional
- No incluir nombre del paciente ni datos de contacto
- descripcion_propuesta: resumen objetivo (zona, dispositivo, horarios, patología, objetivo)
- perfil_profesional: formación requerida, experiencia, atributos valorados
`;

// ─────────────────────────────────────────────────────────────────
// Service
// ─────────────────────────────────────────────────────────────────

export class GeminiVacancyParserService {
  private apiKey: string;
  private model: string;
  private promptDir: string;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? '';
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    this.promptDir = join(__dirname, '../../../prompt');
  }

  async parseFromText(
    text: string,
    workerType: WorkerType,
  ): Promise<ParsedVacancyResult> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY não configurado');
    }

    console.log(
      `[GeminiParser] Parsing vacancy text, workerType=${workerType}, len=${text.length}`,
    );

    const userParts = [{ text }];
    return this.callGeminiAndParse(userParts, workerType);
  }

  async parseFromPdf(
    pdfBase64: string,
    workerType: WorkerType,
  ): Promise<ParsedVacancyResult> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY não configurado');
    }

    const sizeKB = Math.round((pdfBase64.length * 3) / 4 / 1024);
    console.log(
      `[GeminiParser] Parsing PDF, workerType=${workerType}, sizeKB=${sizeKB}`,
    );

    const userParts = [
      { inlineData: { mimeType: 'application/pdf', data: pdfBase64 } },
    ];
    return this.callGeminiAndParse(userParts, workerType);
  }

  private async callGeminiAndParse(
    userParts: Array<Record<string, any>>,
    workerType: WorkerType,
  ): Promise<ParsedVacancyResult> {
    const systemPrompt = this.buildSystemPrompt(workerType);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: userParts }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(
        `[GeminiParser] Gemini API error HTTP ${response.status}: ${errBody}`,
      );
      throw new Error(`Gemini API error ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
    };

    if (data.usageMetadata) {
      console.log(
        `[GeminiParser] Tokens: prompt=${data.usageMetadata.promptTokenCount} ` +
          `completion=${data.usageMetadata.candidatesTokenCount}`,
      );
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini API');

    const parsed = JSON.parse(content) as ParsedVacancyResult;

    // Ensure sane defaults
    parsed.vacancy.status = parsed.vacancy.status || 'BUSQUEDA';
    parsed.vacancy.providers_needed = parsed.vacancy.providers_needed || 1;
    parsed.vacancy.required_professions =
      parsed.vacancy.required_professions?.length > 0
        ? parsed.vacancy.required_professions
        : [workerType === 'AT' ? 'AT' : 'CAREGIVER'];

    console.log(
      `[GeminiParser] OK: case=${parsed.vacancy.case_number}, ` +
        `questions=${parsed.prescreening.questions.length}, ` +
        `faq=${parsed.prescreening.faq.length}`,
    );

    return parsed;
  }

  async parseFromTalentumDescription(
    description: string,
    title: string,
  ): Promise<ParsedVacancyResult['vacancy']> {
    if (!this.apiKey) {
      throw new Error('GEMINI_API_KEY não configurado');
    }

    console.log(
      `[GeminiParser] Parsing Talentum description, title="${title}", len=${description.length}`,
    );

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: TALENTUM_VACANCY_ONLY_INSTRUCTIONS }] },
        contents: [{ role: 'user', parts: [{ text: `Título del proyecto: ${title}\n\n${description}` }] }],
        generationConfig: {
          temperature: 0.3,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
        },
      }),
    });

    if (!response.ok) {
      const errBody = await response.text();
      console.error(
        `[GeminiParser] Gemini API error HTTP ${response.status}: ${errBody}`,
      );
      throw new Error(`Gemini API error ${response.status}: ${errBody}`);
    }

    const data = (await response.json()) as {
      candidates: Array<{
        content: { parts: Array<{ text: string }> };
      }>;
      usageMetadata?: {
        promptTokenCount: number;
        candidatesTokenCount: number;
      };
    };

    if (data.usageMetadata) {
      console.log(
        `[GeminiParser] Talentum tokens: prompt=${data.usageMetadata.promptTokenCount} ` +
          `completion=${data.usageMetadata.candidatesTokenCount}`,
      );
    }

    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) throw new Error('Empty response from Gemini API');

    const parsed = JSON.parse(content) as Omit<ParsedVacancyResult['vacancy'], 'case_number' | 'title'>;

    // Extract case_number from title (source of truth)
    const match = title.match(/CASO\s+(\d+)/i);
    const caseNumber = match ? parseInt(match[1], 10) : null;

    const vacancy: ParsedVacancyResult['vacancy'] = {
      ...parsed,
      case_number: caseNumber,
      title: caseNumber ? `CASO ${caseNumber}` : title,
      status: 'BUSQUEDA',
      providers_needed: parsed.providers_needed || 1,
      required_professions:
        parsed.required_professions?.length > 0
          ? parsed.required_professions
          : ['AT'],
    };

    console.log(
      `[GeminiParser] Talentum OK: case=${vacancy.case_number}, professions=${vacancy.required_professions}`,
    );

    return vacancy;
  }

  private buildSystemPrompt(workerType: WorkerType): string {
    const fileName =
      workerType === 'AT' ? 'AT_VACANCY.md' : 'CARER_VACANCY.md';
    const promptPath = join(this.promptDir, fileName);

    let fileContent = '';
    try {
      fileContent = readFileSync(promptPath, 'utf-8').trim();
    } catch {
      console.warn(`[GeminiParser] Prompt file not found: ${promptPath}`);
    }

    if (!fileContent) {
      console.warn(
        `[GeminiParser] Prompt file empty for ${workerType}, using JSON schema only`,
      );
    }

    return (fileContent ? fileContent + '\n\n' : '') + JSON_OUTPUT_INSTRUCTIONS;
  }
}
