/**
 * MatchmakingLLMScorer
 *
 * Fase 3 do Matchmaking: chama a Groq API com o perfil do worker e da vaga
 * e retorna um score 0-100 com reasoning, strengths e red_flags.
 *
 * Não persiste nada — só lê dados e chama a API externa.
 */

import { JobPosting, WorkerCandidate, ActiveCase, LLMMatchScore } from './MatchmakingTypes';

export class MatchmakingLLMScorer {
  private apiKey: string;
  private model: string;

  constructor(apiKey: string, model: string) {
    this.apiKey = apiKey;
    this.model = model;
  }

  async score(
    job: JobPosting,
    worker: WorkerCandidate,
    sex: string,
    distanceKm: number | null,
    activeCases: ActiveCase[],
  ): Promise<LLMMatchScore> {
    const systemPrompt =
      `Eres un experto en reclutamiento de Acompañantes Terapéuticos (AT) y Cuidadores en Argentina. ` +
      `Evalúa la compatibilidad entre una vacante y un candidato. ` +
      `Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.`;

    const userPrompt = this.buildPrompt(job, worker, sex, distanceKm, activeCases);

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
        ? parsed.strengths.filter((s): s is string => typeof s === 'string')
        : [],
      red_flags: Array.isArray(parsed.red_flags)
        ? parsed.red_flags.filter((s): s is string => typeof s === 'string')
        : [],
    };
  }

  private buildPrompt(
    job: JobPosting,
    worker: WorkerCandidate,
    sex: string,
    distanceKm: number | null,
    activeCases: ActiveCase[],
  ): string {
    const activeCasesText =
      activeCases.length === 0
        ? 'Sin casos activos'
        : activeCases
            .map(c => `Caso ${c.case_number ?? '?'} (${(c.schedule_text || 'horario no disponible').substring(0, 80)})`)
            .join(' | ');

    return `VACANTE:
- Perfil buscado: ${job.workerProfileSought || 'No especificado'}
- Horarios requeridos: ${job.scheduleDaysHours || 'No especificado'}
- Diagnóstico del paciente: ${job.diagnosis || 'No especificado'}
- Zona del paciente: ${job.patientZone || 'No especificada'}
- Profesión requerida: ${job.requiredProfessions?.join(', ') || 'No especificada'}
- Sexo requerido: ${job.requiredSex || 'Sin preferencia'}
- Patologías relevantes: ${job.pathologyTypes || 'Ninguna especificada'}

CANDIDATO:
- Ocupación registrada: ${worker.occupation || 'No especificada'}
- Sexo: ${sex || 'No informado'}
- Zona/dirección: ${worker.workZone || worker.workerAddress || 'No registrada'} | Zona de interés: ${worker.interestZone || 'No registrada'}
- Distancia al paciente: ${distanceKm !== null ? `${distanceKm.toFixed(1)} km` : 'Sin coordenadas'}
- Casos activos actuales (${activeCases.length}): ${activeCasesText}
- Preferencias diagnósticas declaradas: ${worker.diagnosticPreferences.join(', ') || 'No especificadas'}
- Historial de rechazos: ${Object.entries(worker.rejectionHistory).map(([k, v]) => `${k}: ${v}`).join(', ') || 'Sin rechazos previos'}
- Rating de calidad promedio: ${worker.avgQualityRating?.toFixed(1) ?? 'Sin evaluaciones'}

Evalúa la compatibilidad considerando: adecuación del perfil profesional, compatibilidad de horarios, experiencia con el diagnóstico del paciente.

Devuelve exactamente este JSON:
{
  "score": 0-100,
  "reasoning": "explicación concisa en 1-3 oraciones",
  "strengths": ["fortaleza1", "fortaleza2"],
  "red_flags": ["alerta1", "alerta2"]
}`;
  }
}
