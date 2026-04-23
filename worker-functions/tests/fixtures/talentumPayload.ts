/**
 * Fixture tipado para o webhook do Talentum.
 *
 * Objetivo: centralizar o shape do payload em um só lugar, tipado pela
 * `z.input<typeof TalentumPrescreeningPayloadSchema>` — assim, qualquer
 * mudança no schema Zod quebra o TypeScript antes do runtime, em vez de
 * propagar falhas silenciosas por dezenas de testes.
 */

import { z } from 'zod';
import { TalentumPrescreeningPayloadSchema } from '../../src/interfaces/validators/talentumPrescreeningSchema';

export type TalentumPayloadInput = z.input<typeof TalentumPrescreeningPayloadSchema>;

export type TalentumSubtype = 'INITIATED' | 'IN_PROGRESS' | 'COMPLETED' | 'ANALYZED';

export type QuestionItem = {
  questionId: string;
  question: string;
  answer: string;
  responseType?: string;
};

export type ResponseBlock = {
  id: string;
  state: QuestionItem[];
};

export type ProfileBlock = {
  id: string;
  firstName: string;
  lastName: string;
  email: string;
  phoneNumber: string;
  cuil?: string;
  registerQuestions?: QuestionItem[];
};

export type PrescreeningBlock = {
  id: string;
  name: string;
};

/** Base data usado pelos testes HTTP (variant PRESCREENING_RESPONSE). */
export const BASE_DATA = {
  prescreening: { id: 'http-psc-base', name: 'Caso HTTP Test' },
  profile: {
    id: 'http-prof-base',
    firstName: 'Ana',
    lastName: 'Lima',
    email: 'ana.webhook@test.local',
    phoneNumber: '+5491100000099',
    cuil: '27-11000000-9',
    registerQuestions: [] as QuestionItem[],
  },
  response: { id: 'http-resp-base', state: [] as QuestionItem[] },
};

/**
 * Constrói um payload `PRESCREENING_RESPONSE` válido com overrides opcionais.
 * O retorno é tipado contra o schema Zod — se o schema mudar, o TS quebra aqui.
 */
export function envelope(overrides: {
  subtype?: TalentumSubtype;
  prescreening?: Partial<PrescreeningBlock>;
  profile?: Partial<ProfileBlock>;
  response?: ResponseBlock;
} = {}): TalentumPayloadInput {
  return {
    action: 'PRESCREENING_RESPONSE',
    subtype: overrides.subtype ?? 'INITIATED',
    data: {
      prescreening: { ...BASE_DATA.prescreening, ...overrides.prescreening },
      profile: { ...BASE_DATA.profile, ...overrides.profile },
      response: overrides.response ?? BASE_DATA.response,
    },
  };
}
