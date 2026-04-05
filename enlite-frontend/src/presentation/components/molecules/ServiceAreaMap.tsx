import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { MapPin } from 'lucide-react';

interface ServiceAreaMapProps {
  lat: number;
  lng: number;
  className?: string;
}

function isValidCoordinates(lat: number, lng: number): boolean {
  return lat !== 0 || lng !== 0;
}

/**
 * Renders a Google Maps embed with a Marker at the given coordinates.
 * Uses the same Google Maps script loaded by GooglePlacesAutocomplete.
 * Shows a placeholder when coordinates are invalid (0,0 or uninitialised).
 */
export function ServiceAreaMap({ lat, lng, className = '' }: ServiceAreaMapProps): JSX.Element {
  const { t } = useTranslation();
  const mapDivRef = useRef<HTMLDivElement>(null);
  const mapInstanceRef = useRef<google.maps.Map | null>(null);
  const markerRef = useRef<google.maps.Marker | null>(null);

  const valid = isValidCoordinates(lat, lng);

  useEffect(() => {
    if (!valid) return;

    const initMap = (): void => {
      if (!mapDivRef.current) return;
      if (typeof google === 'undefined' || !google.maps) return;

      const position = { lat, lng };

      if (!mapInstanceRef.current) {
        mapInstanceRef.current = new google.maps.Map(mapDivRef.current, {
          center: position,
          zoom: 15,
          disableDefaultUI: true,
          zoomControl: true,
          mapTypeControl: false,
          streetViewControl: false,
          fullscreenControl: false,
        });

        markerRef.current = new google.maps.Marker({
          position,
          map: mapInstanceRef.current,
        });
      } else {
        mapInstanceRef.current.setCenter(position);
        markerRef.current?.setPosition(position);
      }
    };

    // Google Maps may already be loaded (by GooglePlacesAutocomplete)
    if (typeof google !== 'undefined' && google.maps) {
      initMap();
    } else {
      // Wait for the script to load
      const existingScript = document.querySelector('script[src*="maps.googleapis.com"]');
      if (existingScript) {
        existingScript.addEventListener('load', initMap);
        return () => existingScript.removeEventListener('load', initMap);
      }
    }
  }, [lat, lng, valid]);

  if (!valid) {
    return (
      <div
        className={`flex flex-col items-center justify-center gap-2 w-full rounded-[10px] bg-gray-100 border border-dashed border-gray-300 ${className}`}
        style={{ height: 300 }}
        data-testid="service-area-map-placeholder"
      >
        <MapPin size={32} className="text-gray-400" />
        <span className="font-lexend text-sm text-gray-500 text-center px-4">
          {t('workerRegistration.serviceAddress.mapPlaceholder')}
        </span>
      </div>
    );
  }

  return (
    <div
      ref={mapDivRef}
      className={`w-full rounded-[10px] overflow-hidden ${className}`}
      style={{ height: 300 }}
      data-testid="service-area-map"
    />
  );
}
