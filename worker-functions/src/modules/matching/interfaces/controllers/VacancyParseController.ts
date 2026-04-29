import { Request, Response } from 'express';
import { GeminiVacancyParserService } from '@modules/integration';
import { MatchPdfAddressToPatientAddressUseCase } from '../../application/MatchPdfAddressToPatientAddressUseCase';
import { ResolvePatientFieldClashUseCase } from '../../application/ResolvePatientFieldClashUseCase';

/**
 * VacancyParseController
 *
 * POST /api/admin/vacancies/parse
 *
 * Parses a PDF with Gemini, computes address-match candidates for the
 * identified patient, and detects field clashes between PDF values and
 * the existing patient record — all WITHOUT persisting anything.
 *
 * Split from VacancyCrudController to respect the 400-line limit.
 */
export class VacancyParseController {
  private readonly gemini: GeminiVacancyParserService;
  private readonly matchAddressUseCase: MatchPdfAddressToPatientAddressUseCase;
  private readonly resolveClashUseCase: ResolvePatientFieldClashUseCase;

  constructor() {
    this.gemini = new GeminiVacancyParserService();
    this.matchAddressUseCase = new MatchPdfAddressToPatientAddressUseCase();
    this.resolveClashUseCase = new ResolvePatientFieldClashUseCase();
  }

  async parseVacancy(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'PDF file is required' });
        return;
      }

      const { workerType } = req.body;
      if (!workerType || !['AT', 'CUIDADOR'].includes(workerType)) {
        res.status(400).json({
          success: false,
          error: 'workerType must be AT or CUIDADOR',
        });
        return;
      }

      const pdfBase64 = req.file.buffer.toString('base64');
      const parsed = await this.gemini.parseFromPdf(pdfBase64, workerType);

      const caseNumber = parsed.vacancy.case_number;

      // city/state no longer extracted by Gemini (dropped in migration 152).
      // Address matching uses patient_addresses directly — no text hint available from PDF.
      const { patientId, candidates } = await this.matchAddressUseCase.execute({
        caseNumber,
        addressText: null,
      });

      // Resolve field clashes (only if we found the patient)
      const fieldClashes =
        patientId
          ? await this.resolveClashUseCase.execute({
              patientId,
              pdfPathologyTypes: parsed.vacancy.pathology_types ?? null,
              pdfDependencyLevel: parsed.vacancy.dependency_level ?? null,
            })
          : [];

      res.status(200).json({
        success: true,
        data: {
          parsed,
          addressMatches: candidates,
          fieldClashes,
          patientId,
        },
      });
    } catch (error: any) {
      console.error('[VacancyParse] Error parsing vacancy PDF:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to parse vacancy PDF',
        details: error.message,
      });
    }
  }
}
