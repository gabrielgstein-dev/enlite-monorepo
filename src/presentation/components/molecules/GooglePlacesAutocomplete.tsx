import { useEffect, useRef, forwardRef, useImperativeHandle, useState } from 'react';
import { AlertCircle } from 'lucide-react';

interface GooglePlacesAutocompleteProps extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange'> {
  label: string;
  error?: string;
  containerClassName?: string;
  onPlaceSelected?: (place: google.maps.places.PlaceResult) => void;
  onChange?: (value: string) => void;
  onValidationChange?: (isValid: boolean) => void;
  value?: string;
  requireSelection?: boolean;
}

export const GooglePlacesAutocomplete = forwardRef<HTMLInputElement, GooglePlacesAutocompleteProps>(
  ({ label, error, containerClassName = '', className = '', onPlaceSelected, onChange, onValidationChange, value, requireSelection = true, ...props }, ref) => {
    const inputRef = useRef<HTMLInputElement>(null);
    const autocompleteRef = useRef<google.maps.places.Autocomplete | null>(null);
    const [inputValue, setInputValue] = useState(value || '');
    const [apiError, setApiError] = useState<string | null>(null);
    const [placeSelected, setPlaceSelected] = useState(!!value); // Se tem valor inicial, considera selecionado
    const [showValidationError, setShowValidationError] = useState(false);

    useImperativeHandle(ref, () => inputRef.current as HTMLInputElement);

    useEffect(() => {
      if (value !== undefined) {
        setInputValue(value);
      }
    }, [value]);

    useEffect(() => {
      const loadGoogleMapsScript = (): Promise<void> => {
        return new Promise((resolve, reject) => {
          if (typeof google !== 'undefined' && google.maps && google.maps.places && google.maps.places.Autocomplete) {
            resolve();
            return;
          }

          const apiKey = import.meta.env.VITE_GOOGLE_MAPS_API_KEY;
          if (!apiKey) {
            console.error('Google Maps API key not found in environment variables');
            reject(new Error('Google Maps API key not configured'));
            return;
          }

          // Check if script is already loading
          const existingScript = document.querySelector(`script[src*="maps.googleapis.com"]`);
          if (existingScript) {
            // Wait for existing script to load
            existingScript.addEventListener('load', () => {
              // Give it a moment to initialize
              setTimeout(() => resolve(), 100);
            });
            existingScript.addEventListener('error', () => reject(new Error('Failed to load Google Maps script')));
            return;
          }

          const script = document.createElement('script');
          script.src = `https://maps.googleapis.com/maps/api/js?key=${apiKey}&libraries=places&language=es`;
          script.async = true;
          script.defer = true;
          script.onload = () => {
            // Give the API a moment to fully initialize
            setTimeout(() => resolve(), 100);
          };
          script.onerror = () => reject(new Error('Failed to load Google Maps script'));
          document.head.appendChild(script);
        });
      };

      const initAutocomplete = async (): Promise<void> => {
        try {
          await loadGoogleMapsScript();

          if (!inputRef.current) return;

          // Verify that Google Maps Places API is fully available
          if (typeof google === 'undefined' || !google.maps || !google.maps.places || !google.maps.places.Autocomplete) {
            throw new Error('Google Maps Places API not fully loaded');
          }

          autocompleteRef.current = new google.maps.places.Autocomplete(inputRef.current, {
            types: ['address'],
            componentRestrictions: { country: ['ar', 'br', 'cl', 'co', 'mx', 'pe', 'uy'] },
            fields: ['formatted_address', 'geometry', 'address_components', 'name'],
          });

          autocompleteRef.current.addListener('place_changed', () => {
            const place = autocompleteRef.current?.getPlace();
            if (place && place.formatted_address) {
              setInputValue(place.formatted_address);
              setPlaceSelected(true);
              setShowValidationError(false);
              onChange?.(place.formatted_address);
              onPlaceSelected?.(place);
              onValidationChange?.(true);
            }
          });

          setApiError(null);
        } catch (error) {
          const errorMessage = error instanceof Error ? error.message : 'Unknown error';
          console.error('Error initializing Google Places Autocomplete:', error);
          
          if (errorMessage.includes('API key') || errorMessage.includes('not configured')) {
            setApiError('Google Maps API key não configurada. Usando campo de texto livre.');
          } else if (errorMessage.includes('not fully loaded')) {
            setApiError('Aguardando Google Maps carregar...');
            // Retry after a delay
            setTimeout(() => initAutocomplete(), 1000);
          } else {
            setApiError('Erro ao carregar Google Places. Usando campo de texto livre.');
          }
        }
      };

      initAutocomplete();

      return () => {
        if (autocompleteRef.current) {
          google.maps.event.clearInstanceListeners(autocompleteRef.current);
        }
      };
    }, [onPlaceSelected, onChange, onValidationChange]);

    const handleInputChange = (e: React.ChangeEvent<HTMLInputElement>): void => {
      const newValue = e.target.value;
      setInputValue(newValue);
      
      // If user is typing, mark as not selected from autocomplete
      if (placeSelected) {
        setPlaceSelected(false);
        onValidationChange?.(false);
      }
      
      onChange?.(newValue);
    };

    const handleBlur = (): void => {
      // Show validation error if field has value but no place was selected
      if (requireSelection && inputValue && !placeSelected) {
        setShowValidationError(true);
        onValidationChange?.(false);
      }
    };

    return (
      <div className={`flex flex-col items-start gap-1 relative ${containerClassName}`}>
        <label className="relative w-fit mt-[-1.00px] font-lexend font-semibold text-[#374151] text-[16px] leading-[150%] whitespace-nowrap">
          {label}
        </label>
        <div className={`relative self-stretch w-full h-12 rounded-[10px] overflow-hidden border-[1.5px] border-solid transition-colors ${error || showValidationError ? 'border-red-500' : 'border-[#4B5563] focus-within:border-primary'}`}>
          <input
            ref={inputRef}
            value={inputValue}
            onChange={handleInputChange}
            onBlur={handleBlur}
            className={`absolute top-0 left-0 w-full h-full px-4 font-lexend font-medium text-[#374151] text-[14px] leading-[150%] bg-transparent outline-none placeholder:text-[#9CA3AF] ${className}`}
            {...props}
          />
        </div>
        {apiError && (
          <div className="flex items-center gap-1 mt-1 text-amber-600 text-xs">
            <AlertCircle size={12} />
            <span>{apiError}</span>
          </div>
        )}
        {showValidationError && !error && (
          <span className="absolute -bottom-5 text-red-500 text-xs">
            Por favor, selecione um endereço da lista de sugestões
          </span>
        )}
        {error && <span className="absolute -bottom-5 text-red-500 text-xs">{error}</span>}
      </div>
    );
  }
);

GooglePlacesAutocomplete.displayName = 'GooglePlacesAutocomplete';
