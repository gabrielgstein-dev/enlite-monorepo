import { Response } from 'express';

export interface TalentumWebhookContext {
  environment: 'production' | 'test';
  partnerId: string | null;
}

export interface TalentumWebhookHandler<TPayload> {
  handle(payload: TPayload, ctx: TalentumWebhookContext, res: Response): Promise<void>;
}
