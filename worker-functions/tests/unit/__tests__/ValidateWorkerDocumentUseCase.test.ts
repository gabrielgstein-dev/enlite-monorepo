/**
 * Testes unitários para ValidateWorkerDocumentUseCase.
 *
 * Cobre:
 * - Rejeita docType inválido
 * - Rejeita workerId sem registro de documentos
 * - Rejeita docType não enviado (URL null)
 * - Delega para repositório no happy path
 */

import { ValidateWorkerDocumentUseCase, IWorkerDocumentsRepository, WorkerDocuments } from '../../../src/modules/worker';

const makeRepo = (
  overrides: Partial<IWorkerDocumentsRepository> = {},
): jest.Mocked<IWorkerDocumentsRepository> =>
  ({
    create: jest.fn(),
    findByWorkerId: jest.fn(),
    update: jest.fn(),
    review: jest.fn(),
    delete: jest.fn(),
    clearDocumentField: jest.fn(),
    validateDocument: jest.fn(),
    clearDocumentValidation: jest.fn(),
    ...overrides,
  } as jest.Mocked<IWorkerDocumentsRepository>);

const baseDocuments: WorkerDocuments = {
  id: 'doc-1',
  workerId: 'worker-1',
  resumeCvUrl: 'workers/worker-1/resume_cv/file.pdf',
  identityDocumentUrl: undefined,
  identityDocumentBackUrl: undefined,
  criminalRecordUrl: undefined,
  professionalRegistrationUrl: undefined,
  liabilityInsuranceUrl: undefined,
  monotributoCertificateUrl: undefined,
  atCertificateUrl: undefined,
  additionalCertificatesUrls: [],
  documentsStatus: 'incomplete',
  documentValidations: {},
  createdAt: new Date('2026-01-01'),
  updatedAt: new Date('2026-01-01'),
};

describe('ValidateWorkerDocumentUseCase', () => {
  // ── Validação de docType ───────────────────────────────────────────────────

  it('lança erro para docType inválido', async () => {
    const repo = makeRepo({ findByWorkerId: jest.fn().mockResolvedValue(baseDocuments) });
    const useCase = new ValidateWorkerDocumentUseCase(repo);

    await expect(
      useCase.execute({ workerId: 'worker-1', docType: 'fake_doc', adminEmail: 'admin@test.com' }),
    ).rejects.toThrow(/invalid document type/i);

    expect(repo.validateDocument).not.toHaveBeenCalled();
  });

  it('lança erro para docType em branco', async () => {
    const repo = makeRepo({ findByWorkerId: jest.fn().mockResolvedValue(baseDocuments) });
    const useCase = new ValidateWorkerDocumentUseCase(repo);

    await expect(
      useCase.execute({ workerId: 'worker-1', docType: '', adminEmail: 'admin@test.com' }),
    ).rejects.toThrow(/invalid document type/i);
  });

  // ── Worker sem registro ────────────────────────────────────────────────────

  it('lança erro quando worker não tem registro de documentos', async () => {
    const repo = makeRepo({ findByWorkerId: jest.fn().mockResolvedValue(null) });
    const useCase = new ValidateWorkerDocumentUseCase(repo);

    await expect(
      useCase.execute({ workerId: 'worker-1', docType: 'resume_cv', adminEmail: 'admin@test.com' }),
    ).rejects.toThrow(/worker documents not found/i);

    expect(repo.validateDocument).not.toHaveBeenCalled();
  });

  // ── Documento não enviado ──────────────────────────────────────────────────

  it('lança erro quando o documento ainda não foi enviado (URL null)', async () => {
    const docsWithoutCriminal: WorkerDocuments = { ...baseDocuments, criminalRecordUrl: undefined };
    const repo = makeRepo({ findByWorkerId: jest.fn().mockResolvedValue(docsWithoutCriminal) });
    const useCase = new ValidateWorkerDocumentUseCase(repo);

    await expect(
      useCase.execute({ workerId: 'worker-1', docType: 'criminal_record', adminEmail: 'admin@test.com' }),
    ).rejects.toThrow(/not been uploaded/i);

    expect(repo.validateDocument).not.toHaveBeenCalled();
  });

  // ── Happy path ─────────────────────────────────────────────────────────────

  it('chama validateDocument com os parâmetros corretos no happy path', async () => {
    const updatedDocs: WorkerDocuments = {
      ...baseDocuments,
      documentValidations: {
        resume_cv: { validatedBy: 'admin@enlite.com', validatedAt: '2026-04-14T10:00:00Z' },
      },
    };
    const repo = makeRepo({
      findByWorkerId: jest.fn().mockResolvedValue(baseDocuments),
      validateDocument: jest.fn().mockResolvedValue(updatedDocs),
    });
    const useCase = new ValidateWorkerDocumentUseCase(repo);

    const result = await useCase.execute({
      workerId: 'worker-1',
      docType: 'resume_cv',
      adminEmail: 'admin@enlite.com',
    });

    expect(repo.validateDocument).toHaveBeenCalledWith('worker-1', 'resume_cv', 'admin@enlite.com');
    expect(result.documentValidations).toHaveProperty('resume_cv');
    expect(result.documentValidations!.resume_cv!.validatedBy).toBe('admin@enlite.com');
  });

  it('aceita todos os docTypes válidos sem lançar erro de validação', async () => {
    const validDocTypes = [
      'resume_cv', 'identity_document', 'identity_document_back', 'criminal_record',
      'professional_registration', 'liability_insurance', 'monotributo_certificate', 'at_certificate',
    ] as const;

    for (const docType of validDocTypes) {
      const docsWithUrl: WorkerDocuments = {
        ...baseDocuments,
        [`${docType === 'resume_cv' ? 'resumeCv' :
          docType === 'identity_document' ? 'identityDocument' :
          docType === 'identity_document_back' ? 'identityDocumentBack' :
          docType === 'criminal_record' ? 'criminalRecord' :
          docType === 'professional_registration' ? 'professionalRegistration' :
          docType === 'liability_insurance' ? 'liabilityInsurance' :
          docType === 'monotributo_certificate' ? 'monotributoCertificate' :
          'atCertificate'}Url`]: `workers/test/${docType}/file.pdf`,
      };

      const updatedDocs: WorkerDocuments = {
        ...docsWithUrl,
        documentValidations: {
          [docType]: { validatedBy: 'admin@enlite.com', validatedAt: '2026-04-14T10:00:00Z' },
        },
      };

      const repo = makeRepo({
        findByWorkerId: jest.fn().mockResolvedValue(docsWithUrl),
        validateDocument: jest.fn().mockResolvedValue(updatedDocs),
      });

      const useCase = new ValidateWorkerDocumentUseCase(repo);
      await expect(
        useCase.execute({ workerId: 'worker-1', docType, adminEmail: 'admin@enlite.com' }),
      ).resolves.toBeDefined();
    }
  });
});
