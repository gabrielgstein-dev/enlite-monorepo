import { Result } from '../shared/Result';

export interface SendWhatsAppOptions {
  /** Número de destino em formato E.164: +5511999999999 */
  to: string;
  body: string;
  /** SID de template aprovado pela Meta (opcional) */
  templateSid?: string;
  templateVariables?: Record<string, string>;
}

export interface MessageSentResult {
  messageSid: string;
  status: string;
  to: string;
}

export interface IMessagingService {
  sendWhatsApp(options: SendWhatsAppOptions): Promise<Result<MessageSentResult>>;
}
