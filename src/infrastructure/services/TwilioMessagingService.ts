import twilio from 'twilio';
import { IMessagingService, MessageSentResult, SendWhatsAppOptions } from '../../domain/ports/IMessagingService';
import { Result } from '../../domain/shared/Result';

export class TwilioMessagingService implements IMessagingService {
  private client: twilio.Twilio | null;
  private fromNumber: string;
  private isConfigured: boolean;

  constructor() {
    const accountSid = process.env.TWILIO_ACCOUNT_SID;
    const authToken = process.env.TWILIO_AUTH_TOKEN;
    this.fromNumber = process.env.TWILIO_WHATSAPP_NUMBER || '';

    this.isConfigured = !!(accountSid && authToken && this.fromNumber);

    if (this.isConfigured) {
      this.client = twilio(accountSid!, authToken!);
    } else {
      this.client = null;
      console.warn('[Twilio] Service not configured - messaging features will be disabled');
    }
  }

  async sendWhatsApp(options: SendWhatsAppOptions): Promise<Result<MessageSentResult>> {
    if (!this.isConfigured || !this.client) {
      return Result.fail<MessageSentResult>('Twilio service not configured. Please set TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN, and TWILIO_WHATSAPP_NUMBER environment variables.');
    }

    const to = this.normalizeNumber(options.to);

    if (!to) {
      return Result.fail<MessageSentResult>(`Invalid phone number: ${options.to}`);
    }

    try {
      const message = await this.client.messages.create({
        from: `whatsapp:${this.fromNumber}`,
        to: `whatsapp:${to}`,
        body: options.body,
        ...(options.templateSid && {
          contentSid: options.templateSid,
          contentVariables: options.templateVariables
            ? JSON.stringify(options.templateVariables)
            : undefined,
        }),
      });

      return Result.ok<MessageSentResult>({
        messageSid: message.sid,
        status: message.status,
        to,
      });
    } catch (error: any) {
      return Result.fail<MessageSentResult>(`Twilio error: ${error.message}`);
    }
  }

  /**
   * Garante formato E.164 (+DDI...).
   * Números argentinos sem o '9' de celular são corrigidos automaticamente.
   */
  private normalizeNumber(raw: string): string | null {
    if (!raw) return null;

    // Remove tudo que não for dígito ou '+'
    const cleaned = raw.replace(/[^\d+]/g, '');

    // Já está em E.164
    if (cleaned.startsWith('+')) return cleaned;

    // Argentina: números de 10 dígitos sem DDI
    if (cleaned.length === 10) return `+54${cleaned}`;

    // Argentina: 11 dígitos com DDI 54 mas sem '+'
    if (cleaned.startsWith('54') && cleaned.length === 13) return `+${cleaned}`;

    // Brasil: 11 dígitos com DDI 55
    if (cleaned.startsWith('55') && cleaned.length === 13) return `+${cleaned}`;

    // Retorna com '+' prefixado se já tiver DDI
    if (cleaned.length >= 11) return `+${cleaned}`;

    return null;
  }
}
