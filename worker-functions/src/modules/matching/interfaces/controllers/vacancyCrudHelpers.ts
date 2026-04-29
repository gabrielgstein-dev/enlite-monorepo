/**
 * vacancyCrudHelpers
 *
 * Module-level helpers for VacancyCrudController.
 * Extracted to keep VacancyCrudController within the 400-line limit.
 */

export interface VacancyInsertParams {
  vacancyNumber: number;
  case_number: any;
  computedTitle: string;
  patient_id: any;
  required_professions: any;
  required_sex: any;
  age_range_min: any;
  age_range_max: any;
  worker_profile_sought: any;
  required_experience: any;
  worker_attributes: any;
  schedule: any;
  work_schedule: any;
  providers_needed: any;
  salary_text: any;
  payment_day: any;
  daily_obs: any;
  patient_address_id: any;
}

export function buildInsertQuery(): string {
  return `
    INSERT INTO job_postings (
      vacancy_number, case_number, title, description, patient_id,
      required_professions, required_sex,
      age_range_min, age_range_max,
      worker_profile_sought, required_experience, worker_attributes,
      schedule, work_schedule,
      providers_needed, salary_text, payment_day,
      daily_obs,
      patient_address_id,
      status, country
    ) VALUES (
      $1, $2, $3, '', $4,
      $5, $6,
      $7, $8,
      $9, $10, $11,
      $12, $13,
      $14, $15, $16,
      $17,
      $18,
      'SEARCHING', 'AR'
    )
    RETURNING *
  `;
}

export function buildInsertParams(p: VacancyInsertParams): unknown[] {
  return [
    p.vacancyNumber,
    p.case_number,
    p.computedTitle,
    p.patient_id,
    p.required_professions ?? [],
    p.required_sex ?? null,
    p.age_range_min ?? null,
    p.age_range_max ?? null,
    p.worker_profile_sought ?? null,
    p.required_experience ?? null,
    p.worker_attributes ?? null,
    p.schedule ? JSON.stringify(p.schedule) : null,
    p.work_schedule ?? null,
    p.providers_needed,
    p.salary_text ?? 'A convenir',
    p.payment_day ?? null,
    p.daily_obs ?? null,
    p.patient_address_id ?? null,
  ];
}
