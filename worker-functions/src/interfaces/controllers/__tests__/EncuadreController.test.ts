/**
 * EncuadreController.test.ts
 *
 * Testa o método updateWorkerStatus após a correção do bypass:
 * - status = 'REGISTERED' → chama recalculateStatus (nunca SET direto)
 * - status = 'DISABLED' / 'INCOMPLETE_REGISTER' → SET direto legítimo
 * - status inválido → 400
 */

const mockQuery = jest.fn();
const mockConnect = jest.fn();
const mockRecalculateStatus = jest.fn();

jest.mock('@shared/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({
        query: mockQuery,
        connect: mockConnect,
      }),
    }),
  },
}));

jest.mock('@modules/worker', () => ({
  ...jest.requireActual('@modules/worker'),
  WorkerRepository: jest.fn().mockImplementation(() => ({
    recalculateStatus: mockRecalculateStatus,
  })),
}));

jest.mock('../../../infrastructure/repositories/EncuadreRepository', () => ({
  EncuadreRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('../../../infrastructure/repositories/OperationalRepositories', () => ({
  JobPostingARRepository: jest.fn().mockImplementation(() => ({})),
}));

jest.mock('@modules/audit', () => ({
  DocExpiryRepository: jest.fn().mockImplementation(() => ({})),
}));

import { EncuadreController } from '../EncuadreController';
import { Request, Response } from 'express';

function mockReqRes(params = {}, body = {}, user?: { uid: string }): [Request, Response] {
  const req = { params, body, query: {}, user } as unknown as Request;
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return [req, res];
}

// Mock para runWorkerUpdate (usa pool.connect → client.query)
function setupMockClient() {
  const mockClient = {
    query: jest.fn().mockResolvedValue({ rows: [] }),
    release: jest.fn(),
  };
  mockConnect.mockResolvedValue(mockClient);
  return mockClient;
}

describe('EncuadreController — updateWorkerStatus', () => {
  let controller: EncuadreController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new EncuadreController();
    setupMockClient();
  });

  // ── status inválido → 400 ──────────────────────────────────────────────

  it('retorna 400 para status inválido', async () => {
    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'approved' });

    await controller.updateWorkerStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(400);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
    expect(mockRecalculateStatus).not.toHaveBeenCalled();
  });

  // ── REGISTERED → chama recalculateStatus, nunca SET direto ─────────────

  it('chama recalculateStatus quando status = REGISTERED (worker incompleto)', async () => {
    mockRecalculateStatus.mockResolvedValue(null); // sem mudança — worker continua INCOMPLETE
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'INCOMPLETE_REGISTER' }] });

    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'REGISTERED' }, { uid: 'admin-1' });

    await controller.updateWorkerStatus(req, res);

    expect(mockRecalculateStatus).toHaveBeenCalledWith('w1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { workerId: 'w1', status: 'INCOMPLETE_REGISTER' },
    });
  });

  it('chama recalculateStatus quando status = REGISTERED (worker completo)', async () => {
    mockRecalculateStatus.mockResolvedValue('REGISTERED');
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'REGISTERED' }] });

    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'REGISTERED' }, { uid: 'admin-1' });

    await controller.updateWorkerStatus(req, res);

    expect(mockRecalculateStatus).toHaveBeenCalledWith('w1');
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { workerId: 'w1', status: 'REGISTERED' },
    });
  });

  it('REGISTERED nunca chama runWorkerUpdate (connect/BEGIN/COMMIT)', async () => {
    mockRecalculateStatus.mockResolvedValue(null);
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'INCOMPLETE_REGISTER' }] });

    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'REGISTERED' });

    await controller.updateWorkerStatus(req, res);

    // connect é usado por runWorkerUpdate — não deve ter sido chamado
    expect(mockConnect).not.toHaveBeenCalled();
  });

  // ── DISABLED → SET direto via runWorkerUpdate ──────────────────────────

  it('usa SET direto para status = DISABLED', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'DISABLED' }] });

    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'DISABLED' }, { uid: 'admin-1' });

    await controller.updateWorkerStatus(req, res);

    // recalculateStatus NÃO deve ser chamado
    expect(mockRecalculateStatus).not.toHaveBeenCalled();
    // connect é chamado (runWorkerUpdate usa transação)
    expect(mockConnect).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { workerId: 'w1', status: 'DISABLED' },
    });
  });

  // ── INCOMPLETE_REGISTER → SET direto via runWorkerUpdate ──────────────

  it('usa SET direto para status = INCOMPLETE_REGISTER', async () => {
    mockQuery.mockResolvedValueOnce({ rows: [{ status: 'INCOMPLETE_REGISTER' }] });

    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'INCOMPLETE_REGISTER' }, { uid: 'admin-1' });

    await controller.updateWorkerStatus(req, res);

    expect(mockRecalculateStatus).not.toHaveBeenCalled();
    expect(mockConnect).toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(200);
    expect(res.json).toHaveBeenCalledWith({
      success: true,
      data: { workerId: 'w1', status: 'INCOMPLETE_REGISTER' },
    });
  });

  // ── Erro interno → 500 ────────────────────────────────────────────────

  it('retorna 500 quando recalculateStatus lança exceção', async () => {
    mockRecalculateStatus.mockRejectedValue(new Error('DB down'));

    const [req, res] = mockReqRes({ id: 'w1' }, { status: 'REGISTERED' });

    await controller.updateWorkerStatus(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
    expect(res.json).toHaveBeenCalledWith(
      expect.objectContaining({ success: false }),
    );
  });
});
