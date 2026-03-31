import axios, { AxiosError } from 'axios';
import { Pool } from 'pg';

const API_URL = process.env.API_URL || 'http://localhost:8080';
const DATABASE_URL = process.env.DATABASE_URL || 'postgresql://enlite_admin:enlite_password@localhost:5432/enlite_e2e';
const INTERNAL_SECRET = process.env.INTERNAL_SECRET || 'test-secret';

const internalApi = axios.create({
  baseURL: `${API_URL}/api/internal`,
  headers: { 'X-Internal-Secret': INTERNAL_SECRET },
});

describe('Internal Endpoints (Pub/Sub + Cloud Tasks)', () => {
  let pool: Pool;

  beforeAll(async () => {
    pool = new Pool({ connectionString: DATABASE_URL });
  });

  afterAll(async () => {
    await pool.end();
  });

  // ─── Auth ────────────────────────────────────────────────────────────

  it('returns 403 without auth', async () => {
    try {
      await axios.post(`${API_URL}/api/internal/events/process`, {});
      fail('Expected 403');
    } catch (err) {
      const e = err as AxiosError;
      expect(e.response?.status).toBe(403);
    }
  });

  it('allows request with valid X-Internal-Secret', async () => {
    // Sends empty Pub/Sub body — should return 400 (missing eventId), not 403
    const res = await internalApi.post('/events/process', {}).catch(e => e.response);
    expect(res.status).toBe(400);
    expect(res.data.error).toContain('Missing eventId');
  });

  // ─── Domain Events ──────────────────────────────────────────────────

  it('processes a domain event end-to-end', async () => {
    // Insert a test domain event
    const { rows } = await pool.query(
      `INSERT INTO domain_events (event, payload, status)
       VALUES ('test.event', $1, 'pending')
       RETURNING id`,
      [JSON.stringify({ testKey: 'testValue' })],
    );
    const eventId = rows[0].id;

    // Simulate Pub/Sub push message format
    const pubsubBody = {
      message: {
        data: Buffer.from(JSON.stringify({ eventId })).toString('base64'),
        messageId: 'test-msg-1',
      },
      subscription: 'projects/test/subscriptions/test',
    };

    const res = await internalApi.post('/events/process', pubsubBody);
    expect(res.status).toBe(200);
    // No handler registered for 'test.event' → status should be 'failed'
    expect(res.data.status).toBe('failed');

    // Verify the event was marked in DB
    const { rows: updated } = await pool.query(
      `SELECT status, error FROM domain_events WHERE id = $1`,
      [eventId],
    );
    expect(updated[0].status).toBe('failed');
    expect(updated[0].error).toContain('No handler');

    // Cleanup
    await pool.query('DELETE FROM domain_events WHERE id = $1', [eventId]);
  });

  // ─── Sweeps ─────────────────────────────────────────────────────────

  it('outbox sweep returns 200', async () => {
    const res = await internalApi.post('/outbox/sweep', {});
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
  });

  it('events sweep returns 200', async () => {
    const res = await internalApi.post('/events/sweep', {});
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
  });

  // ─── Reminders ──────────────────────────────────────────────────────

  it('qualified reminder returns 200 with valid body', async () => {
    const res = await internalApi.post('/reminders/qualified', {
      workerId: '00000000-0000-0000-0000-000000000001',
      jobPostingId: '00000000-0000-0000-0000-000000000002',
    });
    expect(res.status).toBe(200);
    expect(res.data.status).toBe('ok');
  });

  it('qualified reminder returns 400 without body', async () => {
    const res = await internalApi.post('/reminders/qualified', {}).catch(e => e.response);
    expect(res.status).toBe(400);
  });

  it('bulk-dispatch returns 200', async () => {
    const res = await internalApi.post('/bulk-dispatch/process', {});
    expect(res.status).toBe(200);
  });
});
