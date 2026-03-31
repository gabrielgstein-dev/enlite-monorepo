import { Request, Response, NextFunction } from 'express';
import { OAuth2Client } from 'google-auth-library';

const oauth2Client = new OAuth2Client();

/**
 * Middleware for internal endpoints (Pub/Sub push, Cloud Tasks, Cloud Scheduler).
 *
 * Auth strategies (checked in order):
 * 1. X-Internal-Secret header — used by Cloud Tasks and Cloud Scheduler
 * 2. Bearer OIDC token — used by Pub/Sub push subscriptions
 *
 * In dev/test: X-Internal-Secret alone is sufficient.
 */
export async function internalAuthMiddleware(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<void> {
  // 1. Cloud Tasks / Cloud Scheduler: shared secret header
  const secret = req.headers['x-internal-secret'] as string | undefined;
  const expectedSecret = process.env.INTERNAL_SECRET;

  if (secret && expectedSecret && secret === expectedSecret) {
    return next();
  }

  // 2. Pub/Sub push: Bearer OIDC token
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    try {
      await oauth2Client.verifyIdToken({
        idToken: token,
        audience: process.env.CLOUD_RUN_SERVICE_URL,
      });
      return next();
    } catch (err) {
      console.warn('[InternalAuth] OIDC token verification failed:', (err as Error).message);
    }
  }

  res.status(403).json({ error: 'Forbidden' });
}
