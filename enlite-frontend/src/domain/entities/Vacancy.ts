/**
 * Domain entities for Vacancies and Encuadres
 */

export type RejectionReasonCategory =
  | 'DISTANCE'
  | 'SCHEDULE_INCOMPATIBLE'
  | 'INSUFFICIENT_EXPERIENCE'
  | 'SALARY_EXPECTATION'
  | 'WORKER_DECLINED'
  | 'OVERQUALIFIED'
  | 'DEPENDENCY_MISMATCH'
  | 'TALENTUM_NOT_QUALIFIED'
  | 'OTHER';

export type JobPostingPriority = 'URGENT' | 'HIGH' | 'NORMAL' | 'LOW';

export interface Encuadre {
  id: string;
  worker_name: string | null;
  worker_phone: string | null;
  interview_date: string | null;
  resultado: string | null;
  attended: boolean | null;
  rejection_reason_category: RejectionReasonCategory | null;
  rejection_reason: string | null;
}

/** DTO returned by the public vacancy endpoint GET /api/vacancies/:id */
export interface PublicVacancyDetail {
  id: string;
  case_number: number | null;
  vacancy_number: number;
  title: string;
  status: string;
  required_professions: string[];
  required_sex: string | null;
  age_range_min: number | null;
  age_range_max: number | null;
  worker_attributes: string | null;
  schedule: Record<string, { start: string; end: string }[]> | null;
  schedule_days_hours: string | null;
  salary_text: string | null;
  talentum_description: string | null;
  talentum_whatsapp_url: string | null;
  patient_zone: string | null;
  country: string | null;
  created_at: string;
}
