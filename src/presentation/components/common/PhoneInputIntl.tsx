import { useState, useRef, useEffect, useCallback } from 'react';
import PhoneInput, { Country, isPossiblePhoneNumber, getCountries, getCountryCallingCode, parsePhoneNumber } from 'react-phone-number-input';
import 'react-phone-number-input/style.css';

interface PhoneInputIntlProps {
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  defaultCountry?: Country;
  disabled?: boolean;
  readOnly?: boolean;
  className?: string;
  icon?: React.ReactNode;
}

// Lista de países priorizados
const PRIORITY_COUNTRIES: Country[] = ['BR', 'US', 'ES', 'PT', 'AR', 'CL', 'CO', 'MX', 'PE', 'UY'];

// Ordenar países: priorizados primeiro
const getSortedCountries = (): Country[] => {
  const allCountries = getCountries();
  const priority = PRIORITY_COUNTRIES.filter(c => allCountries.includes(c));
  const others = allCountries.filter(c => !PRIORITY_COUNTRIES.includes(c));
  return [...priority, ...others.sort()];
};

// Extrair número nacional
const extractNationalNumber = (value: string, countryCode: string): string => {
  if (!value || !value.startsWith('+')) return value;
  try {
    const parsed = parsePhoneNumber(value);
    return parsed?.nationalNumber?.toString() || value.replace(`+${countryCode}`, '').trim();
  } catch {
    return value.replace(`+${countryCode}`, '').trim();
  }
};

// Limites de dígitos por país (apenas dígitos, não inclui formatação)
const PHONE_LENGTH_LIMITS: Partial<Record<Country, number>> = {
  BR: 11,  // (11) 99999-9999 = 11 dígitos
  US: 10,  // (555) 123-4567 = 10 dígitos
  ES: 9,   // 612 34 56 78 = 9 dígitos
  PT: 9,   // 912 345 678 = 9 dígitos
  AR: 10,  // 11 2345-6789 = 10 dígitos
  CL: 9,   // 9 1234 5678 = 9 dígitos
  CO: 10,  // 321 234 5678 = 10 dígitos
  MX: 10,  // 55 1234 5678 = 10 dígitos
  PE: 9,   // 912 345 678 = 9 dígitos
  UY: 8,   // 91 234 567 = 8 dígitos
};

// Obter limite para um país (padrão: 15 dígitos)
const getMaxDigitsForCountry = (country: Country): number => {
  return PHONE_LENGTH_LIMITS[country] || 15;
};

// Placeholder por país
const getPlaceholderForCountry = (country: Country): string => {
  const placeholders: Partial<Record<Country, string>> = {
    BR: '(11) 99999-9999',
    US: '(555) 123-4567',
    ES: '612 34 56 78',
    PT: '912 345 678',
    AR: '11 2345-6789',
    CL: '9 1234 5678',
    CO: '321 234 5678',
    MX: '55 1234 5678',
    PE: '912 345 678',
    UY: '91 234 567',
  };
  return placeholders[country] || '999 999 999';
};

