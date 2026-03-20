import { Request, Response } from 'express';
import { UploadWorkerDocumentsUseCase } from '../../application/use-cases/UploadWorkerDocumentsUseCase';
import { ReviewWorkerDocumentsUseCase } from '../../application/use-cases/ReviewWorkerDocumentsUseCase';
import { IWorkerDocumentsRepository } from '../../infrastructure/repositories/WorkerDocumentsRepository';

export class WorkerDocumentsController {
  constructor(
    private uploadUseCase: UploadWorkerDocumentsUseCase,
    private reviewUseCase: ReviewWorkerDocumentsUseCase,
    private documentsRepository: IWorkerDocumentsRepository
  ) {}

  /**
   * POST /api/workers/:id/documents
   * Upload or update worker documents
   */
  async uploadDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { id: workerId } = req.params;
      const {
        resumeCvUrl,
        identityDocumentUrl,
        criminalRecordUrl,
        professionalRegistrationUrl,
        liabilityInsuranceUrl,
        additionalCertificatesUrls,
      } = req.body;

      const documents = await this.uploadUseCase.execute({
        workerId,
        resumeCvUrl,
        identityDocumentUrl,
        criminalRecordUrl,
        professionalRegistrationUrl,
        liabilityInsuranceUrl,
        additionalCertificatesUrls,
      });

      res.status(200).json({
        success: true,
        data: {
          id: documents.id,
          workerId: documents.workerId,
          documentsStatus: documents.documentsStatus,
          resumeCvUrl: documents.resumeCvUrl,
          identityDocumentUrl: documents.identityDocumentUrl,
          criminalRecordUrl: documents.criminalRecordUrl,
          professionalRegistrationUrl: documents.professionalRegistrationUrl,
          liabilityInsuranceUrl: documents.liabilityInsuranceUrl,
          additionalCertificatesUrls: documents.additionalCertificatesUrls,
          submittedAt: documents.submittedAt,
          resubmittedAt: documents.resubmittedAt,
          reviewNotes: documents.reviewNotes,
          reviewedAt: documents.reviewedAt,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error uploading documents:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to upload documents',
      });
    }
  }

  /**
   * GET /api/workers/:id/documents
   * Get worker documents
   */
  async getDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { id: workerId } = req.params;

      const documents = await this.documentsRepository.findByWorkerId(workerId);

      if (!documents) {
        res.status(404).json({
          success: false,
          error: 'Documents not found',
        });
        return;
      }

      res.status(200).json({
        success: true,
        data: {
          id: documents.id,
          workerId: documents.workerId,
          documentsStatus: documents.documentsStatus,
          resumeCvUrl: documents.resumeCvUrl,
          identityDocumentUrl: documents.identityDocumentUrl,
          criminalRecordUrl: documents.criminalRecordUrl,
          professionalRegistrationUrl: documents.professionalRegistrationUrl,
          liabilityInsuranceUrl: documents.liabilityInsuranceUrl,
          additionalCertificatesUrls: documents.additionalCertificatesUrls,
          submittedAt: documents.submittedAt,
          resubmittedAt: documents.resubmittedAt,
          reviewNotes: documents.reviewNotes,
          reviewedBy: documents.reviewedBy,
          reviewedAt: documents.reviewedAt,
          createdAt: documents.createdAt,
          updatedAt: documents.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error getting documents:', error);
      res.status(500).json({
        success: false,
        error: 'Failed to get documents',
      });
    }
  }

  /**
   * PUT /api/workers/:id/documents/review
   * Admin: Review worker documents (approve/reject)
   */
  async reviewDocuments(req: Request, res: Response): Promise<void> {
    try {
      const { id: workerId } = req.params;
      const { documentsStatus, reviewNotes, reviewedBy } = req.body;

      // Validate required fields
      if (!documentsStatus || !['approved', 'rejected'].includes(documentsStatus)) {
        res.status(400).json({
          success: false,
          error: 'documentsStatus must be either "approved" or "rejected"',
        });
        return;
      }

      if (!reviewedBy) {
        res.status(400).json({
          success: false,
          error: 'reviewedBy is required',
        });
        return;
      }

      if (documentsStatus === 'rejected' && !reviewNotes) {
        res.status(400).json({
          success: false,
          error: 'reviewNotes is required when rejecting documents',
        });
        return;
      }

      const documents = await this.reviewUseCase.execute({
        workerId,
        documentsStatus,
        reviewNotes,
        reviewedBy,
      });

      res.status(200).json({
        success: true,
        data: {
          id: documents.id,
          workerId: documents.workerId,
          documentsStatus: documents.documentsStatus,
          reviewNotes: documents.reviewNotes,
          reviewedBy: documents.reviewedBy,
          reviewedAt: documents.reviewedAt,
          updatedAt: documents.updatedAt,
        },
      });
    } catch (error) {
      console.error('Error reviewing documents:', error);
      res.status(400).json({
        success: false,
        error: error instanceof Error ? error.message : 'Failed to review documents',
      });
    }
  }
}
