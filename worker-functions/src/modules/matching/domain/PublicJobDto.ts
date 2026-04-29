export interface PublicJobRow {
  id: string;
  case_number: number;
  vacancy_number: number;
  title: string;
  status: string;
  description: string | null;
  schedule_days_hours: string | null;
  worker_profile_sought: string | null;
  service: string | null;
  pathologies: string | null;
  provincia: string | null;
  localidad: string | null;
  detail_link: string;
}

export interface PublicJobDto {
  id: string;
  case_number: number;
  vacancy_number: number;
  title: string;
  status: string;
  description: string;   // sanitized — empty if generic
  schedule_days_hours: string | null;
  worker_profile_sought: string | null;
  service: string | null;
  pathologies: string | null;
  provincia: string | null;
  localidad: string | null;
  detail_link: string;
}
