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
