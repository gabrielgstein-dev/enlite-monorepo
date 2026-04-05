export interface AddressComponents {
  city: string | null;
  postalCode: string | null;
  neighborhood: string | null;
  state: string | null;
  country: string | null;
}

/**
 * Extracts structured address fields from a Google Maps PlaceResult.
 * Resolves city from 'locality' or falls back to 'administrative_area_level_2'.
 */
export function extractAddressComponents(
  place: google.maps.places.PlaceResult,
): AddressComponents {
  const components = place.address_components ?? [];

  const get = (types: string[]): string | null => {
    for (const type of types) {
      const found = components.find((c) => c.types.includes(type));
      if (found) return found.long_name;
    }
    return null;
  };

  return {
    city: get(['locality', 'administrative_area_level_2']),
    postalCode: get(['postal_code']),
    neighborhood: get(['sublocality', 'sublocality_level_1', 'neighborhood']),
    state: get(['administrative_area_level_1']),
    country: get(['country']),
  };
}
