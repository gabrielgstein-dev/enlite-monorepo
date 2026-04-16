import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';

export interface LookupWorkerResult {
  found: false;
}

export interface LookupWorkerFoundResult {
  found: true;
  phoneMasked?: string;
}

export type LookupResult = LookupWorkerResult | LookupWorkerFoundResult;

export function maskPhone(phone: string): string {
  if (phone.length <= 3) {
    return phone;
  }
  const visible = phone.slice(-3);
  const masked = 'x'.repeat(phone.length - 3);
  return masked + visible;
}

export class LookupWorkerByEmailUseCase {
  constructor(private workerRepository: IWorkerRepository) {}

  async execute(email: string): Promise<LookupResult> {
    const result = await this.workerRepository.findByEmail(email);

    if (result.isFailure) {
      return { found: false };
    }

    const worker = result.getValue();

    if (!worker) {
      return { found: false };
    }

    if (!worker.phone) {
      return { found: true };
    }

    return { found: true, phoneMasked: maskPhone(worker.phone) };
  }
}
