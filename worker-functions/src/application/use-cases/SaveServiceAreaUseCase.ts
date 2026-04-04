import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { IServiceAreaRepository } from '../../domain/repositories/IServiceAreaRepository';
import { SaveServiceAreaDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
export class SaveServiceAreaUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private serviceAreaRepository: IServiceAreaRepository,
  ) {}

  async execute(data: SaveServiceAreaDTO): Promise<Result<Worker>> {
    const workerResult = await this.workerRepository.findById(data.workerId);
    
    if (workerResult.isFailure) {
      return Result.fail<Worker>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    if (!worker) {
      return Result.fail<Worker>('Worker not found');
    }

    await this.serviceAreaRepository.deleteByWorkerId(data.workerId);

    const createResult = await this.serviceAreaRepository.create({
      workerId: data.workerId,
      address: data.address,
      addressComplement: data.addressComplement,
      serviceRadiusKm: data.serviceRadiusKm,
      lat: data.lat,
      lng: data.lng,
    });

    if (createResult.isFailure) {
      return Result.fail<Worker>(createResult.error!);
    }

    await this.workerRepository.recalculateStatus(data.workerId);

    return Result.ok<Worker>(worker);
  }
}