export function PhoneInputIntl({
  value,
  onChange,
  placeholder,
  defaultCountry = 'BR',
  disabled = false,
  readOnly = false,
  className = '',
  icon,
}: PhoneInputIntlProps): JSX.Element {
  const [country, setCountry] = useState<Country>(defaultCountry);
  const [nationalNumber, setNationalNumber] = useState<string>('');
  const containerRef = useRef<HTMLDivElement>(null);
  const sortedCountries = useRef<Country[]>(getSortedCountries()).current;

  // Extrair número nacional
  useEffect(() => {
    const countryCode = getCountryCallingCode(country);
    const national = extractNationalNumber(value, countryCode);
    setNationalNumber(national);
  }, [value, country]);

  // Detectar país por prefixo
  useEffect(() => {
    if (value && value.startsWith('+')) {
      try {
        const parsed = parsePhoneNumber(value);
        if (parsed?.country && parsed.country !== country) {
          setCountry(parsed.country as Country);
        }
      } catch {
        // Ignora erro
      }
    }
  }, [value, country]);

  const handleCountryChange = useCallback((newCountry: Country | undefined): void => {
    if (!newCountry || newCountry === country) return;
    
    // Manter número ao trocar país
    const newCountryCode = getCountryCallingCode(newCountry);
    const newValue = nationalNumber ? `+${newCountryCode}${nationalNumber}` : '';
    
    setCountry(newCountry);
    onChange(newValue);
  }, [country, nationalNumber, onChange]);

  const handleChange = useCallback((newValue: string | undefined): void => {
    if (!newValue) {
      onChange('');
      return;
    }
    
    // Contar apenas dígitos para aplicar limite por país
    const digitsOnly = newValue.replace(/\D/g, '');
    const maxDigits = getMaxDigitsForCountry(country);
    
    // Se exceder o limite, truncar mantendo formatação
    if (digitsOnly.length > maxDigits) {
      // Truncar o valor mantendo a formatação
      let digitCount = 0;
      let truncatedValue = '';
      
      for (const char of newValue) {
        if (/\d/.test(char)) {
          if (digitCount >= maxDigits) break;
          digitCount++;
        }
        truncatedValue += char;
      }
      
      onChange(truncatedValue);
      return;
    }
    
    onChange(newValue);
  }, [onChange, country]);

  const dynamicPlaceholder = placeholder || getPlaceholderForCountry(country);

  return (
    <div ref={containerRef} className={`phone-input-wrapper ${className}`}>
      <PhoneInput
        value={value}
        onChange={handleChange}
        country={country}
        onCountryChange={handleCountryChange}
        placeholder={dynamicPlaceholder}
        disabled={disabled}
        readOnly={readOnly}
        international={false}
        defaultCountry={defaultCountry}
        countries={sortedCountries}
        countrySelectComponent={({ value: countryValue, onChange: onCountrySelectChange, disabled: selectDisabled, ...rest }) => (
          <CountrySelect
            value={countryValue as Country}
            onChange={onCountrySelectChange}
            countries={sortedCountries}
            disabled={selectDisabled || disabled || readOnly}
            {...rest}
          />
        )}
      />
      
      {icon && <span className="phone-input-icon">{icon}</span>}

      <style>{`
        .phone-input-wrapper {
          display: flex;
          align-items: center;
          height: 48px;
          padding: 0 16px;
          border-radius: 10px;
          border: 1.5px solid #D9D9D9;
          background: white;
          gap: 8px;
          transition: border-color 0.2s ease;
        }
        
        .phone-input-wrapper:focus-within {
          border-color: #180149;
        }
        
        .phone-input-wrapper .PhoneInput {
          display: flex;
          align-items: center;
          width: 100%;
          gap: 12px;
        }
        
        .phone-input-wrapper .PhoneInputCountry {
          display: flex;
          align-items: center;
          position: relative;
        }
        
        .phone-input-wrapper .PhoneInputCountryIcon {
          width: 24px;
          height: 18px;
          border-radius: 2px;
          box-shadow: 0 0 0 1px rgba(0,0,0,0.1);
        }
        
        .phone-input-wrapper .PhoneInputCountrySelect {
          position: absolute;
          top: 0;
          left: 0;
          width: 100%;
          height: 100%;
          opacity: 0;
          cursor: pointer;
        }
        
        .phone-input-wrapper .PhoneInputInput {
          flex: 1;
          border: none;
          outline: none;
          background: transparent;
          font-family: 'Lexend', sans-serif;
          font-size: 14px;
          font-weight: 500;
          color: #374151;
        }
        
        .phone-input-wrapper .PhoneInputInput::placeholder {
          color: #D9D9D9;
        }
        
        .phone-input-icon {
          display: flex;
          align-items: center;
          flex-shrink: 0;
        }
      `}</style>
    </div>
  );
}

// Componente de seleção de país
interface CountrySelectProps {
  value: Country;
  onChange: (value: Country | undefined) => void;
  countries: Country[];
  disabled?: boolean;
}

