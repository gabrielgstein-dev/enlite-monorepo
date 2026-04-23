import axios from 'axios';
import { Result } from '../utils/Result';

export interface WorkerEvent {
  event: string;
  payload: {
    workerId: string;
    step?: number;
    status?: string;
    data?: any;
  };
}

export class EventDispatcher {
  private webhookUrl: string;

  constructor() {
    this.webhookUrl = process.env.N8N_WEBHOOK_URL || 'http://localhost:5678/webhook/worker-events';
  }

  async notifyStepCompleted(workerId: string, step: number, data?: any): Promise<Result<void>> {
    try {
      const event: WorkerEvent = {
        event: 'worker.step.completed',
        payload: {
          workerId,
          step,
          data,
        },
      };

      await axios.post(this.webhookUrl, event, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to notify n8n: ${error.message}`);
    }
  }

  async notifyStatusChanged(workerId: string, status: string): Promise<Result<void>> {
    try {
      const event: WorkerEvent = {
        event: 'worker.status.changed',
        payload: {
          workerId,
          status,
        },
      };

      await axios.post(this.webhookUrl, event, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to notify n8n: ${error.message}`);
    }
  }

  async notifyWorkerCreated(workerId: string, data: any): Promise<Result<void>> {
    try {
      const event: WorkerEvent = {
        event: 'worker.created',
        payload: {
          workerId,
          data,
        },
      };

      await axios.post(this.webhookUrl, event, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to notify n8n: ${error.message}`);
    }
  }

  async notifyWorkerUpdated(workerId: string, changes: any, data?: any): Promise<Result<void>> {
    try {
      const event: WorkerEvent = {
        event: 'worker.updated',
        payload: {
          workerId,
          data: {
            changes,
            ...data,
          },
        },
      };

      await axios.post(this.webhookUrl, event, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to notify n8n: ${error.message}`);
    }
  }

  async notifyWorkerDeleted(workerId: string, data?: any): Promise<Result<void>> {
    try {
      const event: WorkerEvent = {
        event: 'worker.deleted',
        payload: {
          workerId,
          data,
        },
      };

      await axios.post(this.webhookUrl, event, {
        timeout: 5000,
        headers: {
          'Content-Type': 'application/json',
        },
      });

      return Result.ok<void>();
    } catch (error: any) {
      return Result.fail<void>(`Failed to notify n8n: ${error.message}`);
    }
  }
}
