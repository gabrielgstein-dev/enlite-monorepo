import twilio from 'twilio';
import { IMessagingService, MessageSentResult, SendWhatsAppOptions } from '../../domain/ports/IMessagingService';
import { Result } from '@shared/utils/Result';
import { MessageTemplateRepository } from '../repositories/MessageTemplateRepository';

// Único arquivo que importa 'twilio'. Para migrar para Cloud Function,
// apenas este arquivo é substituído — nada mais muda.
export class TwilioMessagingService implements IMessagingService {
  private client: twilio.Twilio | null;
  private fromNumber: string;
  private isConfigured: boolean;
  private templateRepo: MessageTemplateRepository;

  constructor(templateRepo: MessageTemplateRepository) {
    this.templateRepo = templateRepo;

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

    const template = await this.templateRepo.findBySlug(options.templateSlug);
    if (!template) {
      return Result.fail<MessageSentResult>(`Template '${options.templateSlug}' não encontrado ou inativo`);
    }

    try {
      // statusCallback: URL para receber atualizações de status de entrega do Twilio.
      // Se TWILIO_STATUS_CALLBACK_URL não estiver definido, o campo é omitido.
      const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL || undefined;

      // Template com Content SID → usa Twilio Content API (template aprovado WhatsApp Business)
      //   contentVariables: mapeia variáveis nomeadas ({{name}}) para posicionais ("1", "2", ...)
      //   seguindo a ordem de aparição no body do template.
      // Template sem Content SID → envia body como texto livre (sandbox / free-form)
      let message;
      if (template.contentSid) {
        const mappedVars = this.mapToContentVariables(template.body, options.variables ?? {});
        console.log(
          `[Twilio] Content API — slug=${options.templateSlug} contentSid=${template.contentSid} contentVariables=${JSON.stringify(mappedVars)}`,
        );
        message = await this.client.messages.create({
          from: `whatsapp:${this.fromNumber}`,
          to: `whatsapp:${to}`,
          contentSid: template.contentSid,
          contentVariables: JSON.stringify(mappedVars),
          ...(statusCallback ? { statusCallback } : {}),
        });
      } else {
        message = await this.client.messages.create({
          from: `whatsapp:${this.fromNumber}`,
          to: `whatsapp:${to}`,
          body: this.interpolate(template.body, options.variables ?? {}),
          ...(statusCallback ? { statusCallback } : {}),
        });
      }

      return Result.ok<MessageSentResult>({
        externalId: message.sid,
        status: message.status,
        to,
      });
    } catch (error: any) {
      return Result.fail<MessageSentResult>(`Twilio error: ${error.message}`);
    }
  }

  /**
   * Envia mensagem usando Twilio Content API diretamente (sem template lookup).
   * Para callers que já possuem o contentSid e as variáveis em formato posicional.
   */
  async sendWithContentSid(
    to: string,
    contentSid: string,
    contentVariables: Record<string, string>,
  ): Promise<Result<MessageSentResult>> {
    if (!this.isConfigured || !this.client) {
      return Result.fail<MessageSentResult>('Twilio service not configured.');
    }

    const normalizedTo = this.normalizeNumber(to);
    if (!normalizedTo) {
      return Result.fail<MessageSentResult>(`Invalid phone number: ${to}`);
    }

    try {
      const statusCallback = process.env.TWILIO_STATUS_CALLBACK_URL || undefined;

      const message = await this.client.messages.create({
        from: `whatsapp:${this.fromNumber}`,
        to: `whatsapp:${normalizedTo}`,
        contentSid,
        contentVariables: JSON.stringify(contentVariables),
        ...(statusCallback ? { statusCallback } : {}),
      });

      return Result.ok<MessageSentResult>({
        externalId: message.sid,
        status: message.status,
        to: normalizedTo,
      });
    } catch (error: any) {
      return Result.fail<MessageSentResult>(`Twilio error: ${error.message}`);
    }
  }

  /** Substitui {{variavel}} pelo valor correspondente; mantém o placeholder se não fornecido. */
  private interpolate(body: string, vars: Record<string, string>): string {
    return body.replace(/\{\{(\w+)\}\}/g, (_, key) => vars[key] ?? `{{${key}}}`);
  }

  /**
   * Mapeia variáveis nomeadas para formato posicional da Twilio Content API.
   * Extrai {{placeholders}} do body do template na ordem de aparição e
   * atribui chaves "1", "2", "3", etc. Variáveis duplicadas são ignoradas.
   */
  mapToContentVariables(
    body: string,
    variables: Record<string, string>,
  ): Record<string, string> {
    const result: Record<string, string> = {};
    const seen = new Set<string>();
    let index = 1;

    for (const match of body.matchAll(/\{\{(\w+)\}\}/g)) {
      const key = match[1];
      if (seen.has(key)) continue;
      seen.add(key);
      result[String(index)] = variables[key] ?? '';
      index++;
    }

    return result;
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
