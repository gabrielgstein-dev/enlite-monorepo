import { JobPostingARRepository } from '../infrastructure/JobPostingARRepository';
import { mapPublicJobRow } from '../infrastructure/PublicJobMapper';
import type { PublicJobDto } from '../domain/PublicJobDto';

export class ListActivePublicJobsUseCase {
  constructor(private readonly repo: JobPostingARRepository) {}

  async execute(): Promise<PublicJobDto[]> {
    const rows = await this.repo.findActivePublic();
    return rows.map(mapPublicJobRow);
  }
}
