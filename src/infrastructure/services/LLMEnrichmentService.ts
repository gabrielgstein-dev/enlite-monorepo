/**
 * LLMEnrichmentService
 * Usa Groq API (free tier) com Llama 3.1 70B.
 * GROQ_API_KEY=gsk_... (https://console.groq.com)
 */

import { EncuadreRepository } from '../repositories/EncuadreRepository';
import { Encuadre, LLMExtractedExperience, LLMInterestLevel } from '../../domain/entities/Encuadre';

interface LLMResponse {
  interest_level: LLMInterestLevel;
  extracted_experience: LLMExtractedExperience;
  availability_notes: string | null;
  real_rejection_reason: string | null;
  follow_up_potential: boolean;
}

export class LLMEnrichmentService {
  private apiKey: string;
  private model: string;
  private encuadreRepo: EncuadreRepository;

  constructor() {
    this.apiKey = process.env.GROQ_API_KEY ?? '';
    this.model = process.env.GROQ_MODEL ?? 'llama-3.1-70b-versatile';
    this.encuadreRepo = new EncuadreRepository();
    if (!this.apiKey) throw new Error('GROQ_API_KEY não configurado. Obter em https://console.groq.com');
  }

  async enrichPending(batchSize = 10): Promise<{ processed: number; errors: number }> {
    let processed = 0;
    let errors = 0;

    while (true) {
      const batch = await this.encuadreRepo.findPendingLLMEnrichment(batchSize);
      if (batch.length === 0) break;

      console.log(`[LLM] Processando batch de ${batch.length} encuadres...`);

      for (const encuadre of batch) {
        try {
          await this.enrichOne(encuadre);
          processed++;
        } catch (err) {
          console.error(`[LLM] Erro no encuadre ${encuadre.id}:`, (err as Error).message);
          errors++;
          await this.encuadreRepo.updateLLMFields({
            id: encuadre.id,
            llmInterestLevel: 'NULO',
            llmExtractedExperience: { diagnoses: [], years: null, specialties: [], zones: [] },
            llmAvailabilityNotes: null,
            llmRealRejectionReason: null,
            llmFollowUpPotential: false,
            llmRawResponse: { error: (err as Error).message },
          });
        }
        await sleep(100); // rate limit Groq free: 30 req/min
      }
    }

    console.log(`[LLM] Concluído. Processados: ${processed}, Erros: ${errors}`);
    return { processed, errors };
  }

  async enrichOne(encuadre: Encuadre): Promise<void> {
    const text = buildObsText(encuadre);
    if (!text) return;
    const response = await this.callGroq(text, encuadre.resultado);
    await this.encuadreRepo.updateLLMFields({
      id: encuadre.id,
      llmInterestLevel: response.interest_level,
      llmExtractedExperience: response.extracted_experience,
      llmAvailabilityNotes: response.availability_notes,
      llmRealRejectionReason: response.real_rejection_reason,
      llmFollowUpPotential: response.follow_up_potential,
      llmRawResponse: response as unknown as Record<string, unknown>,
    });
  }

  private async callGroq(obsText: string, resultado: string | null): Promise<LLMResponse> {
    const systemPrompt = `Eres un asistente especializado en análisis de entrevistas de trabajadores de salud (Acompañantes Terapéuticos y Cuidadores) en Argentina. Responde ÚNICAMENTE con JSON válido, sin texto adicional, sin markdown.`;

    const userPrompt = `Analiza las observaciones de reclutamiento. Resultado formal: ${resultado ?? 'sin registrar'}

Observaciones:
${obsText}

Devuelve exactamente este JSON:
{
  "interest_level": "ALTO" | "MEDIO" | "BAIXO" | "NULO",
  "extracted_experience": {
    "diagnoses": ["TEA", "TLP", "Alzheimer", ...],
    "years": numero_o_null,
    "specialties": ["..."],
    "zones": ["zonas geográficas mencionadas"]
  },
  "availability_notes": "restricciones/preferencias de horario, o null",
  "real_rejection_reason": "motivo real si difiere del formal, o null",
  "follow_up_potential": true | false
}

Guía: ALTO=muy motivado | MEDIO=interesado con condiciones | BAIXO=dudoso | NULO=sin info
follow_up_potential=true si vale contactar para casos futuros aunque haya rechazado`;

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.1,
        max_tokens: 500,
        response_format: { type: 'json_object' },
      }),
    });

    if (!response.ok) {
      throw new Error(`Groq API error ${response.status}: ${await response.text()}`);
    }

    const data = await response.json() as { choices: Array<{ message: { content: string } }> };
    const content = data.choices[0]?.message?.content;
    if (!content) throw new Error('Resposta vazia da Groq API');

    return validateLLMResponse(JSON.parse(content));
  }
}

function buildObsText(encuadre: Encuadre): string {
  const parts: string[] = [];
  if (encuadre.obsReclutamiento?.trim()) parts.push(`Obs. Reclutamiento: ${encuadre.obsReclutamiento.trim()}`);
  if (encuadre.obsEncuadre?.trim()) parts.push(`Obs. Encuadre: ${encuadre.obsEncuadre.trim()}`);
  if (encuadre.obsAdicionales?.trim()) parts.push(`Obs. Adicionales: ${encuadre.obsAdicionales.trim()}`);
  return parts.join('\n\n');
}

function validateLLMResponse(raw: Partial<LLMResponse>): LLMResponse {
  const validLevels: LLMInterestLevel[] = ['ALTO', 'MEDIO', 'BAIXO', 'NULO'];
  return {
    interest_level: validLevels.includes(raw.interest_level as LLMInterestLevel)
      ? raw.interest_level as LLMInterestLevel : 'NULO',
    extracted_experience: {
      diagnoses: Array.isArray(raw.extracted_experience?.diagnoses)
        ? raw.extracted_experience!.diagnoses.filter(d => typeof d === 'string') : [],
      years: typeof raw.extracted_experience?.years === 'number'
        ? raw.extracted_experience.years : null,
      specialties: Array.isArray(raw.extracted_experience?.specialties)
        ? raw.extracted_experience!.specialties.filter(s => typeof s === 'string') : [],
      zones: Array.isArray(raw.extracted_experience?.zones)
        ? raw.extracted_experience!.zones.filter(z => typeof z === 'string') : [],
    },
    availability_notes: typeof raw.availability_notes === 'string' ? raw.availability_notes : null,
    real_rejection_reason: typeof raw.real_rejection_reason === 'string' ? raw.real_rejection_reason : null,
    follow_up_potential: typeof raw.follow_up_potential === 'boolean' ? raw.follow_up_potential : false,
  };
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
