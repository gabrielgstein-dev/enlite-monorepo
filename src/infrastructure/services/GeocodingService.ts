import { Client, GeocodeResult } from '@googlemaps/google-maps-services-js';

export interface GeocodedAddress {
  formattedAddress: string;
  city: string | null;
  state: string | null;
  country: string;
  latitude: number;
  longitude: number;
  placeId: string;
}

export class GeocodingService {
  private client: Client;
  private apiKey: string;

  constructor() {
    this.client = new Client({});
    this.apiKey = process.env.GOOGLE_MAPS_API_KEY || '';
    
    if (!this.apiKey) {
      console.warn('⚠️  GOOGLE_MAPS_API_KEY não configurada - geocodificação desabilitada');
    }
  }

  /**
   * Geocodifica um endereço usando Google Maps Geocoding API
   * @param address Endereço em texto livre (ex: "Av Corrientes 1234, Buenos Aires")
   * @param country Código do país para melhorar precisão (ex: "AR")
   * @returns Dados geocodificados ou null se falhar
   */
  async geocode(address: string, country = 'AR'): Promise<GeocodedAddress | null> {
    if (!this.apiKey) {
      console.warn('Geocoding skipped: API key not configured');
      return null;
    }

    if (!address || address.trim().length < 3) {
      return null;
    }

    try {
      const response = await this.client.geocode({
        params: {
          address: address.trim(),
          region: country.toLowerCase(),
          key: this.apiKey,
        },
        timeout: 5000,
      });

      if (response.data.status !== 'OK' || response.data.results.length === 0) {
        console.warn(`Geocoding failed for "${address}": ${response.data.status}`);
        return null;
      }

      const result = response.data.results[0];
      return this.parseGeocodeResult(result, country);
    } catch (error) {
      console.error(`Geocoding error for "${address}":`, error);
      return null;
    }
  }

  /**
   * Geocodifica múltiplos endereços em batch (com rate limiting)
   * @param addresses Array de endereços
   * @param country Código do país
   * @param delayMs Delay entre requests (padrão: 200ms para respeitar rate limits)
   * @returns Array de resultados (null para endereços que falharam)
   */
  async geocodeBatch(
    addresses: string[],
    country = 'AR',
    delayMs = 200
  ): Promise<(GeocodedAddress | null)[]> {
    const results: (GeocodedAddress | null)[] = [];

    for (const address of addresses) {
      const result = await this.geocode(address, country);
      results.push(result);

      // Rate limiting
      if (delayMs > 0 && addresses.indexOf(address) < addresses.length - 1) {
        await new Promise(resolve => setTimeout(resolve, delayMs));
      }
    }

    return results;
  }

  /**
   * Extrai componentes do resultado de geocodificação
   */
  private parseGeocodeResult(result: GeocodeResult, defaultCountry: string): GeocodedAddress {
    const components = result.address_components;
    
    // Extrair cidade
    const city = this.findComponent(components, ['locality', 'administrative_area_level_2']);
    
    // Extrair estado/província
    const state = this.findComponent(components, ['administrative_area_level_1']);
    
    // Extrair país
    const country = this.findComponent(components, ['country']) || defaultCountry;

    return {
      formattedAddress: result.formatted_address,
      city,
      state,
      country,
      latitude: result.geometry.location.lat,
      longitude: result.geometry.location.lng,
      placeId: result.place_id,
    };
  }

  /**
   * Busca um componente de endereço por tipo
   */
  private findComponent(
    components: GeocodeResult['address_components'],
    types: string[]
  ): string | null {
    for (const type of types) {
      const component = components.find((c: any) => c.types.includes(type));
      if (component) {
        return component.long_name;
      }
    }
    return null;
  }

  /**
   * Normaliza nome de zona/bairro para geocodificação
   * Ex: "CABA" → "Ciudad Autónoma de Buenos Aires, Argentina"
   */
  normalizeZone(zone: string, country = 'AR'): string {
    const normalized = zone.trim().toUpperCase();

    // Mapeamento de zonas conhecidas da Argentina
    const zoneMap: Record<string, string> = {
      'CABA': 'Ciudad Autónoma de Buenos Aires, Argentina',
      'CAPITAL': 'Ciudad Autónoma de Buenos Aires, Argentina',
      'CAPITAL FEDERAL': 'Ciudad Autónoma de Buenos Aires, Argentina',
      'GBA': 'Gran Buenos Aires, Argentina',
      'ZONA NORTE': 'Zona Norte, Gran Buenos Aires, Argentina',
      'ZONA SUR': 'Zona Sur, Gran Buenos Aires, Argentina',
      'ZONA OESTE': 'Zona Oeste, Gran Buenos Aires, Argentina',
    };

    if (zoneMap[normalized]) {
      return zoneMap[normalized];
    }

    // Se não encontrou mapeamento, adiciona país
    return `${zone}, ${country === 'AR' ? 'Argentina' : country}`;
  }
}
