jest.mock('@google-cloud/pubsub', () => {
  const publishMessage = jest.fn().mockResolvedValue('msg-123');
  const topic = jest.fn().mockReturnValue({ publishMessage });
  return { PubSub: jest.fn().mockImplementation(() => ({ topic })) };
});

import { PubSubClient } from '../PubSubClient';

describe('PubSubClient', () => {
  const originalEnv = process.env;

  beforeEach(() => {
    process.env = { ...originalEnv, NODE_ENV: 'test' };
  });

  afterEach(() => {
    process.env = originalEnv;
  });

  describe('publish', () => {
    it('returns null in test/mock mode (no GCP_PROJECT_ID)', async () => {
      const client = new PubSubClient();
      const result = await client.publish('domain-events', { eventId: 'abc' });
      expect(result).toBeNull();
    });

    it('publishes to real topic when enabled', async () => {
      process.env = { ...originalEnv, GCP_PROJECT_ID: 'test-proj', NODE_ENV: 'production' };
      const client = new PubSubClient();

      const result = await client.publish('domain-events', { eventId: 'evt-1' });
      expect(result).toBe('msg-123');
    });
  });

  describe('decodePushMessage', () => {
    it('decodes a valid Pub/Sub push body', () => {
      const payload = { eventId: 'evt-123' };
      const encoded = Buffer.from(JSON.stringify(payload)).toString('base64');
      const body = { message: { data: encoded, messageId: 'msg-1' }, subscription: 'sub-1' };

      const result = PubSubClient.decodePushMessage<{ eventId: string }>(body);
      expect(result).toEqual({ eventId: 'evt-123' });
    });

    it('returns null for missing message data', () => {
      const result = PubSubClient.decodePushMessage({});
      expect(result).toBeNull();
    });

    it('returns null for invalid base64/JSON', () => {
      const body = { message: { data: '!!!not-base64!!!' } };
      const result = PubSubClient.decodePushMessage(body);
      expect(result).toBeNull();
    });
  });
});
