import type { PublicJobRow, PublicJobDto } from '../domain/PublicJobDto';

const GENERIC_DESCRIPTION_PREFIXES = [
  'caso operacional importado',
  'caso operacional',
];

export function sanitizeDescription(raw: string | null): string {
  if (!raw) return '';
  const lower = raw.trim().toLowerCase();
  if (GENERIC_DESCRIPTION_PREFIXES.some(p => lower.startsWith(p))) return '';
  return raw.trim();
}

export function mapPublicJobRow(row: PublicJobRow): PublicJobDto {
  return {
    id: row.id,
    case_number: row.case_number,
    vacancy_number: row.vacancy_number,
    title: row.title,
    status: row.status,
    description: sanitizeDescription(row.description),
    schedule_days_hours: row.schedule_days_hours,
    worker_profile_sought: row.worker_profile_sought,
    service: row.service,
    pathologies: row.pathologies,
    provincia: row.provincia,
    localidad: row.localidad,
    detail_link: row.detail_link,
  };
}
