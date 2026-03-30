import { z } from 'zod';

// ─────────────────────────────────────────────────────────────────
// Schemas individuais reutilizados em registerQuestions e response.state
// ─────────────────────────────────────────────────────────────────

const TalentumQuestionItemSchema = z.object({
  questionId:   z.string().min(1).trim(),
  question:     z.string().min(1).trim(),
  answer:       z.string().trim(),        // string vazia permitida (sem resposta ainda)
  responseType: z.string().min(1).trim(),
}).strict();

// ─────────────────────────────────────────────────────────────────
// Schema principal do payload do webhook Talentum
// ─────────────────────────────────────────────────────────────────

export const TalentumPrescreeningPayloadSchema = z.object({
  prescreening: z.object({
    id:     z.string().min(1).trim(),
    name:   z.string().min(1).trim(),
    status: z.enum(['INITIATED', 'IN_PROGRESS', 'COMPLETED', 'ANALYZED']),
  }).strict(),

  profile: z.object({
    id:                z.string().min(1).trim(),
    firstName:         z.string().min(1).trim(),
    lastName:          z.string().min(1).trim(),
    email:             z.string().email().toLowerCase().trim(),
    phoneNumber:       z.string().min(1).trim(),
    cuil:              z.string().min(1).trim(),
    registerQuestions: z.array(TalentumQuestionItemSchema).default([]),
  }).strict(),

  response: z.object({
    id:    z.string().min(1).trim(),
    state: z.array(TalentumQuestionItemSchema).default([]),
  }).strict(),
}).strict();

export type TalentumPrescreeningPayloadInput = z.input<typeof TalentumPrescreeningPayloadSchema>;
export type TalentumPrescreeningPayloadParsed = z.infer<typeof TalentumPrescreeningPayloadSchema>;
