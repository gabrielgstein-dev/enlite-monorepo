import type { EncuadreResultado } from '@modules/matching/domain/Encuadre';

/**
 * ENCUADRES_STATUS_TO_RESULTADO
 *
 * Maps ClickUp task statuses from the "Encuadres" list (ID 901318471648)
 * to the canonical encuadres.resultado enum.
 *
 * Rule: feedback_enum_values_english_uppercase.md — values stored UPPERCASE EN.
 * Keys are lowercased for case-insensitive lookup.
 */
export const ENCUADRES_STATUS_TO_RESULTADO: Record<string, EncuadreResultado> = {
  'pendiente de entrevista': 'PENDIENTE',     // ClickUp: "pendiente de entrevista"
  'realizada – en evaluación': 'PENDIENTE',   // ClickUp: "realizada – en evaluación" (awaiting decision)
  'realizada - en evaluacion': 'PENDIENTE',   // ClickUp: variant without accents/dash
  'esperando respuesta': 'PENDIENTE',         // ClickUp: "esperando respuesta"
  'reprogramar': 'REPROGRAMAR',               // ClickUp: "reprogramar"
  'rechazado': 'RECHAZADO',                   // ClickUp: "rechazado"
  'at no acepta': 'AT_NO_ACEPTA',             // ClickUp: "at no acepta"
  'reemplazo / guardias': 'PENDIENTE',        // ClickUp: "reemplazo / guardias" (active worker on standby)
  'seleccionado': 'SELECCIONADO',             // ClickUp: "seleccionado"
};
