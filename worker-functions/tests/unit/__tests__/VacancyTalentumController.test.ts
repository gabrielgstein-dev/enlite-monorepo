/**
 * VacancyTalentumController — Unit Tests
 *
 * Validates: prescreening config CRUD (validation, transaction,
 * response mapping), publish/unpublish delegation, and error handling.
 */

// ── Mocks ────────────────────────────────────────────────────────────

const mockQuery = jest.fn();
const mockClientQuery = jest.fn();
const mockConnect = jest.fn().mockResolvedValue({
  query: mockClientQuery,
  release: jest.fn(),
});
const mockPool = { query: mockQuery, connect: mockConnect };

jest.mock('@shared/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: () => ({ getPool: () => mockPool }),
  },
}));

const mockPublish = jest.fn();
const mockUnpublish = jest.fn();
jest.mock('../../../src/application/use-cases/PublishVacancyToTalentumUseCase', () => ({
  PublishVacancyToTalentumUseCase: jest.fn().mockImplementation(() => ({
    publish: mockPublish,
    unpublish: mockUnpublish,
  })),
  PublishError: class PublishError extends Error {
    constructor(public statusCode: number, message: string) {
      super(message);
      this.name = 'PublishError';
    }
  },
}));

const mockGenerateDescription = jest.fn();
jest.mock('../../../src/infrastructure/services/TalentumDescriptionService', () => ({
  TalentumDescriptionService: jest.fn().mockImplementation(() => ({
    generateDescription: mockGenerateDescription,
  })),
}));

import { VacancyTalentumController } from '../../../src/interfaces/controllers/VacancyTalentumController';

// ── Helpers ──────────────────────────────────────────────────────────

function mockReq(body: any = {}, params: any = {}): any {
  return { body, params };
}

function mockRes(): any {
  const res: any = {};
  res.status = jest.fn().mockReturnValue(res);
  res.json = jest.fn().mockReturnValue(res);
  return res;
}

// ── Tests ────────────────────────────────────────────────────────────

