// Extension methods for WorkerRepository
// Add this code to WorkerRepository.ts after the updateStatus method

import { SavePersonalInfoDTO, Worker } from '../../domain/entities/Worker';
import { Result } from '../../domain/shared/Result';

export async function updatePersonalInfo(
  this: any,
  data: Omit<SavePersonalInfoDTO, 'termsAccepted' | 'privacyAccepted'> & { 
    termsAccepted: boolean; 
    privacyAccepted: boolean; 
  }
): Promise<Result<Worker>> {
  try {
    const query = `
      UPDATE workers SET
        first_name = $2,
        last_name = $3,
        sex = $4,
        gender = $5,
        birth_date = $6,
        document_type = $7,
        document_number = $8,
        phone = $9,
        profile_photo_url = $10,
        languages = $11,
        profession = $12,
        knowledge_level = $13,
        title_certificate = $14,
        experience_types = $15,
        years_experience = $16,
        preferred_types = $17,
        preferred_age_range = $18,
        terms_accepted_at = CASE WHEN $19 THEN NOW() ELSE terms_accepted_at END,
        privacy_accepted_at = CASE WHEN $20 THEN NOW() ELSE privacy_accepted_at END,
        updated_at = NOW()
      WHERE id = $1
      RETURNING 
        id,
        auth_uid as "authUid",
        email,
        phone,
        first_name as "firstName",
        last_name as "lastName",
        sex,
        gender,
        birth_date as "birthDate",
        document_type as "documentType",
        document_number as "documentNumber",
        profile_photo_url as "profilePhotoUrl",
        languages,
        profession,
        knowledge_level as "knowledgeLevel",
        title_certificate as "titleCertificate",
        experience_types as "experienceTypes",
        years_experience as "yearsExperience",
        preferred_types as "preferredTypes",
        preferred_age_range as "preferredAgeRange",
        current_step as "currentStep",
        status,
        country,
        terms_accepted_at as "termsAcceptedAt",
        privacy_accepted_at as "privacyAcceptedAt",
        created_at as "createdAt",
        updated_at as "updatedAt"
    `;

    const values = [
      data.workerId,
      data.firstName,
      data.lastName,
      data.sex,
      data.gender,
      data.birthDate,
      data.documentType,
      data.documentNumber,
      data.phone,
      data.profilePhotoUrl || null,
      data.languages,
      data.profession,
      data.knowledgeLevel,
      data.titleCertificate,
      data.experienceTypes,
      data.yearsExperience,
      data.preferredTypes,
      data.preferredAgeRange,
      data.termsAccepted,
      data.privacyAccepted,
    ];

    const result = await this.pool.query(query, values);

    if (result.rows.length === 0) {
      return Result.fail<Worker>('Worker not found');
    }

    return Result.ok<Worker>(result.rows[0]);
  } catch (error: any) {
    return Result.fail<Worker>(`Failed to update personal info: ${error.message}`);
  }
}

// Copy this entire method and add it to the WorkerRepository class
