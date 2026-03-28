import { z } from 'zod';
import i18n from '../../infrastructure/i18n/config';

const t = i18n.t.bind(i18n);

// Enums for select values
const LanguageEnum = z.enum(['pt', 'es', 'en']);
const SexEnum = z.enum(['male', 'female']);
const GenderEnum = z.enum(['male', 'female', 'other']);
const DocumentTypeEnum = z.enum(['DNI', 'CPF', 'RG', 'CNH']);
const ProfessionEnum = z.enum(['AT', 'CAREGIVER', 'NURSE', 'KINESIOLOGIST', 'PSYCHOLOGIST']);
const KnowledgeLevelEnum = z.enum(['SECONDARY', 'TERTIARY', 'TECNICATURA', 'BACHELOR', 'POSTGRADUATE', 'MASTERS', 'DOCTORATE']);
const PatientTypeEnum = z.enum(['adicciones', 'psicosis', 'trastorno_alimentar', 'trastorno_bipolaridad', 'trastorno_ansiedad', 'trastorno_discapacidad_intelectual', 'trastorno_depresivo', 'trastorno_neurologico', 'trastorno_opositor_desafiante', 'trastorno_psicologico', 'trastorno_psiquiatrico']);
const YearsExperienceEnum = z.enum(['0_2', '3_5', '6_10', '10_plus']);
const AgeRangeEnum = z.enum(['children', 'adolescents', 'adults', 'elderly']);

// General Info Step Schema factory
export const createGeneralInfoSchema = () => z.object({
  profilePhoto: z.string().nullable().optional(),
  fullName: z.string().min(3, t('validation.fullNameMin')),
  lastName: z.string().min(1, t('validation.lastNameRequired')),
  cpf: z.string().min(11, t('validation.documentInvalid')).max(14, t('validation.documentInvalid')),
  phone: z.string().min(10, t('validation.phoneInvalid')).max(15, t('validation.phoneInvalid')),
  email: z.string().email(t('validation.emailInvalid')),
  birthDate: z.string().min(1, t('validation.birthDateRequired')),
  sex: z.union([SexEnum, z.literal('')])
    .transform((val) => val === '' ? undefined : val)
    .refine((val): val is 'male' | 'female' => val !== undefined, { message: t('validation.selectSex') }),
  gender: z.union([GenderEnum, z.literal('')])
    .transform((val) => val === '' ? undefined : val)
    .refine((val): val is 'male' | 'female' | 'other' => val !== undefined, { message: t('validation.selectGender') }),
  documentType: DocumentTypeEnum,
  professionalLicense: z.string().min(1, t('validation.licenseRequired')),
  languages: z.array(LanguageEnum).min(1, t('validation.selectLanguage')),
  profession: z.union([ProfessionEnum, z.literal('')])
    .transform((val) => val === '' ? undefined : val)
    .refine((val): val is 'AT' | 'CAREGIVER' | 'NURSE' | 'KINESIOLOGIST' | 'PSYCHOLOGIST' => val !== undefined, { message: t('validation.selectProfession') }),
  knowledgeLevel: z.union([KnowledgeLevelEnum, z.literal('')])
    .transform((val) => val === '' ? undefined : val)
    .refine((val): val is 'SECONDARY' | 'TERTIARY' | 'TECNICATURA' | 'BACHELOR' | 'POSTGRADUATE' | 'MASTERS' | 'DOCTORATE' => val !== undefined, { message: t('validation.selectKnowledgeLevel') }),
  experienceTypes: z.array(PatientTypeEnum).min(1, t('validation.selectExperienceType')),
  yearsExperience: z.union([YearsExperienceEnum, z.literal('')])
    .transform((val) => val === '' ? undefined : val)
    .refine((val): val is '0_2' | '3_5' | '6_10' | '10_plus' => val !== undefined, { message: t('validation.selectYearsExperience') }),
  preferredTypes: z.array(PatientTypeEnum).min(1, t('validation.selectPreferredType')),
  preferredAgeRange: z.union([AgeRangeEnum, z.literal('')])
    .transform((val) => val === '' ? undefined : val)
    .refine((val): val is 'children' | 'adolescents' | 'adults' | 'elderly' => val !== undefined, { message: t('validation.selectAgeRange') }),
});

export type GeneralInfoFormData = z.infer<ReturnType<typeof createGeneralInfoSchema>>;

// Service Address Step Schema factory
export const createServiceAddressSchema = () => z.object({
  serviceRadius: z.number().min(1, t('validation.serviceRadiusMin')),
  address: z.string().min(1, t('validation.addressRequired')),
  complement: z.string().optional(),
  acceptsRemoteService: z.boolean(),
});

export type ServiceAddressFormData = z.infer<ReturnType<typeof createServiceAddressSchema>>;

// Time Slot Schema factory
export const createTimeSlotSchema = () => z.object({
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, t('validation.timeInvalid')),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, t('validation.timeInvalid')),
}).refine((data) => {
  const [startHour, startMin] = data.startTime.split(':').map(Number);
  const [endHour, endMin] = data.endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes > startMinutes;
}, {
  message: t('validation.endTimeAfterStart'),
  path: ['endTime'],
});

export type TimeSlotFormData = z.infer<ReturnType<typeof createTimeSlotSchema>>;

// Day Availability Schema
export const dayAvailabilitySchema = z.object({
  day: z.string(),
  enabled: z.boolean(),
  timeSlots: z.array(z.object({
    startTime: z.string(),
    endTime: z.string(),
  })),
});

export type DayAvailabilityFormData = z.infer<typeof dayAvailabilitySchema>;

// Availability Step Schema factory
export const createAvailabilitySchema = () => z.object({
  schedule: z.array(dayAvailabilitySchema).refine(
    (schedule) => schedule.some((day) => day.enabled && day.timeSlots.length > 0),
    {
      message: t('validation.selectAtLeastOneDay'),
    }
  ),
});

export type AvailabilityFormData = z.infer<ReturnType<typeof createAvailabilitySchema>>;

// Complete Worker Registration Schema factory
export const createWorkerRegistrationSchema = () => z.object({
  generalInfo: createGeneralInfoSchema(),
  serviceAddress: createServiceAddressSchema(),
  availability: createAvailabilitySchema(),
});

export type WorkerRegistrationFormData = z.infer<ReturnType<typeof createWorkerRegistrationSchema>>;

// Legacy exports for backward compatibility (deprecated, use create* functions)
export const generalInfoSchema = createGeneralInfoSchema();
export const serviceAddressSchema = createServiceAddressSchema();
export const timeSlotSchema = createTimeSlotSchema();
export const availabilitySchema = createAvailabilitySchema();
export const workerRegistrationSchema = createWorkerRegistrationSchema();
