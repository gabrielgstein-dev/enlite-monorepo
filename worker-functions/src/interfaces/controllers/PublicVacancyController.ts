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

const DAY_NAMES = ['domingo', 'lunes', 'martes', 'miercoles', 'jueves', 'viernes', 'sabado'];

/**
 * Converte o schedule do formato Gemini (array) para o formato do frontend (objeto por dia).
 * Gemini: [{dayOfWeek: 1, startTime: "09:00", endTime: "17:00"}]
 * Frontend: {lunes: [{start: "09:00", end: "17:00"}]}
 */
function normalizeSchedule(
  raw: unknown,
): Record<string, { start: string; end: string }[]> | null {
  if (!raw) return null;

  // Já no formato objeto (criação manual pelo admin) — retornar como está
  if (!Array.isArray(raw)) return raw as Record<string, { start: string; end: string }[]>;

  const result: Record<string, { start: string; end: string }[]> = {};
  for (const slot of raw) {
    const dayName = DAY_NAMES[slot.dayOfWeek];
    if (!dayName) continue;
    if (!result[dayName]) result[dayName] = [];
    result[dayName].push({ start: slot.startTime, end: slot.endTime });
  }

  return Object.keys(result).length > 0 ? result : null;
}

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
          jp.vacancy_number,
          jp.title,
          jp.status,
          COALESCE(jp.dependency_level, p.dependency_level) AS dependency_level,
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
          COALESCE(p.zone_neighborhood, CONCAT_WS(', ', jp.city, jp.state), jp.inferred_zone) AS patient_zone
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

      const row = result.rows[0];
      row.schedule = normalizeSchedule(row.schedule);

      res.status(200).json({ success: true, data: row });
    } catch (error: unknown) {
      console.error('[PublicVacancyController] Error fetching vacancy:', error);
      res.status(500).json({ success: false, error: 'Failed to fetch vacancy' });
    }
  }
}
