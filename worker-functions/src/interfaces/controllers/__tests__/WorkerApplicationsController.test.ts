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
 * 5. Happy path: upserts WJA with channel
 * 6. Happy path: creates encuadre with channel as origen
 * 7. Encuadre dedup_hash is deterministic md5
 * 8. Accepts all valid channels (WJA + encuadre per channel)
 * 9. DB error → 500
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

import crypto from 'crypto';
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

/** Mock both DB calls after worker lookup: WJA upsert + encuadre insert */
function mockDbSuccess() {
  mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // WJA upsert
  mockQuery.mockResolvedValueOnce({ rowCount: 1, rows: [] }); // encuadre insert
}

describe('WorkerApplicationsController — trackChannel', () => {
  let controller: WorkerApplicationsController;

  beforeEach(() => {
    jest.clearAllMocks();
    controller = new WorkerApplicationsController();
  });

  // ── Validation & Auth ──────────────────────────────────────────────────

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
    mockQuery.mockResolvedValueOnce({ rows: [] });

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'linkedin' }, 'uid-1');
    await controller.trackChannel(req, res);
    expect(res.status).toHaveBeenCalledWith(404);
  });

  // ── WJA upsert ─────────────────────────────────────────────────────────

  it('upserts WJA with channel and first-touch semantics', async () => {
    mockWorkerFound('w-1');
    mockDbSuccess();

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'facebook' }, 'uid-1');
    await controller.trackChannel(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true });

    // Call 0 = worker lookup, call 1 = WJA upsert
    const upsertCall = mockQuery.mock.calls[1];
    expect(upsertCall[0]).toContain('worker_job_applications');
    expect(upsertCall[0]).toContain('acquisition_channel');
    expect(upsertCall[0]).toContain('acquisition_channel IS NULL');
    expect(upsertCall[1]).toEqual(['w-1', 'jp-1', 'facebook']);
  });

  // ── Encuadre creation ──────────────────────────────────────────────────

  it('creates encuadre with channel as origen after WJA upsert', async () => {
    mockWorkerFound('w-1');
    mockDbSuccess();

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'instagram' }, 'uid-1');
    await controller.trackChannel(req, res);

    expect(res.json).toHaveBeenCalledWith({ success: true });

    // Call 2 = encuadre insert
    const encuadreCall = mockQuery.mock.calls[2];
    expect(encuadreCall[0]).toContain('INSERT INTO encuadres');
    expect(encuadreCall[0]).toContain('NOT EXISTS');
    expect(encuadreCall[0]).toContain('ON CONFLICT (dedup_hash) DO NOTHING');

    // $1=workerId, $2=jobPostingId, $3=dedupHash, $4=channel (origen)
    expect(encuadreCall[1][0]).toBe('w-1');
    expect(encuadreCall[1][1]).toBe('jp-1');
    expect(encuadreCall[1][3]).toBe('instagram'); // origen = channel
  });

  it('generates deterministic md5 dedup_hash from worker+job', async () => {
    mockWorkerFound('w-1');
    mockDbSuccess();

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'whatsapp' }, 'uid-1');
    await controller.trackChannel(req, res);

    const expectedHash = crypto.createHash('md5')
      .update('social-link|w-1|jp-1')
      .digest('hex');

    const encuadreCall = mockQuery.mock.calls[2];
    expect(encuadreCall[1][2]).toBe(expectedHash);
  });

  it('encuadre query reads email and phone from workers table', async () => {
    mockWorkerFound('w-1');
    mockDbSuccess();

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'site' }, 'uid-1');
    await controller.trackChannel(req, res);

    const encuadreQuery = mockQuery.mock.calls[2][0] as string;
    expect(encuadreQuery).toContain('w.email');
    expect(encuadreQuery).toContain('w.phone');
    // Must NOT reference full_name (dropped in PII encryption migration)
    expect(encuadreQuery).not.toContain('full_name');
  });

  // ── All channels ───────────────────────────────────────────────────────

  it('accepts all valid channels and passes each as origen', async () => {
    const channels = ['facebook', 'instagram', 'whatsapp', 'linkedin', 'site'] as const;
    for (const channel of channels) {
      jest.clearAllMocks();
      mockWorkerFound('w-1');
      mockDbSuccess();

      const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel }, 'uid-1');
      await controller.trackChannel(req, res);

      expect(res.json).toHaveBeenCalledWith({ success: true });

      // Verify encuadre origen matches channel
      const encuadreCall = mockQuery.mock.calls[2];
      expect(encuadreCall[1][3]).toBe(channel);
    }
  });

  // ── Error handling ─────────────────────────────────────────────────────

  it('returns 500 on DB error', async () => {
    mockWorkerFound('w-1');
    mockQuery.mockRejectedValueOnce(new Error('DB down'));

    const [req, res] = mockReqRes({ jobPostingId: 'jp-1', channel: 'whatsapp' }, 'uid-1');
    await controller.trackChannel(req, res);

    expect(res.status).toHaveBeenCalledWith(500);
  });
});
