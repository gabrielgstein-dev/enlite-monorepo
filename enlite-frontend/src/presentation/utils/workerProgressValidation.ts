import type { WorkerProgressResponse } from '@infrastructure/http/WorkerApiService';

/**
 * Valida rigorosamente se a etapa 1 (Informações Gerais) foi completada.
 * Verifica se TODOS os campos obrigatórios estão preenchidos.
 */
export function isStep1Complete(data: WorkerProgressResponse): boolean {
  return !!(
    data.firstName &&
    data.lastName &&
    data.birthDate &&
    data.sex &&
    data.gender &&
    data.documentType &&
    data.documentNumber &&
    data.languages && data.languages.length > 0 &&
    data.profession &&
    data.knowledgeLevel &&
    data.experienceTypes && data.experienceTypes.length > 0 &&
    data.yearsExperience &&
    data.preferredTypes && data.preferredTypes.length > 0 &&
    data.preferredAgeRange && data.preferredAgeRange.length > 0
  );
}

/**
 * Valida rigorosamente se a etapa 2 (Endereço de Atendimento) foi completada.
 * Verifica se TODOS os campos obrigatórios estão preenchidos.
 */
export function isStep2Complete(data: WorkerProgressResponse): boolean {
  return !!(
    data.serviceAddress &&
    data.serviceRadiusKm
  );
}

/**
 * Valida rigorosamente se a etapa 3 (Disponibilidade) foi completada.
 * Verifica se o objeto de disponibilidade existe e tem dados.
 */
export function isStep3Complete(data: WorkerProgressResponse): boolean {
  if (!data.availability) return false;
  
  const availabilityObj = data.availability as Record<string, unknown>;
  const hasData = Object.keys(availabilityObj).length > 0;
  
  return hasData;
}

/**
 * Representa o progresso parcial de uma etapa com base nos campos preenchidos.
 */
export interface StepProgress {
  completedFields: number;
  totalFields: number;
  percentage: number;
}

/**
 * Calcula o progresso granular da etapa 1 (Informações Gerais) campo a campo.
 */
export function getStep1Progress(data: WorkerProgressResponse): StepProgress {
  const fields: unknown[] = [
    data.firstName,
    data.lastName,
    data.birthDate,
    data.sex,
    data.gender,
    data.documentType,
    data.documentNumber,
    data.languages && data.languages.length > 0 ? data.languages : null,
    data.profession,
    data.knowledgeLevel,
    data.experienceTypes && data.experienceTypes.length > 0 ? data.experienceTypes : null,
    data.yearsExperience,
    data.preferredTypes && data.preferredTypes.length > 0 ? data.preferredTypes : null,
    data.preferredAgeRange && data.preferredAgeRange.length > 0 ? data.preferredAgeRange : null,
  ];

  const completedFields = fields.filter(Boolean).length;
  const totalFields = fields.length;

  return {
    completedFields,
    totalFields,
    percentage: Math.round((completedFields / totalFields) * 100),
  };
}

/**
 * Calcula o progresso granular da etapa 2 (Endereço de Atendimento) campo a campo.
 */
export function getStep2Progress(data: WorkerProgressResponse): StepProgress {
  const fields: unknown[] = [
    data.serviceAddress,
    data.serviceRadiusKm,
  ];

  const completedFields = fields.filter(Boolean).length;
  const totalFields = fields.length;

  return {
    completedFields,
    totalFields,
    percentage: Math.round((completedFields / totalFields) * 100),
  };
}

/**
 * Calcula o progresso granular da etapa 3 (Disponibilidade).
 * Considera completo se o campo de disponibilidade tiver dados.
 */
export function getStep3Progress(data: WorkerProgressResponse): StepProgress {
  const hasAvailability =
    !!data.availability &&
    (Array.isArray(data.availability)
      ? (data.availability as unknown[]).length > 0
      : Object.keys(data.availability).length > 0);

  return {
    completedFields: hasAvailability ? 1 : 0,
    totalFields: 1,
    percentage: hasAvailability ? 100 : 0,
  };
}

/**
 * Valida rigorosamente todas as etapas do cadastro básico.
 */
export function validateRegistrationSteps(data: WorkerProgressResponse): {
  step1: boolean;
  step2: boolean;
  step3: boolean;
} {
  return {
    step1: isStep1Complete(data),
    step2: isStep2Complete(data),
    step3: isStep3Complete(data),
  };
}
