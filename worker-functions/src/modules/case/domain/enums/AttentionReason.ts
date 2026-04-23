/**
 * AttentionReason — data-quality flags on a patient record that require
 * operational review. Populated when importing/upserting records with
 * known gaps (e.g., legacy records without contact channel).
 *
 * Operations reviews patients where `needs_attention=true` and either
 * completes the missing data or deletes the record.
 *
 * This is an internal vocabulary (not sourced from ClickUp). The DB column
 * `patients.attention_reasons` is TEXT[] WITHOUT CHECK constraint — new
 * reasons can be added here and used immediately, no migration required.
 */
export type AttentionReason =
  | 'MISSING_INFO';

export const ATTENTION_REASONS: readonly AttentionReason[] = [
  'MISSING_INFO',
] as const;

export function isAttentionReason(value: unknown): value is AttentionReason {
  return typeof value === 'string' && (ATTENTION_REASONS as readonly string[]).includes(value);
}