function CountrySelect({ value, onChange, countries, disabled }: CountrySelectProps): JSX.Element {
  const [isOpen, setIsOpen] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);
  const selectedCountry = value || 'BR';

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent): void => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
        setSearchTerm('');
      }
    };

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
      return () => document.removeEventListener('mousedown', handleClickOutside);
    }
  }, [isOpen]);

  const handleSelect = (country: Country): void => {
    onChange(country);
    setIsOpen(false);
    setSearchTerm('');
  };

  const getCountryName = (country: Country): string => {
    const names: Record<string, string> = {
      BR: 'Brasil', US: 'Estados Unidos', ES: 'Espanha', PT: 'Portugal',
      AR: 'Argentina', CL: 'Chile', CO: 'Colômbia', MX: 'México',
      PE: 'Peru', UY: 'Uruguai',
    };
    return names[country] || country;
  };

  const buttonStyle: React.CSSProperties = {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '4px 8px',
    border: 'none',
    background: 'transparent',
    cursor: disabled ? 'not-allowed' : 'pointer',
    fontFamily: 'Lexend, sans-serif',
    fontSize: '14px',
    fontWeight: 500,
    color: '#374151',
  };

  const flagStyle: React.CSSProperties = {
    width: '24px',
    height: '18px',
    borderRadius: '2px',
    boxShadow: '0 0 0 1px rgba(0,0,0,0.1)',
    objectFit: 'cover',
  };

  return (
    <div ref={dropdownRef} style={{ position: 'relative' }}>
      <button
        type="button"
        onClick={() => !disabled && setIsOpen(!isOpen)}
        disabled={disabled}
        style={buttonStyle}
        aria-label="Phone number country"
        aria-haspopup="listbox"
        aria-expanded={isOpen}
      >
        <img
          src={`https://flagcdn.com/w40/${selectedCountry.toLowerCase()}.png`}
          alt={selectedCountry}
          style={flagStyle}
        />
        <span style={{ color: '#737373', minWidth: '36px', textAlign: 'left' }}>
          +{getCountryCallingCode(selectedCountry)}
        </span>
        <svg width="10" height="6" viewBox="0 0 10 6" fill="none">
          <path d="M1 1L5 5L9 1" stroke="#737373" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
        </svg>
      </button>

      {isOpen && (
        <div style={{
          position: 'absolute',
          top: 'calc(100% + 4px)',
          left: 0,
          width: '280px',
          maxHeight: '320px',
          background: 'white',
          border: '1px solid #D9D9D9',
          borderRadius: '10px',
          boxShadow: '0 4px 12px rgba(0, 0, 0, 0.15)',
          zIndex: 1000,
          overflow: 'hidden',
        }}>
          <div style={{ padding: '12px 16px', borderBottom: '1px solid #F0F0F0' }}>
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar país..."
              style={{
                width: '100%',
                padding: '8px 12px',
                border: '1px solid #D9D9D9',
                borderRadius: '6px',
                fontFamily: 'Lexend, sans-serif',
                fontSize: '14px',
                outline: 'none',
              }}
              autoFocus
            />
          </div>
          
          <div style={{ maxHeight: '240px', overflowY: 'auto' }}>
            {countries
              .filter(c => {
                const name = getCountryName(c).toLowerCase();
                const code = getCountryCallingCode(c);
                const search = searchTerm.toLowerCase();
                return name.includes(search) || code.includes(search);
              })
              .map(country => (
                <button
                  key={country}
                  type="button"
                  onClick={() => handleSelect(country)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '12px',
                    width: '100%',
                    padding: '10px 16px',
                    border: 'none',
                    background: country === selectedCountry ? '#FFF9FC' : 'transparent',
                    cursor: 'pointer',
                    fontFamily: 'Lexend, sans-serif',
                    fontSize: '14px',
                    textAlign: 'left',
                  }}
                >
                  <img
                    src={`https://flagcdn.com/w40/${country.toLowerCase()}.png`}
                    alt={country}
                    style={flagStyle}
                  />
                  <span style={{ flex: 1, color: '#374151' }}>{getCountryName(country)}</span>
                  <span style={{ color: '#737373', fontSize: '13px' }}>+{getCountryCallingCode(country)}</span>
                </button>
              ))}
          </div>
        </div>
      )}
    </div>
  );
}

export { isPossiblePhoneNumber, getCountries, getCountryCallingCode };
export type { Country };
