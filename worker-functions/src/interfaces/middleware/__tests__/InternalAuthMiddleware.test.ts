import { Request, Response, NextFunction } from 'express';

const mockVerifyIdToken = jest.fn().mockResolvedValue({ getPayload: () => ({}) });

jest.mock('google-auth-library', () => ({
  OAuth2Client: jest.fn().mockImplementation(() => ({
    verifyIdToken: mockVerifyIdToken,
  })),
}));

import { internalAuthMiddleware } from '../InternalAuthMiddleware';

function mockReqResNext(headers: Record<string, string> = {}) {
  const req = { headers } as unknown as Request;
  const res = {
    status: jest.fn().mockReturnThis(),
    json: jest.fn().mockReturnThis(),
  } as unknown as Response;
  const next = jest.fn() as NextFunction;
  return { req, res, next };
}

describe('InternalAuthMiddleware', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, INTERNAL_TOKEN_SECRET: 'test-secret-123' };
    mockVerifyIdToken.mockReset();
    mockVerifyIdToken.mockResolvedValue({ getPayload: () => ({}) });
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  it('allows request with valid X-Internal-Secret header', async () => {
    const { req, res, next } = mockReqResNext({
      'x-internal-secret': 'test-secret-123',
    });

    await internalAuthMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
  });

  it('allows request with valid OIDC Bearer token', async () => {
    const { req, res, next } = mockReqResNext({
      authorization: 'Bearer valid-oidc-token',
    });

    await internalAuthMiddleware(req, res, next);
    expect(next).toHaveBeenCalled();
    expect(mockVerifyIdToken).toHaveBeenCalledWith(
      expect.objectContaining({ idToken: 'valid-oidc-token' }),
    );
  });

  it('returns 403 when no valid auth is provided', async () => {
    const { req, res, next } = mockReqResNext({});

    await internalAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
    expect(res.json).toHaveBeenCalledWith({ error: 'Forbidden' });
  });

  it('returns 403 when secret is wrong', async () => {
    const { req, res, next } = mockReqResNext({
      'x-internal-secret': 'wrong-secret',
    });

    await internalAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });

  it('returns 403 when OIDC token verification fails', async () => {
    mockVerifyIdToken.mockRejectedValue(new Error('Invalid token'));

    const { req, res, next } = mockReqResNext({
      authorization: 'Bearer invalid-oidc-token',
    });

    await internalAuthMiddleware(req, res, next);

    expect(next).not.toHaveBeenCalled();
    expect(res.status).toHaveBeenCalledWith(403);
  });
});
