import { Request, Response, NextFunction } from 'express';
import { GoogleApiKeyValidator } from '../../../infrastructure/services/GoogleApiKeyValidator';
import { IWebhookPartnerRepository } from '../../../domain/ports/IWebhookPartnerRepository';
import { PartnerContext } from '../../../domain/entities/WebhookPartner';

// =====================
// PartnerAuthMiddleware — valida X-Partner-Key via Google API e verifica
// autorização do parceiro para o path solicitado.
//
// Fluxo:
//   1. Lê X-Partner-Key do header
//   2. Valida via Google API (lookupKey) → obtém displayName
//   3. Busca parceiro no banco por displayName
//   4. Verifica se o path está em allowed_paths (glob simples: 'talentum/*')
//   5. Injeta partnerContext no request
//
// Bypass automático quando USE_MOCK_AUTH=true (ambiente de testes).
// =====================

export class PartnerAuthMiddleware {
  constructor(
    private readonly googleValidator: GoogleApiKeyValidator,
    private readonly partnerRepo: IWebhookPartnerRepository,
  ) {}

  /**
   * Middleware Express que valida a API Key do parceiro e verifica autorização.
   * Retorna 401 se key inválida, 403 se parceiro não autorizado para o path.
   */
  requirePartnerKey() {
    return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
      // Bypass para testes E2E
      if (process.env.USE_MOCK_AUTH === 'true') {
        const mockContext: PartnerContext = {
          partnerId: 'mock-partner-id',
          partnerName: 'mock-partner',
          isTest: req.baseUrl.includes('/webhooks-test'),
        };
        (req as any).partnerContext = mockContext;
        return next();
      }

      // 1. Ler X-Partner-Key
      const apiKey = req.headers['x-partner-key'] as string | undefined;
      if (!apiKey) {
        res.status(401).json({ error: 'X-Partner-Key header required' });
        return;
      }

      // 2. Validar via Google API → obter displayName
      const displayName = await this.googleValidator.validate(apiKey);
      if (!displayName) {
        res.status(401).json({ error: 'Invalid or revoked API key' });
        return;
      }

      // 3. Buscar parceiro por displayName
      const partner = await this.partnerRepo.findByDisplayName(displayName);
      if (!partner) {
        console.warn(`[PartnerAuth] displayName="${displayName}" não registrado ou inativo`);
        res.status(403).json({ error: 'Partner not registered or inactive' });
        return;
      }

      // 4. Verificar autorização do path
      const webhookPath = this.extractWebhookPath(req);
      if (!this.isPathAllowed(partner.allowedPaths, webhookPath)) {
        console.warn(`[PartnerAuth] partner="${partner.name}" tentou acessar path="${webhookPath}" não autorizado`);
        res.status(403).json({ error: 'Partner not authorized for this webhook path' });
        return;
      }

      // 5. Determinar environment pelo prefixo da URL
      const isTest = req.baseUrl.includes('/webhooks-test');

      // 6. Injetar partnerContext
      const partnerContext: PartnerContext = {
        partnerId: partner.id,
        partnerName: partner.name,
        isTest,
      };
      (req as any).partnerContext = partnerContext;

      next();
    };
  }

  /**
   * Extrai o path relativo do webhook a partir da URL.
   * Ex: baseUrl="/api/webhooks", path="/talentum/prescreening"
   *   → webhookPath = "talentum/prescreening"
   */
  private extractWebhookPath(req: Request): string {
    // req.baseUrl = '/api/webhooks' ou '/api/webhooks-test'
    // req.path = '/talentum/prescreening'
    // Queremos: 'talentum/prescreening'
    return req.path.replace(/^\//, '');
  }

  /**
   * Verifica se o path solicitado está coberto por algum dos allowed_paths.
   * Suporta glob simples: 'talentum/*' permite qualquer sub-path de talentum.
   */
  private isPathAllowed(allowedPaths: string[], requestedPath: string): boolean {
    return allowedPaths.some(pattern => {
      if (pattern.endsWith('/*')) {
        const prefix = pattern.slice(0, -2); // 'talentum/*' → 'talentum'
        return requestedPath.startsWith(prefix + '/') || requestedPath === prefix;
      }
      return pattern === requestedPath;
    });
  }
}
