import { WebhookPartner } from '../domain/WebhookPartner';

export interface IWebhookPartnerRepository {
  findByDisplayName(displayName: string): Promise<WebhookPartner | null>;
  findByName(name: string): Promise<WebhookPartner | null>;
}
