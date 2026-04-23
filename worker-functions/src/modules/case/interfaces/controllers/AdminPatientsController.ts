import { Request, Response } from 'express';
import { adminPatientsListSchema } from '../validators/adminPatientsListSchema';
import { PatientQueryRepository } from '../../infrastructure/PatientQueryRepository';

/**
 * AdminPatientsController
 *
 * Endpoints:
 *   GET /api/admin/patients       — list with filters + pagination
 *   GET /api/admin/patients/stats — aggregate counters
 *
 * No business logic here — delegates to PatientQueryRepository.
 * Auth is enforced at route level (requireStaff).
 */
export class AdminPatientsController {
  private readonly repo: PatientQueryRepository;

  constructor() {
    this.repo = new PatientQueryRepository();
  }

  /** GET /api/admin/patients */
  async listPatients(req: Request, res: Response): Promise<void> {
    const parsed = adminPatientsListSchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({
        success: false,
        error: 'Invalid query params',
        details: parsed.error.flatten(),
      });
      return;
    }

    try {
      const { rows, total } = await this.repo.list(parsed.data);

      const data = rows.map((row) => ({
        id: row.id,
        clickupTaskId: row.clickupTaskId,
        firstName: row.firstName,
        lastName: row.lastName,
        diagnosis: row.diagnosis,
        dependencyLevel: row.dependencyLevel,
        clinicalSpecialty: row.clinicalSpecialty,
        serviceType: row.serviceType ?? [],
        documentType: row.documentType,
        documentNumber: row.documentNumber,
        sex: row.sex,
        needsAttention: row.needsAttention,
        attentionReasons: row.attentionReasons,
        createdAt: row.createdAt,
        updatedAt: row.updatedAt,
      }));

      res.status(200).json({ success: true, data, total });
    } catch (error: any) {
      console.error('[AdminPatientsController] listPatients error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to list patients',
        details: error.message,
      });
    }
  }

  /** GET /api/admin/patients/stats */
  async getPatientStats(_req: Request, res: Response): Promise<void> {
    try {
      const stats = await this.repo.stats();
      res.status(200).json({ success: true, data: stats });
    } catch (error: any) {
      console.error('[AdminPatientsController] getPatientStats error:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get patient stats',
        details: error.message,
      });
    }
  }
}
