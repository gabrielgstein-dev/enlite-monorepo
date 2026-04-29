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

import {
  VACANCY_RESPONSE_SCHEMA,
  TALENTUM_VACANCY_RESPONSE_SCHEMA,
  TALENTUM_VACANCY_ONLY_INSTRUCTIONS,
  JSON_OUTPUT_INSTRUCTIONS,
} from './gemini-vacancy-constants';
import { GoogleDocsPromptProvider } from './GoogleDocsPromptProvider';

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
    /** Transit field: passed to patients.diagnosis via createWithPatientUpdate. Not persisted in job_postings. */
    pathology_types?: string | null;
    /** Transit field: passed to patients.dependency_level via createWithPatientUpdate. Not persisted in job_postings. */
    dependency_level?: string | null;
    providers_needed: number;
    salary_text: string | null;
    payment_day: string | null;
    daily_obs: string | null;
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
// Service
// ─────────────────────────────────────────────────────────────────

export class GeminiVacancyParserService {
  private apiKey: string;
  private model: string;
  private promptProvider: GoogleDocsPromptProvider;

  constructor() {
    this.apiKey = process.env.GEMINI_API_KEY ?? '';
    this.model = process.env.GEMINI_MODEL ?? 'gemini-2.5-flash';
    this.promptProvider = new GoogleDocsPromptProvider();
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
    const systemPrompt = await this.buildSystemPrompt(workerType);
    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: systemPrompt }] },
        contents: [{ role: 'user', parts: userParts }],
        generationConfig: {
          temperature: 0,
          maxOutputTokens: 8192,
          responseMimeType: 'application/json',
          responseSchema: VACANCY_RESPONSE_SCHEMA,
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

    let parsed = JSON.parse(content) as ParsedVacancyResult;

    // Ensure sane defaults
    parsed.vacancy.status = parsed.vacancy.status || 'SEARCHING';
    parsed.vacancy.providers_needed = parsed.vacancy.providers_needed || 1;
    parsed.vacancy.required_professions =
      parsed.vacancy.required_professions?.length > 0
        ? parsed.vacancy.required_professions
        : [workerType === 'AT' ? 'AT' : 'CAREGIVER'];

    // Retry missing critical fields with a focused second call
    const originalText = userParts
      .filter((p) => 'text' in p)
      .map((p) => (p as { text: string }).text)
      .join('\n');
    if (originalText) {
      const missing = this.detectMissingFields(parsed.vacancy);
      if (missing.length > 0) {
        console.log(
          `[GeminiParser] Missing fields detected: ${missing.join(', ')}. Retrying...`,
        );
        parsed.vacancy = await this.retryMissingFields(
          parsed.vacancy,
          originalText,
          missing,
        );
      }
    }

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
          temperature: 0,
          maxOutputTokens: 4096,
          responseMimeType: 'application/json',
          responseSchema: TALENTUM_VACANCY_RESPONSE_SCHEMA,
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
      status: 'SEARCHING',
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

  private detectMissingFields(
    vacancy: ParsedVacancyResult['vacancy'],
  ): string[] {
    const critical: Array<{ key: keyof ParsedVacancyResult['vacancy']; label: string }> = [
      { key: 'age_range_min', label: 'age_range_min' },
      { key: 'age_range_max', label: 'age_range_max' },
      { key: 'required_sex', label: 'required_sex' },
      { key: 'required_experience', label: 'required_experience' },
      { key: 'salary_text', label: 'salary_text' },
      { key: 'work_schedule', label: 'work_schedule' },
    ];
    const missing: string[] = [];
    for (const { key, label } of critical) {
      if (vacancy[key] === null || vacancy[key] === undefined) {
        missing.push(label);
      }
    }
    if (!vacancy.schedule || vacancy.schedule.length === 0) {
      missing.push('schedule');
    }
    return missing;
  }

  private async retryMissingFields(
    vacancy: ParsedVacancyResult['vacancy'],
    originalText: string,
    missingFields: string[],
  ): Promise<ParsedVacancyResult['vacancy']> {
    const fieldList = missingFields.join(', ');
    const prompt =
      `El siguiente texto fue analizado pero estos campos quedaron vacíos: ${fieldList}.\n` +
      `Revisá el texto nuevamente y extraé SOLO los campos faltantes.\n` +
      `Respondé ÚNICAMENTE con un JSON que contenga solo los campos que pudiste extraer.\n` +
      `Si realmente no hay información para un campo, omitilo del JSON.\n\n` +
      `Texto original:\n${originalText}`;

    const url =
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ role: 'user', parts: [{ text: prompt }] }],
          generationConfig: {
            temperature: 0,
            maxOutputTokens: 2048,
            responseMimeType: 'application/json',
          },
        }),
      });

      if (!response.ok) {
        console.warn(`[GeminiParser] Retry call failed HTTP ${response.status}, keeping original`);
        return vacancy;
      }

      const data = (await response.json()) as {
        candidates: Array<{ content: { parts: Array<{ text: string }> } }>;
      };
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) return vacancy;

      const patch = JSON.parse(content) as Record<string, unknown>;
      let patched = 0;
      for (const field of missingFields) {
        if (patch[field] !== undefined && patch[field] !== null) {
          (vacancy as Record<string, unknown>)[field] = patch[field];
          patched++;
        }
      }
      console.log(
        `[GeminiParser] Retry patched ${patched}/${missingFields.length} fields`,
      );
    } catch (err) {
      console.warn(`[GeminiParser] Retry failed, keeping original:`, err);
    }
    return vacancy;
  }

  private async buildSystemPrompt(workerType: WorkerType): Promise<string> {
    const docId =
      workerType === 'AT'
        ? process.env.PROMPT_DOC_ID_AT ?? ''
        : process.env.PROMPT_DOC_ID_CUIDADOR ?? '';

    const fileContent = await this.promptProvider.getPrompt(docId);

    return fileContent + '\n\n' + JSON_OUTPUT_INSTRUCTIONS;
  }
}
