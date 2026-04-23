import { Request, Response } from 'express';
import multer from 'multer';
import { Pool } from 'pg';
import { DatabaseConnection } from '@shared/database/DatabaseConnection';
import { MatchmakingService } from '../../infrastructure/services/MatchmakingService';
import { GeminiVacancyParserService } from '@modules/integration';

const MAX_PDF_SIZE = 20 * 1024 * 1024; // 20 MB

export const pdfUploadMiddleware = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: MAX_PDF_SIZE },
  fileFilter: (_req, file, cb) => {
    if (file.mimetype === 'application/pdf' || file.originalname.endsWith('.pdf')) {
      cb(null, true);
    } else {
      cb(new Error('Only PDF files are accepted'));
    }
  },
}).single('pdf');

/**
 * VacancyCrudController
 *
 * Write endpoints: create, update, delete vacancies.
 * Split from VacanciesController to respect the 400-line limit.
 */
export class VacancyCrudController {
  private db: Pool;

  constructor() {
    this.db = DatabaseConnection.getInstance().getPool();
  }

  async createVacancy(req: Request, res: Response): Promise<void> {
    try {
      const {
        case_number,
        title,
        patient_id,
        required_professions,
        required_sex,
        age_range_min,
        age_range_max,
        worker_profile_sought,
        required_experience,
        worker_attributes,
        schedule,
        work_schedule,
        pathology_types,
        dependency_level,
        service_device_types,
        providers_needed,
        salary_text,
        payment_day,
        daily_obs,
        city,
        state,
      } = req.body;

      const vnResult = await this.db.query("SELECT nextval('job_postings_vacancy_number_seq') AS vn");
      const vacancyNumber = parseInt(vnResult.rows[0].vn);
      const computedTitle = `CASO ${case_number}-${vacancyNumber}`;

      const query = `
        INSERT INTO job_postings (
          vacancy_number, case_number, title, description, patient_id,
          required_professions, required_sex,
          age_range_min, age_range_max,
          worker_profile_sought, required_experience, worker_attributes,
          schedule, work_schedule,
          pathology_types, dependency_level,
          service_device_types,
          providers_needed, salary_text, payment_day,
          daily_obs, city, state,
          status, country
        ) VALUES (
          $1, $2, $3, '', $4,
          $5, $6,
          $7, $8,
          $9, $10, $11,
          $12, $13,
          $14, $15,
          $16,
          $17, $18, $19,
          $20, $21, $22,
          'BUSQUEDA', 'AR'
        )
        RETURNING *
      `;

      const result = await this.db.query(query, [
        vacancyNumber,
        case_number,
        computedTitle,
        patient_id,
        required_professions ?? [],
        required_sex ?? null,
        age_range_min ?? null,
        age_range_max ?? null,
        worker_profile_sought ?? null,
        required_experience ?? null,
        worker_attributes ?? null,
        schedule ? JSON.stringify(schedule) : null,
        work_schedule ?? null,
        pathology_types ?? null,
        dependency_level ?? null,
        service_device_types ?? [],
        providers_needed,
        salary_text ?? 'A convenir',
        payment_day ?? null,
        daily_obs ?? null,
        city ?? null,
        state ?? null,
      ]);

      const newVacancy = result.rows[0];

      // Match in background
      setImmediate(() => {
        try {
          const matchingService = new MatchmakingService();
          matchingService.matchWorkersForJob(newVacancy.id)
            .then(matchResult => {
              console.log(`[VacancyCrud] Auto-match done for ${newVacancy.id}: ${matchResult.candidates.length} candidates`);
            })
            .catch(err => {
              console.error(`[VacancyCrud] Auto-match error for ${newVacancy.id}:`, err.message);
            });
        } catch (err: any) {
          console.warn(`[VacancyCrud] Background match unavailable for ${newVacancy.id}: ${err.message}`);
        }
      });

      res.status(201).json({ success: true, data: newVacancy });
    } catch (error: any) {
      console.error('[VacancyCrud] Error creating vacancy:', error);
      res.status(500).json({ success: false, error: 'Failed to create vacancy', details: error.message });
    }
  }

  async updateVacancy(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;
      const updates = req.body;

      const allowedFields = [
        'title', 'case_number', 'patient_id',
        'required_professions', 'required_sex',
        'age_range_min', 'age_range_max',
        'worker_profile_sought', 'required_experience', 'worker_attributes',
        'schedule', 'work_schedule',
        'pathology_types', 'dependency_level',
        'service_device_types',
        'providers_needed', 'salary_text', 'payment_day',
        'daily_obs', 'city', 'state',
        'status',
      ];

      const jsonbFields = new Set(['schedule']);
      const setClause: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      Object.keys(updates).forEach(key => {
        if (allowedFields.includes(key)) {
          let value = updates[key];
          if (jsonbFields.has(key) && typeof value === 'object' && value !== null) {
            value = JSON.stringify(value);
          }
          setClause.push(`${key} = $${paramIndex}`);
          values.push(value);
          paramIndex++;
        }
      });

      if (setClause.length === 0) {
        res.status(400).json({ success: false, error: 'No valid fields to update' });
        return;
      }

      values.push(id);
      const query = `
        UPDATE job_postings
        SET ${setClause.join(', ')}, updated_at = NOW()
        WHERE id = $${paramIndex}
        RETURNING *
      `;

      const result = await this.db.query(query, values);

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Vacancy not found' });
        return;
      }

      res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error: any) {
      console.error('[VacancyCrud] Error updating vacancy:', error);
      res.status(500).json({ success: false, error: 'Failed to update vacancy', details: error.message });
    }
  }

  async parseFromText(req: Request, res: Response): Promise<void> {
    try {
      const { text, workerType } = req.body;

      if (!text || typeof text !== 'string' || text.trim().length === 0) {
        res.status(400).json({ success: false, error: 'text is required' });
        return;
      }

      if (!workerType || !['AT', 'CUIDADOR'].includes(workerType)) {
        res.status(400).json({ success: false, error: 'workerType must be AT or CUIDADOR' });
        return;
      }

      const service = new GeminiVacancyParserService();
      const result = await service.parseFromText(text.trim(), workerType);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[VacancyCrud] Error parsing vacancy from text:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to parse vacancy text',
        details: error.message,
      });
    }
  }

  async parseFromPdf(req: Request, res: Response): Promise<void> {
    try {
      if (!req.file) {
        res.status(400).json({ success: false, error: 'PDF file is required' });
        return;
      }

      const { workerType } = req.body;
      if (!workerType || !['AT', 'CUIDADOR'].includes(workerType)) {
        res.status(400).json({ success: false, error: 'workerType must be AT or CUIDADOR' });
        return;
      }

      const pdfBase64 = req.file.buffer.toString('base64');
      const service = new GeminiVacancyParserService();
      const result = await service.parseFromPdf(pdfBase64, workerType);

      res.status(200).json({ success: true, data: result });
    } catch (error: any) {
      console.error('[VacancyCrud] Error parsing vacancy from PDF:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to parse vacancy PDF',
        details: error.message,
      });
    }
  }

  async deleteVacancy(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.db.query(
        `UPDATE job_postings SET status = 'closed', updated_at = NOW() WHERE id = $1 RETURNING id`,
        [id]
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Vacancy not found' });
        return;
      }

      res.status(200).json({ success: true, message: 'Vacancy deleted successfully' });
    } catch (error: any) {
      console.error('[VacancyCrud] Error deleting vacancy:', error);
      res.status(500).json({ success: false, error: 'Failed to delete vacancy', details: error.message });
    }
  }
}
