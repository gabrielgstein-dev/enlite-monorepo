import { IWorkerRepository } from '../../domain/repositories/IWorkerRepository';
import { CreateWorkerDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';
import { EventDispatcher } from '../../infrastructure/services/EventDispatcher';

/**
 * Detects if a worker was imported from spreadsheet (has fake authUid)
 * Imported workers have authUid patterns like:
 * - anacareimport_<phone>
 * - candidatoimport_<phone>
 * - pretalnimport_<phone>
 */
function isImportedWorker(authUid: string | null | undefined): boolean {
  if (!authUid) return false;
  const importPrefixes = ['anacareimport_', 'candidatoimport_', 'pretalnimport_'];
  return importPrefixes.some(prefix => authUid.startsWith(prefix));
}

export class InitWorkerUseCase {
  constructor(
    private workerRepository: IWorkerRepository,
    private eventDispatcher: EventDispatcher
  ) {}

  async execute(data: CreateWorkerDTO): Promise<Result<Worker>> {
    const consentAt = data.lgpdOptIn ? new Date() : undefined;

    const existingWorkerResult = await this.workerRepository.findByAuthUid(data.authUid);
    
    if (existingWorkerResult.isFailure) {
      return Result.fail<Worker>(existingWorkerResult.error!);
    }

    if (existingWorkerResult.getValue() !== null) {
      return Result.ok<Worker>(existingWorkerResult.getValue()!);
    }

    const emailCheckResult = await this.workerRepository.findByEmail(data.email);
    
    if (emailCheckResult.isFailure) {
      return Result.fail<Worker>(emailCheckResult.error!);
    }

    const existingByEmail = emailCheckResult.getValue();
    if (existingByEmail !== null) {
      // Reconcile: update auth_uid for existing worker with matching email.
      // This handles cases where user recreated their Firebase account (new authUid).
      // Also fill phone when the existing worker has none but the payload provides it.
      if (!existingByEmail.authUid || existingByEmail.authUid !== data.authUid) {
        const phoneToSet = !existingByEmail.phone && data.phone ? data.phone : undefined;
        const updateResult = await this.workerRepository.updateAuthUid(
          existingByEmail.id,
          data.authUid,
          phoneToSet,
          consentAt,
        );

        if (updateResult.isFailure) {
          return Result.fail<Worker>(updateResult.error!);
        }

        return Result.ok<Worker>(updateResult.getValue());
      }

      return Result.ok<Worker>(existingByEmail);
    }

    // Check for imported workers by phone
    // This handles the case where a worker was imported via spreadsheet
    // with a fake authUid and email, and now is creating a real account
    if (data.phone) {
      const phoneCheckResult = await this.workerRepository.findByPhone(data.phone);
      
      if (phoneCheckResult.isSuccess && phoneCheckResult.getValue() !== null) {
        const existingByPhone = phoneCheckResult.getValue()!;
        
        // Only reconcile if this is an imported worker (has fake authUid)
        if (isImportedWorker(existingByPhone.authUid)) {
          console.log(`[InitWorker] Migrating imported worker ${existingByPhone.id} from fake authUid "${existingByPhone.authUid}" to real authUid "${data.authUid}"`);
          
          const updateResult = await this.workerRepository.updateImportedWorkerData(
            existingByPhone.id,
            { authUid: data.authUid, email: data.email, consentAt }
          );
          
          if (updateResult.isFailure) {
            return Result.fail<Worker>(updateResult.error!);
          }
          
          return Result.ok<Worker>(updateResult.getValue());
        }
      }
    }

    const createResult = await this.workerRepository.create({
      authUid: data.authUid,
      email: data.email,
      phone: data.phone,
      whatsappPhone: data.whatsappPhone,
      lgpdOptIn: data.lgpdOptIn,
      country: data.country,
    });
    
    if (createResult.isFailure) {
      return createResult;
    }

    const worker = createResult.getValue();

    await this.eventDispatcher.notifyWorkerCreated(worker.id, {
      email: worker.email,
    });

    return Result.ok<Worker>(worker);
  }
}
