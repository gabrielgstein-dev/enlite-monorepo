import { ReactNode } from 'react';
import { CountrySelector } from '../CountrySelector';

interface AuthNavbarProps {
  logoSrc?: string;
  logoAlt?: string;
  actions?: ReactNode;
  className?: string;
}

export function AuthNavbar({
  logoSrc = 'https://api.builder.io/api/v1/image/assets/TEMP/c445edca8ca03c56e63b003771e642c659b162b4?width=321',
  logoAlt = 'Enlite Health Solutions',
  actions,
  className = '',
}: AuthNavbarProps): JSX.Element {
  return (
    <nav className={`flex justify-between items-center w-full max-w-[1200px] mx-auto ${className}`}>
      <img
        src={logoSrc}
        alt={logoAlt}
        className="w-[120px] sm:w-[140px] md:w-[160px] h-auto"
      />
      <div className="flex items-center gap-3 sm:gap-5 md:gap-7">
        <CountrySelector />
        {actions}
      </div>
    </nav>
  );
}
