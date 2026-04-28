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
 * Falls back to parsing formatted_address when address_components is absent.
 */
function extractAddressComponent(
  location: unknown,
  componentTypes: string[],
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

  return null;
}

/**
 * Extracts the state (provincia) from a ClickUp location field value.
 * Uses address_components type "administrative_area_level_1".
 * Returns null when not extractable.
 */
export function extractStateFromLocation(location: unknown): string | null {
  return extractAddressComponent(location, ['administrative_area_level_1']);
}

/**
 * Extracts the city (ciudad / localidad) from a ClickUp location field value.
 * Tries locality, then sublocality_level_1, then administrative_area_level_2.
 * Returns null when not extractable.
 */
export function extractCityFromLocation(location: unknown): string | null {
  return extractAddressComponent(location, [
    'locality',
    'sublocality_level_1',
    'administrative_area_level_2',
  ]);
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
