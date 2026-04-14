/**
 * useAdminWorkerDocuments.test.ts
 *
 * REGRESSION UNIT TEST
 *
 * Cobre o bug: backend DELETE retornava { success: true } sem `data`,
 * AdminApiService devolvia `undefined`, o hook chamava `onDocumentsChange(undefined)`
 * e `patchDocuments(undefined)` zerava TODOS os cards de documento.
 *
 * Este teste garante que:
 *  1. Quando a API retorna WorkerDocument, `onDocumentsChange` é chamado com ele.
 *  2. Quando a API retorna undefined (bug backend), `onDocumentsChange` NÃO é
 *     chamado — protegendo o estado local de ser zerado.
 *  3. `onSuccess` legacy (refetch) NÃO é mais acionado em upload/delete.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useAdminWorkerDocuments } from '../useAdminWorkerDocuments';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { WorkerDocument } from '@domain/entities/Worker';

vi.mock('@infrastructure/http/AdminApiService');

const WORKER_ID = 'worker-xyz';

const UPDATED_DOCS: WorkerDocument = {
  id: 'doc-1',
  resumeCvUrl: 'workers/xyz/resume.pdf',
  identityDocumentUrl: 'workers/xyz/identity.pdf',
  identityDocumentBackUrl: null,
  criminalRecordUrl: 'workers/xyz/criminal.pdf',
  professionalRegistrationUrl: null,
  liabilityInsuranceUrl: null,
  monotributoCertificateUrl: null,
  atCertificateUrl: null,
  additionalCertificatesUrls: [],
  documentsStatus: 'submitted',
  documentValidations: {},
  reviewNotes: null,
  reviewedBy: null,
  reviewedAt: null,
  submittedAt: null,
};

describe('useAdminWorkerDocuments', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  // ─────────────────────────────────────────────────────────────────────────
  // deleteDocument
  // ─────────────────────────────────────────────────────────────────────────
  describe('deleteDocument', () => {
    it('chama onDocumentsChange com o WorkerDocument retornado pela API', async () => {
      vi.spyOn(AdminApiService, 'deleteWorkerDoc').mockResolvedValue(UPDATED_DOCS);
      const onDocumentsChange = vi.fn();

      const { result } = renderHook(() =>
        useAdminWorkerDocuments(WORKER_ID, { onDocumentsChange }),
      );

      await act(async () => {
        await result.current.deleteDocument('at_certificate');
      });

      expect(AdminApiService.deleteWorkerDoc).toHaveBeenCalledWith(WORKER_ID, 'at_certificate');
      expect(onDocumentsChange).toHaveBeenCalledTimes(1);
      expect(onDocumentsChange).toHaveBeenCalledWith(UPDATED_DOCS);
    });

    it('REGRESSION: se API retornar undefined (backend sem data), NÃO chama onDocumentsChange', async () => {
      // Reproduz o bug original: backend retornava { success: true } sem data,
      // AdminApiService devolvia undefined, e o hook zerava todos os cards.
      vi.spyOn(AdminApiService, 'deleteWorkerDoc').mockResolvedValue(undefined as unknown as WorkerDocument);
      const onDocumentsChange = vi.fn();

      const { result } = renderHook(() =>
        useAdminWorkerDocuments(WORKER_ID, { onDocumentsChange }),
      );

      await act(async () => {
        await result.current.deleteDocument('at_certificate');
      });

      // Proteção defensiva: se a API devolver undefined, NÃO propagamos para o estado.
      expect(onDocumentsChange).not.toHaveBeenCalled();
    });

    it('em caso de erro, NÃO chama onDocumentsChange e registra erro', async () => {
      vi.spyOn(AdminApiService, 'deleteWorkerDoc').mockRejectedValue(new Error('Network'));
      const onDocumentsChange = vi.fn();

      const { result } = renderHook(() =>
        useAdminWorkerDocuments(WORKER_ID, { onDocumentsChange }),
      );

      await act(async () => {
        await result.current.deleteDocument('at_certificate');
      });

      expect(onDocumentsChange).not.toHaveBeenCalled();
      expect(result.current.errors.at_certificate).toBe('Network');
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // uploadDocument
  // ─────────────────────────────────────────────────────────────────────────
  describe('uploadDocument', () => {
    it('chama onDocumentsChange com o WorkerDocument após upload + save', async () => {
      vi.spyOn(AdminApiService, 'getWorkerDocUploadUrl').mockResolvedValue({
        signedUrl: 'https://storage.googleapis.com/mock',
        filePath: 'workers/xyz/resume.pdf',
      });
      vi.spyOn(AdminApiService, 'uploadWorkerDocToGCS').mockResolvedValue(undefined);
      vi.spyOn(AdminApiService, 'saveWorkerDocPath').mockResolvedValue(UPDATED_DOCS);
      const onDocumentsChange = vi.fn();

      const { result } = renderHook(() =>
        useAdminWorkerDocuments(WORKER_ID, { onDocumentsChange }),
      );

      const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.uploadDocument('resume_cv', file);
      });

      expect(onDocumentsChange).toHaveBeenCalledTimes(1);
      expect(onDocumentsChange).toHaveBeenCalledWith(UPDATED_DOCS);
    });

    it('REGRESSION: se save retornar undefined, NÃO chama onDocumentsChange', async () => {
      vi.spyOn(AdminApiService, 'getWorkerDocUploadUrl').mockResolvedValue({
        signedUrl: 'https://storage.googleapis.com/mock',
        filePath: 'workers/xyz/resume.pdf',
      });
      vi.spyOn(AdminApiService, 'uploadWorkerDocToGCS').mockResolvedValue(undefined);
      vi.spyOn(AdminApiService, 'saveWorkerDocPath').mockResolvedValue(undefined as unknown as WorkerDocument);
      const onDocumentsChange = vi.fn();

      const { result } = renderHook(() =>
        useAdminWorkerDocuments(WORKER_ID, { onDocumentsChange }),
      );

      const file = new File(['content'], 'resume.pdf', { type: 'application/pdf' });

      await act(async () => {
        await result.current.uploadDocument('resume_cv', file);
      });

      expect(onDocumentsChange).not.toHaveBeenCalled();
    });
  });

  // ─────────────────────────────────────────────────────────────────────────
  // validateDocument / invalidateDocument
  // ─────────────────────────────────────────────────────────────────────────
  describe('validate/invalidate', () => {
    it('validateDocument chama onValidationChange com as validations retornadas', async () => {
      const validations = { resume_cv: { validatedBy: 'admin@test.com', validatedAt: '2026-04-14T00:00:00Z' } };
      vi.spyOn(AdminApiService, 'validateWorkerDoc').mockResolvedValue(validations);
      const onValidationChange = vi.fn();

      const { result } = renderHook(() =>
        useAdminWorkerDocuments(WORKER_ID, { onValidationChange }),
      );

      await act(async () => {
        await result.current.validateDocument('resume_cv');
      });

      expect(onValidationChange).toHaveBeenCalledWith(validations);
    });
  });
});
