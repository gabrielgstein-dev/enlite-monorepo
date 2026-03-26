import { Result } from '../shared/Result';

export interface SendWhatsAppOptions {
  /** Número de destino em formato E.164: +5511999999999 */
  to: string;
  /** Slug do template em message_templates (ex: 'talent_search_welcome') */
  templateSlug: string;
  /** Variáveis para interpolação — ex: { name: 'Maria' } */
  variables?: Record<string, string>;
}

export interface MessageSentResult {
  /** Twilio SID (in-process) ou ID da Cloud Function (futuro) */
  externalId: string;
  status: string;
  to: string;
}

export interface IMessagingService {
  sendWhatsApp(options: SendWhatsAppOptions): Promise<Result<MessageSentResult>>;
}
