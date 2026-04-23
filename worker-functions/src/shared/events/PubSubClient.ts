import { PubSub } from '@google-cloud/pubsub';

export interface PubSubMessage {
  topic: string;
  data: Record<string, unknown>;
}

export class PubSubClient {
  private client: PubSub;
  private readonly enabled: boolean;

  constructor() {
    const projectId = process.env.GCP_PROJECT_ID;
    this.enabled = !!projectId && process.env.NODE_ENV !== 'test';
    this.client = new PubSub({ projectId });
  }

  async publish(topic: string, data: Record<string, unknown>): Promise<string | null> {
    if (!this.enabled) {
      console.log(`[PubSubClient] Mock publish to "${topic}":`, JSON.stringify(data));
      return null;
    }

    const messageId = await this.client
      .topic(topic)
      .publishMessage({ json: data });

    console.log(`[PubSubClient] Published to "${topic}" messageId=${messageId}`);
    return messageId;
  }

  /**
   * Decode Pub/Sub push message body.
   * Pub/Sub push sends: { message: { data: base64, messageId, publishTime }, subscription }
   */
  static decodePushMessage<T = Record<string, unknown>>(body: Record<string, unknown>): T | null {
    try {
      const message = body.message as Record<string, unknown> | undefined;
      if (!message?.data) return null;

      const decoded = Buffer.from(message.data as string, 'base64').toString('utf-8');
      return JSON.parse(decoded) as T;
    } catch (err) {
      console.error('[PubSubClient] Failed to decode push message:', err);
      return null;
    }
  }
}
