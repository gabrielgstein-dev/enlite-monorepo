/**
 * locationHelpers — pure functions for extracting state/city/neighborhood
 * from ClickUp location custom field values.
 *
 * ClickUp location fields return objects shaped like:
 *   { formatted_address: "San Isidro, Buenos Aires, Argentina", lat: -34.47, lng: -58.52 }
 * OR sometimes just a string (plain text fallback from address_raw).
 *
 * These helpers extract structured sub-fields without touching the database.
 * Following rule: feedback_modularize_to_extreme — utils never write to DB.
 */

/**
 * Extracts the formatted_address string from a ClickUp location field value.
 * Returns null if the value is not a valid location object.
 */
export function extractFormattedAddressFromLocation(location: unknown): string | null {
  if (!location || typeof location !== 'object') return null;
  const loc = location as Record<string, unknown>;
  if (typeof loc['formatted_address'] !== 'string') return null;
  const trimmed = loc['formatted_address'].trim();
  if (trimmed === '' || trimmed.toLowerCase() === 'null') return null;
  return trimmed;
}

/**
 * Extracts a named address component from a ClickUp location field value.
 * Google Maps address_components have type arrays like
 *   [{ long_name: "Buenos Aires", short_name: "BA", types: ["administrative_area_level_1"] }]
 *
 * ClickUp does not reliably return address_components, so the fallback extracts
 * the Nth comma-segment from formatted_address:
 *   segmentIndex=0 → first segment (locality / city)
 *   segmentIndex=-1 → last non-country segment (state / province)
 */
function extractAddressComponent(
  location: unknown,
  componentTypes: string[],
  segmentIndex: 0 | -1 = 0,
): string | null {
  if (!location || typeof location !== 'object') return null;
  const loc = location as Record<string, unknown>;

  // Try structured address_components first (preferred)
  if (Array.isArray(loc['address_components'])) {
    const components = loc['address_components'] as Array<Record<string, unknown>>;
    for (const comp of components) {
      const types = comp['types'];
      if (!Array.isArray(types)) continue;
      const hasType = componentTypes.some(t => (types as string[]).includes(t));
      if (hasType) {
        const name = comp['long_name'] ?? comp['short_name'];
        if (typeof name === 'string' && name.trim()) return name.trim();
      }
    }
  }

  // Fallback: parse formatted_address by comma segments
  // e.g. "Buenos Aires, CABA, Argentina" → segments ["Buenos Aires","CABA","Argentina"]
  if (typeof loc['formatted_address'] === 'string') {
    const segments = loc['formatted_address']
      .split(',')
      .map(s => s.trim())
      .filter(s => s.length > 0);
    if (segments.length === 0) return null;
    const idx = segmentIndex === -1 ? Math.max(0, segments.length - 2) : segmentIndex;
    return segments[idx] ?? null;
  }

  return null;
}

/**
 * Extracts the state (provincia) from a ClickUp location field value.
 * Uses address_components type "administrative_area_level_1".
 * Returns null when not extractable.
 */
export function extractStateFromLocation(location: unknown): string | null {
  // segmentIndex=0: "Buenos Aires, CABA, Argentina" → "Buenos Aires" (province)
  return extractAddressComponent(location, ['administrative_area_level_1'], 0);
}

/**
 * Extracts the city (ciudad / localidad) from a ClickUp location field value.
 * Tries locality, then sublocality_level_1, then administrative_area_level_2.
 * Returns null when not extractable.
 */
export function extractCityFromLocation(location: unknown): string | null {
  // segmentIndex=0 picks the first segment (locality / city name)
  return extractAddressComponent(location, [
    'locality',
    'sublocality_level_1',
    'administrative_area_level_2',
  ], 0);
}

/**
 * Normalizes a neighborhood (zona/barrio) string from a ClickUp short_text field.
 * Simply trims whitespace and returns null for empty/null values.
 */
export function extractNeighborhood(value: unknown): string | null {
  if (value === null || value === undefined) return null;
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  return trimmed || null;
}
