import { Request, Response } from 'express';
import { DatabaseConnection } from '../../infrastructure/database/DatabaseConnection';

/**
 * PublicVacancyController
 *
 * Endpoint público (sem auth) para leitura de dados não-sensíveis de uma vaga.
 * Usado pela página pública de vaga (landing page de candidatos).
 *
 * Dados sensíveis do paciente (nome, diagnóstico, insurance) são deliberadamente
 * excluídos desta query — apenas zone_neighborhood é exposto como patient_zone.
 */
export class PublicVacancyController {
  private readonly db = DatabaseConnection.getInstance().getPool();

  async getById(req: Request, res: Response): Promise<void> {
    try {
      const { id } = req.params;

      const result = await this.db.query(
        `
        SELECT
          jp.id,
          jp.case_number,
          jp.title,
          jp.status,
          jp.dependency_level,
          jp.pathology_types,
          jp.required_professions,
          jp.required_sex,
          jp.age_range_min,
          jp.age_range_max,
          jp.worker_attributes,
          jp.schedule,
          jp.schedule_days_hours,
          jp.service_device_types,
          jp.salary_text,
          jp.talentum_description,
          jp.talentum_whatsapp_url,
          jp.country,
          jp.created_at,
          p.zone_neighborhood AS patient_zone
        FROM job_postings jp
        LEFT JOIN patients p ON jp.patient_id = p.id
        WHERE jp.id = $1
          AND jp.deleted_at IS NULL
        `,
        [id],
      );

      if (result.rows.length === 0) {
        res.status(404).json({ success: false, error: 'Vacancy not found' });
        return;
      }

      res.status(200).json({ success: true, data: result.rows[0] });
    } catch (error: unknown) {
      console.error('[PublicVacancyController] Error fetching vacancy:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch vacancy' });
    }
  }
}
