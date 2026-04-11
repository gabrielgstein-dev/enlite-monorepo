/**
 * WorkerApplicationsController.test.ts
 *
 * Tests for POST /api/worker-applications/track-channel
 *
 * Scenarios:
 * 1. Missing auth → 401
 * 2. Invalid channel → 400 with whitelist error
 * 3. Missing jobPostingId → 400
 * 4. Worker not found (getProgress fails) → 404
 * 5. Happy path: new WJA — inserts with channel
 * 6. Happy path: existing WJA with channel — first-touch wins (no overwrite)
 * 7. DB error → 500
 */

const mockQuery = jest.fn();

jest.mock('../../../infrastructure/database/DatabaseConnection', () => ({
  DatabaseConnection: {
    getInstance: jest.fn().mockReturnValue({
      getPool: jest.fn().mockReturnValue({ query: mockQuery }),
    }),
  },
}));

// KMSEncryptionService requires GCP credentials — mock it
jest.mock('../../../infrastructure/security/KMSEncryptionService', () => ({
  KMSEncryptionService: jest.fn().mockImplementation(() => ({
    encrypt: jest.fn().mockResolvedValue('encrypted'),
    decrypt: jest.fn().mockResolvedValue(''),
    encryptBatch: jest.fn().mockResolvedValue({}),
  })),
}));

import { WorkerApplicationsController } from '../WorkerApplicationsController';
import { Request, Response } from 'express';

function mockReqRes(
  body: Record<string, unknown> = {},
  authUid?: string,
): [Request, Response] {
  const req = {
    body,
    params: {},
    query: {},
    user: authUid ? { uid: authUid } : undefined,
    headers: {},
  } as unknown as Request;
  const res = {
    json: jest.fn().mockReturnThis(),
    status: jest.fn().mockReturnThis(),
  } as unknown as Response;
  return [req, res];
}

// Worker row returned by WorkerRepository (via GetWorkerProgressUseCase)
function mockWorkerFound(workerId = 'worker-uuid-1') {
  mockQuery.mockResolvedValueOnce({
    rows: [{
      id: workerId,
      auth_uid: 'uid-1',
      email: 'w@test.com',
      registration_step: 5,
      phone: null,
      whatsapp_phone: null,
      full_name: null,
      country: 'AR',
      created_at: new Date(),
      updated_at: new Date(),
    }],
  });
}

describe('WorkerApplicationsController — trackChannel', () => {
  let controller: WorkerApplicationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WorkerApplicationsController();
  });

  it('returns 401 when no auth uid', async () => {
    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'facebook' });
    await controller.trackChannel(req, res);
    expect(res.status).toHaveBeenCalledWith(401);
  });

  it('returns 400 when channel is invalid', async () => {
    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'tiktok' }, 'uid-1');
    await controller.trackChannel(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
    const body = (res.json as jest.Mock).mock.calls[0][0];
    expect(body.error).toMatch(/facebook|instagram|whatsapp|linkedin|site/);
  });

  it('returns 400 when jobPostingId is missing', async () => {
    const [req, res] = mockReqRes({ channel: 'instagram' }, 'uid-1');
    await controller.trackChannel(req, res);
    expect(res.status).toHaveBeenCalledWith(400);
  });

  it('returns 404 when worker is not found', async () => {
    // getProgress returns failure (no rows)
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'linkedin' }, 'uid-1');
    await controller.trackChannel(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  it('upserts WJA with channel and returns 200', async () => {
    mockWorkerFound('w-1');
    mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // upsert

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'facebook' }, 'uid-1');
    await controller.trackChannel(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true });

    const upsertCall = mockQuery.mock.calls[1];
    expect(upsertCall[0]).toContain('worker_job_applications');
    expect(upsertCall[0]).toContain('acquisition_channel');
    // First-touch: only sets when NULL
    expect(upsertCall[0]).toContain('acquisition_channel IS NULL');
    expect(upsertCall[1]).toEqual(['w-1', 'jp-1', 'facebook']);
  });

  it('accepts all valid channels', async () => {
    const channels = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'site'] as const;
    for (const channel of channels) {
      jest.clearAllMocks();
      mockWorkerFound('w-1');
      mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] });

      const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel }, 'uid-1');
      await controller.trackChannel(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });
    }
  });

  it('returns 500 on DB error', async () => {
    mockWorkerFound('w-1');
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'whatsapp' }, 'uid-1');
    await controller.trackChannel(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
