import { Request, Response } from 'express';
import { Pool } from 'pg';
import { z } from 'zod';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';

const SOCIAL_CHANNELS = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'site'] as const;
type SocialChannel = (typeof SOCIAL_CHANNELS)[number];

const GenerateLinkBodySchema = z.object({
  channel: z.enum(SOCIAL_CHANNELS),
});

/**
 * VacancySocialLinksController
 *
 * Gera links encurtados via Short.io com UTM tracking por canal social.
 * Cada link aponta para a página pública da vaga com parâmetros UTM.
 *
 * Endpoints:
 *   POST /api/admin/vacancies/:id/social-links — Gera short link para um canal
 */
export class VacancySocialLinksController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  /**
   * POST /api/admin/vacancies/:id/social-links
   *
   * Body: { channel: "facebook" | "instagram" | "whatsapp" | "linkedin" | "site" }
   *
   * 1. Busca case_number e vacancy_number da vaga
   * 2. Monta URL pública com UTM params
   * 3. Chama Short.io API para encurtar
   * 4. Salva no JSONB social_short_links
   * 5. Retorna o short link gerado
   */
  async generateSocialLink(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const parseResult = GenerateLinkBodySchema.safeParse(req.body);
      if (!parseResult.success) {
        res.status(400).json({
          success: false,
          error: 'Invalid request body. Expected { channel: "facebook" | "instagram" | "whatsapp" | "linkedin" | "site" }',
          details: parseResult.error.flatten().fieldErrors,
        });
        return;
      }

      const { channel } = parseResult.data;

      // Busca vaga
      const vacancyResult = await this.db.query<{
        case_number: number | null;
        vacancy_number: number;
        social_short_links: Record<string, string>;
      }>(
        'SELECT case_number, vacancy_number, COALESCE(social_short_links, \'{}\'::jsonb) as social_short_links FROM job_postings WHERE id = $1 AND deleted_at IS NULL',
        [id],
      );

      if (vacancyResult.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Vacancy not found' });
        return;
      }

      const { case_number, vacancy_number, social_short_links } = vacancyResult.rows[0];

      if (case_number == null) {
        res.status(400).json({ success: false, error: 'Vacancy has no case_number — cannot build public URL' });
        return;
      }

      // Monta URL pública com UTM
      const baseUrl = `https://app.enlite.health/vacantes/caso${case_number}-${vacancy_number}`;
      const utmParams = new URLSearchParams({
        utm_source: channel,
        utm_medium: 'social',
        utm_campaign: `caso${case_number}-${vacancy_number}`,
      });
      const originalURL = `${baseUrl}?${utmParams.toString()}`;

      // Chama Short.io
      const apiKey = process.env.SHORT_IO_API_KEY;
      const domain = process.env.SHORT_IO_DOMAIN;

      if (!apiKey || !domain) {
        res.status(500).json({ success: false, error: 'Short.io not configured (missing SHORT_IO_API_KEY or SHORT_IO_DOMAIN env vars)' });
        return;
      }

      const shortIoResponse = await fetch('https://api.short.io/links', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: apiKey,
        },
        body: JSON.stringify({
          domain,
          originalURL,
          title: `Caso ${case_number}-${vacancy_number} — ${channel}`,
        }),
      });

      if (!shortIoResponse.ok) {
        const errorBody = await shortIoResponse.text();
        console.error('[VacancySocialLinksController] Short.io error:', shortIoResponse.status, errorBody);
        res.status(502).json({ success: false, error: 'Failed to create short link', details: errorBody });
        return;
      }

      const shortIoData = await shortIoResponse.json() as { shortURL: string };
      const shortURL = shortIoData.shortURL;

      // Persiste no JSONB (merge com links existentes)
      const updatedLinks = { ...social_short_links, [channel]: shortURL };

      await this.db.query(
        `UPDATE job_postings
         SET social_short_links = $1::jsonb,
             updated_at = NOW()
         WHERE id = $2`,
        [JSON.stringify(updatedLinks), id],
      );

      res.status(200).json({
        success: true,
        data: {
          channel,
          shortURL,
          originalURL,
          social_short_links: updatedLinks,
        },
      });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Unknown error';
      console.error('[VacancySocialLinksController] Error generating social link:', message);
      res.status(500).json({ success: false, error: 'Failed to generate social link', details: message });
    }
  }
}
