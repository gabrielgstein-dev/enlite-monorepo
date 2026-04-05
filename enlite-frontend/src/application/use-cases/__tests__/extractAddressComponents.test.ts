import { describe, it, expect } from 'vitest';
import { extractAddressComponents } from '../extractAddressComponents';

type FakePlaceResult = google.maps.places.PlaceResult;

function makeComponent(longName: string, types: string[]): google.maps.GeocoderAddressComponent {
  return { long_name: longName, short_name: longName, types };
}

function makePlaceResult(
  components: google.maps.GeocoderAddressComponent[],
): FakePlaceResult {
  return { address_components: components } as FakePlaceResult;
}

describe('extractAddressComponents', () => {
  it('extracts city from locality', () => {
    const place = makePlaceResult([
      makeComponent('Buenos Aires', ['locality', 'political']),
      makeComponent('C1000', ['postal_code']),
    ]);
    const result = extractAddressComponents(place);
    expect(result.city).toBe('Buenos Aires');
    expect(result.postalCode).toBe('C1000');
  });

  it('falls back to administrative_area_level_2 when locality is absent', () => {
    const place = makePlaceResult([
      makeComponent('Gran Buenos Aires', ['administrative_area_level_2', 'political']),
    ]);
    const result = extractAddressComponents(place);
    expect(result.city).toBe('Gran Buenos Aires');
  });

  it('extracts neighborhood from sublocality', () => {
    const place = makePlaceResult([
      makeComponent('Palermo', ['sublocality', 'sublocality_level_1', 'political']),
    ]);
    const result = extractAddressComponents(place);
    expect(result.neighborhood).toBe('Palermo');
  });

  it('extracts neighborhood from neighborhood type', () => {
    const place = makePlaceResult([
      makeComponent('Vila Madalena', ['neighborhood', 'political']),
    ]);
    const result = extractAddressComponents(place);
    expect(result.neighborhood).toBe('Vila Madalena');
  });

  it('extracts state and country', () => {
    const place = makePlaceResult([
      makeComponent('São Paulo', ['administrative_area_level_1', 'political']),
      makeComponent('Brazil', ['country', 'political']),
    ]);
    const result = extractAddressComponents(place);
    expect(result.state).toBe('São Paulo');
    expect(result.country).toBe('Brazil');
  });

  it('returns null for missing fields', () => {
    const place = makePlaceResult([]);
    const result = extractAddressComponents(place);
    expect(result.city).toBeNull();
    expect(result.postalCode).toBeNull();
    expect(result.neighborhood).toBeNull();
    expect(result.state).toBeNull();
    expect(result.country).toBeNull();
  });

  it('handles undefined address_components gracefully', () => {
    const place = {} as FakePlaceResult;
    const result = extractAddressComponents(place);
    expect(result.city).toBeNull();
    expect(result.postalCode).toBeNull();
  });

  it('extracts all fields from a full place result', () => {
    const place = makePlaceResult([
      makeComponent('Floresta', ['neighborhood', 'political']),
      makeComponent('Córdoba', ['locality', 'political']),
      makeComponent('X5000', ['postal_code']),
      makeComponent('Córdoba', ['administrative_area_level_1', 'political']),
      makeComponent('Argentina', ['country', 'political']),
    ]);
    const result = extractAddressComponents(place);
    expect(result.neighborhood).toBe('Floresta');
    expect(result.city).toBe('Córdoba');
    expect(result.postalCode).toBe('X5000');
    expect(result.state).toBe('Córdoba');
    expect(result.country).toBe('Argentina');
  });
});
