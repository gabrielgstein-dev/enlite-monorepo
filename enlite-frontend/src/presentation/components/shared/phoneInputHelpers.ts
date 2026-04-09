import { Country, getCountries, parsePhoneNumber } from 'react-phone-number-input';

// Lista de países priorizados
export const PRIORITY_COUNTRIES: Country[] = ['BR', 'US', 'ES', 'PT', 'AR', 'CL', 'CO', 'MX', 'PE', 'UY'];

// Ordenar países: priorizados primeiro
export const getSortedCountries = (): Country[] => {
  const allCountries = getCountries();
  const priority = PRIORITY_COUNTRIES.filter(c => allCountries.includes(c));
  const others = allCountries.filter(c => !PRIORITY_COUNTRIES.includes(c));
  return [...priority, ...others.sort()];
};

// Extrair número nacional
export const extractNationalNumber = (value: string, countryCode: string): string => {
  if (!value || !value.startsWith('+')) return value;
  try {
    const parsed = parsePhoneNumber(value);
    return parsed?.nationalNumber?.toString() || value.replace(`+${countryCode}`, '').trim();
  } catch {
    return value.replace(`+${countryCode}`, '').trim();
  }
};

// Limites de dígitos por país (apenas dígitos nacionais, não inclui formatação)
const PHONE_LENGTH_LIMITS: Partial<Record<Country, number>> = {
  BR: 11,  // (11) 99999-9999 = 11 dígitos
  US: 10,  // (555) 123-4567 = 10 dígitos
  ES: 9,   // 612 34 56 78 = 9 dígitos
  PT: 9,   // 912 345 678 = 9 dígitos
  AR: 11,  // 9 11 2345-6789 = 11 dígitos (prefixo 9 = celular)
  CL: 9,   // 9 1234 5678 = 9 dígitos
  CO: 10,  // 321 234 5678 = 10 dígitos
  MX: 10,  // 55 1234 5678 = 10 dígitos
  PE: 9,   // 912 345 678 = 9 dígitos
  UY: 8,   // 91 234 567 = 8 dígitos
};

// Obter limite para um país (padrão: 15 dígitos)
export const getMaxDigitsForCountry = (country: Country): number => {
  return PHONE_LENGTH_LIMITS[country] || 15;
};

// Placeholder por país (formato internacional, sem o +código)
export const getPlaceholderForCountry = (country: Country): string => {
  const placeholders: Partial<Record<Country, string>> = {
    BR: '+55 11 99999 9999',
    US: '+1 555 123 4567',
    ES: '+34 612 34 56 78',
    PT: '+351 912 345 678',
    AR: '+54 9 11 2345 6789',
    CL: '+56 9 1234 5678',
    CO: '+57 321 234 5678',
    MX: '+52 55 1234 5678',
    PE: '+51 912 345 678',
    UY: '+598 91 234 567',
  };
  return placeholders[country] || '+XX XXX XXX XXX';
};
