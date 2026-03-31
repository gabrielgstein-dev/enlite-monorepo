import { CloudTasksClient as GCPCloudTasksClient } from '@google-cloud/tasks';

export interface ScheduleTaskOptions {
  queue: string;
  url: string;
  body: Record<string, unknown>;
  /** ISO 8601 timestamp for when the task should execute */
  scheduleTime?: string;
}

export class CloudTasksClient {
  private client: GCPCloudTasksClient;
  private readonly projectId: string;
  private readonly location: string;
  private readonly serviceUrl: string;
  private readonly internalSecret: string;
  private readonly enabled: boolean;

  constructor() {
    this.projectId = process.env.GCP_PROJECT_ID || '';
    this.location = process.env.CLOUD_TASKS_QUEUE_LOCATION || 'southamerica-east1';
    this.serviceUrl = process.env.CLOUD_RUN_SERVICE_URL || `http://localhost:${process.env.PORT || 8080}`;
    this.internalSecret = process.env.INTERNAL_SECRET || '';
    this.enabled = !!this.projectId && process.env.NODE_ENV !== 'test';
    this.client = new GCPCloudTasksClient();
  }

  async schedule(options: ScheduleTaskOptions): Promise<string | null> {
    const { queue, url, body, scheduleTime } = options;

    if (!this.enabled) {
      console.log(`[CloudTasksClient] Mock schedule queue="${queue}" url="${url}" scheduleTime=${scheduleTime || 'now'}:`, JSON.stringify(body));
      return null;
    }

    const parent = this.client.queuePath(this.projectId, this.location, queue);
    const fullUrl = `${this.serviceUrl}${url}`;

    const task: Record<string, unknown> = {
      httpRequest: {
        httpMethod: 'POST' as const,
        url: fullUrl,
        headers: {
          'Content-Type': 'application/json',
          'X-Internal-Secret': this.internalSecret,
        },
        body: Buffer.from(JSON.stringify(body)).toString('base64'),
      },
    };

    if (scheduleTime) {
      const timestamp = new Date(scheduleTime);
      task.scheduleTime = {
        seconds: Math.floor(timestamp.getTime() / 1000),
      };
    }

    const [response] = await this.client.createTask({ parent, task });
    const taskName = response.name || '';

    console.log(`[CloudTasksClient] Scheduled task="${taskName}" queue="${queue}" url="${fullUrl}" at=${scheduleTime || 'now'}`);
    return taskName;
  }

  async deleteTask(taskName: string): Promise<void> {
    if (!this.enabled) {
      console.log(`[CloudTasksClient] Mock delete task="${taskName}"`);
      return;
    }

    await this.client.deleteTask({ name: taskName });
    console.log(`[CloudTasksClient] Deleted task="${taskName}"`);
  }
}
