import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { SavePersonalInfoDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

export class SavePersonalInfoUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private eventDispatcher: EventDispatcher
  ) {}

  async execute(data: SavePersonalInfoDTO): Promise<Result<Worker>> {
    const workerResult = await this.workerRepository.findById(data.workerId);
    
    if (workerResult.isFailure) {
      return Result.fail<Worker>(workerResult.error!);
    }

    const worker = workerResult.getValue();
    if (!worker) {
      return Result.fail<Worker>('Worker not found');
    }

    const updateResult = await this.workerRepository.updatePersonalInfo({
      workerId: data.workerId,
      firstName: data.firstName,
      lastName: data.lastName,
      sex: data.sex,
      gender: data.gender,
      birthDate: data.birthDate,
      documentType: data.documentType,
      documentNumber: data.documentNumber,
      phone: data.phone,
      profilePhotoUrl: data.profilePhotoUrl,
      languages: data.languages,
      profession: data.profession,
      knowledgeLevel: data.knowledgeLevel,
      titleCertificate: data.titleCertificate,
      experienceTypes: data.experienceTypes,
      yearsExperience: data.yearsExperience,
      preferredTypes: data.preferredTypes,
      preferredAgeRange: data.preferredAgeRange,
      termsAccepted: data.termsAccepted === true,
      privacyAccepted: data.privacyAccepted === true,
    });

    if (updateResult.isFailure) {
      return updateResult;
    }

    const stepUpdateResult = await this.workerRepository.updateStep({
      workerId: data.workerId,
      step: 3,
      status: 'in_progress',
    });

    if (stepUpdateResult.isFailure) {
      return stepUpdateResult;
    }

    await this.eventDispatcher.notifyStepCompleted(data.workerId, 2, {
      firstName: data.firstName,
      lastName: data.lastName,
      profession: data.profession,
    });

    await this.eventDispatcher.notifyWorkerUpdated(data.workerId, {
      step: 3,
      status: 'in_progress',
      fields: ['personalInfo'],
    }, {
      firstName: data.firstName,
      lastName: data.lastName,
      profession: data.profession,
    });

    return Result.ok<Worker>(updateResult.getValue());
  }
}