describe('VacancyTalentumController', () => {
  let controller: VacancyTalentumController;

  beforeEach(() => {
    mockQuery.mockReset();
    mockClientQuery.mockReset();
    mockPublish.mockReset();
    mockUnpublish.mockReset();
    mockGenerateDescription.mockReset();
    controller = new VacancyTalentumController();
  });

  // ── savePrescreeningConfig ───────────────────────────────────────

  describe('savePrescreeningConfig', () => {
    const validQuestions = [
      { question: 'Experiencia?', desiredResponse: 'Si, 2 anos', weight: 8 },
      { question: 'Disponibilidad?', desiredResponse: 'Lunes a viernes', weight: 6 },
    ];
    const validFaq = [
      { question: 'Que ofrece Enlite?', answer: 'Marco profesional' },
    ];

    it('validates question text is required', async () => {
      const req = mockReq(
        { questions: [{ question: '', desiredResponse: 'x', weight: 5 }] },
        { id: 'v-1' },
      );
      const res = mockRes();

      await controller.savePrescreeningConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('questions[0].question') }),
      );
    });

    it('validates desiredResponse is required', async () => {
      const req = mockReq(
        { questions: [{ question: 'Q', desiredResponse: '', weight: 5 }] },
        { id: 'v-1' },
      );
      const res = mockRes();

      await controller.savePrescreeningConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('desiredResponse') }),
      );
    });

    it('validates weight must be 1-10', async () => {
      const req = mockReq(
        { questions: [{ question: 'Q', desiredResponse: 'R', weight: 15 }] },
        { id: 'v-1' },
      );
      const res = mockRes();

      await controller.savePrescreeningConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(400);
      expect(res.json).toHaveBeenCalledWith(
        expect.objectContaining({ error: expect.stringContaining('weight') }),
      );
    });

    it('deletes old questions and FAQ in transaction before inserting new', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockQuery.mockResolvedValue({ rows: [] });

      const req = mockReq({ questions: validQuestions, faq: validFaq }, { id: 'v-1' });
      const res = mockRes();

      await controller.savePrescreeningConfig(req, res);

      // Transaction: BEGIN, DELETE questions, DELETE faq, INSERT questions, INSERT faq, COMMIT
      const calls = mockClientQuery.mock.calls.map((c: any) => c[0]);
      expect(calls[0]).toBe('BEGIN');
      expect(calls[1]).toContain('DELETE FROM job_posting_prescreening_questions');
      expect(calls[2]).toContain('DELETE FROM job_posting_prescreening_faq');
      // INSERTs for 2 questions + 1 FAQ = 3 more calls
      expect(calls[3]).toContain('INSERT INTO job_posting_prescreening_questions');
      expect(calls[4]).toContain('INSERT INTO job_posting_prescreening_questions');
      expect(calls[5]).toContain('INSERT INTO job_posting_prescreening_faq');
      expect(calls[6]).toBe('COMMIT');
    });

    it('sets correct defaults for optional question fields', async () => {
      mockClientQuery.mockResolvedValue({ rows: [] });
      mockQuery.mockResolvedValue({ rows: [] });

      const req = mockReq(
        { questions: [{ question: 'Q', desiredResponse: 'R', weight: 5 }], faq: [] },
        { id: 'v-1' },
      );
      const res = mockRes();

      await controller.savePrescreeningConfig(req, res);

      // Find the INSERT call for questions
      const insertCall = mockClientQuery.mock.calls.find(
        (c: any) => typeof c[0] === 'string' && c[0].includes('INSERT INTO job_posting_prescreening_questions'),
      );
      expect(insertCall).toBeTruthy();
      const params = insertCall![1];
      expect(params[3]).toEqual(['text', 'audio']); // responseType default
      expect(params[6]).toBe(false);                 // required default
      expect(params[7]).toBe(true);                  // analyzed default
      expect(params[8]).toBe(false);                 // earlyStoppage default
    });

    it('rolls back transaction on error', async () => {
      mockClientQuery
        .mockResolvedValueOnce({}) // BEGIN
        .mockResolvedValueOnce({}) // DELETE questions
        .mockRejectedValueOnce(new Error('relation does not exist'));

      const req = mockReq({ questions: validQuestions, faq: [] }, { id: 'v-1' });
      const res = mockRes();

      await controller.savePrescreeningConfig(req, res);

      const calls = mockClientQuery.mock.calls.map((c: any) => c[0]);
      expect(calls).toContain('ROLLBACK');
      expect(res.status).toHaveBeenCalledWith(500);
    });
  });

  // ── getPrescreeningConfig ────────────────────────────────────────

  describe('getPrescreeningConfig', () => {
    it('returns questions and faq with camelCase mapping', async () => {
      mockQuery
        .mockResolvedValueOnce({
          rows: [{
            id: 'q1', question: 'Q1', response_type: ['text'], desired_response: 'R1',
            weight: 8, required: false, analyzed: true, early_stoppage: false, question_order: 1,
          }],
        })
        .mockResolvedValueOnce({
          rows: [{ id: 'f1', question: 'FQ', answer: 'FA', faq_order: 1 }],
        });

      const req = mockReq({}, { id: 'v-1' });
      const res = mockRes();

      await controller.getPrescreeningConfig(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      const data = res.json.mock.calls[0][0].data;
      expect(data.questions[0]).toEqual(expect.objectContaining({
        desiredResponse: 'R1',
        responseType: ['text'],
        earlyStoppage: false,
        questionOrder: 1,
      }));
      expect(data.faq[0]).toEqual(expect.objectContaining({
        question: 'FQ',
        answer: 'FA',
        faqOrder: 1,
      }));
    });
  });

  // ── publishToTalentum ────────────────────────────────────────────

  describe('publishToTalentum', () => {
    it('delegates to use case and returns result', async () => {
      mockPublish.mockResolvedValueOnce({ projectId: 'p1', publicId: 'pub1', whatsappUrl: 'https://wa.me/...' });
      const req = mockReq({}, { id: 'v-1' });
      const res = mockRes();

      await controller.publishToTalentum(req, res);

      expect(mockPublish).toHaveBeenCalledWith({ jobPostingId: 'v-1' });
      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        success: true,
        data: expect.objectContaining({ whatsappUrl: 'https://wa.me/...' }),
      }));
    });
  });

  // ── generateTalentumDescription ──────────────────────────────────

  describe('generateTalentumDescription', () => {
    it('delegates to TalentumDescriptionService', async () => {
      mockGenerateDescription.mockResolvedValueOnce({ description: 'Generated text...' });
      const req = mockReq({}, { id: 'v-1' });
      const res = mockRes();

      await controller.generateTalentumDescription(req, res);

      expect(res.status).toHaveBeenCalledWith(200);
      expect(res.json).toHaveBeenCalledWith(expect.objectContaining({
        data: { description: 'Generated text...' },
      }));
    });
  });
});
