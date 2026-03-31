export type InterviewResponse = 'pending' | 'confirmed' | 'declined' | 'no_response';

const VALID_TRANSITIONS: Record<string, string[]> = {
  pending: ['confirmed', 'declined'],
  confirmed: ['declined'],
  declined: [],
  no_response: [],
};

/**
 * Valida transições de interview_response em worker_job_applications.
 * Impede transições inválidas (ex: declined → pending).
 */
export function canTransition(from: string, to: string): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}
