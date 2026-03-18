import { z } from 'zod';

// Enums for select values
const LanguageEnum = z.enum(['pt', 'es', 'en']);
const SexEnum = z.enum(['male', 'female']);
const GenderEnum = z.enum(['male', 'female', 'other']);
const DocumentTypeEnum = z.enum(['CPF', 'RG', 'CNH']);
const ProfessionEnum = z.enum(['caregiver', 'nurse', 'psychologist', 'physiotherapist']);
const KnowledgeLevelEnum = z.enum(['bachelor', 'technical', 'masters', 'doctorate']);
const PatientTypeEnum = z.enum(['elderly', 'adhd', 'children', 'adolescents', 'adults']);
const YearsExperienceEnum = z.enum(['0_2', '3_5', '6_10', '10_plus']);
const AgeRangeEnum = z.enum(['children', 'adolescents', 'adults', 'elderly']);

// General Info Step Schema
export const generalInfoSchema = z.object({
  profilePhoto: z.string().nullable().optional(),
  fullName: z.string().min(3, 'Nome completo deve ter pelo menos 3 caracteres'),
  lastName: z.string().min(1, 'Sobrenome é obrigatório'),
  cpf: z.string().min(11, 'CPF inválido').max(14, 'CPF inválido'),
  phone: z.string().min(10, 'Telefone inválido').max(15, 'Telefone inválido'),
  email: z.string().email('E-mail inválido'),
  birthDate: z.string().min(1, 'Data de nascimento é obrigatória'),
  sex: SexEnum,
  gender: GenderEnum,
  documentType: DocumentTypeEnum,
  professionalLicense: z.string().min(1, 'Registro profissional é obrigatório'),
  languages: z.array(LanguageEnum).min(1, 'Selecione pelo menos um idioma'),
  profession: ProfessionEnum,
  knowledgeLevel: KnowledgeLevelEnum,
  experienceTypes: z.array(PatientTypeEnum).min(1, 'Selecione pelo menos um tipo de experiência'),
  yearsExperience: YearsExperienceEnum,
  preferredTypes: z.array(PatientTypeEnum).min(1, 'Selecione pelo menos um tipo preferido'),
  preferredAgeRange: AgeRangeEnum,
});

export type GeneralInfoFormData = z.infer<typeof generalInfoSchema>;

// Service Address Step Schema
export const serviceAddressSchema = z.object({
  serviceRadius: z.number().min(1, 'Raio de atendimento deve ser pelo menos 1km'),
  address: z.string().min(1, 'Endereço é obrigatório'),
  complement: z.string().optional(),
  acceptsRemoteService: z.boolean(),
});

export type ServiceAddressFormData = z.infer<typeof serviceAddressSchema>;

// Time Slot Schema
export const timeSlotSchema = z.object({
  startTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Horário inválido'),
  endTime: z.string().regex(/^([0-1]?[0-9]|2[0-3]):[0-5][0-9]$/, 'Horário inválido'),
}).refine((data) => {
  const [startHour, startMin] = data.startTime.split(':').map(Number);
  const [endHour, endMin] = data.endTime.split(':').map(Number);
  const startMinutes = startHour * 60 + startMin;
  const endMinutes = endHour * 60 + endMin;
  return endMinutes > startMinutes;
}, {
  message: 'Horário de término deve ser depois do horário de início',
  path: ['endTime'],
});

export type TimeSlotFormData = z.infer<typeof timeSlotSchema>;

// Day Availability Schema
export const dayAvailabilitySchema = z.object({
  day: z.string(),
  enabled: z.boolean(),
  timeSlots: z.array(timeSlotSchema),
});

export type DayAvailabilityFormData = z.infer<typeof dayAvailabilitySchema>;

// Availability Step Schema
export const availabilitySchema = z.object({
  schedule: z.array(dayAvailabilitySchema).refine(
    (schedule) => schedule.some((day) => day.enabled && day.timeSlots.length > 0),
    {
      message: 'Selecione pelo menos um dia com horários disponíveis',
    }
  ),
});

export type AvailabilityFormData = z.infer<typeof availabilitySchema>;

// Complete Worker Registration Schema (for final submission)
export const workerRegistrationSchema = z.object({
  generalInfo: generalInfoSchema,
  serviceAddress: serviceAddressSchema,
  availability: availabilitySchema,
});

export type WorkerRegistrationFormData = z.infer<typeof workerRegistrationSchema>;
