import { useState, InputHTMLAttributes } from 'react';
import { useTranslation } from 'react-i18next';

interface PasswordInputProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  error?: string;
  borderColor?: string;
}

export function PasswordInput({
  error,
  borderColor = '#D9D9D9',
  className = '',
  ...props
}: PasswordInputProps): JSX.Element {
  const { t } = useTranslation();
  const [showPassword, setShowPassword] = useState(false);
  const borderClass = error ? 'border-red-500' : `border-[${borderColor}]`;

  return (
    <div className="flex flex-col gap-1 w-full">
      <div
        className={`flex items-center min-h-[56px] px-4 rounded-[10px] border-[1.5px] border-solid ${borderClass} bg-white gap-2 focus-within:border-primary transition-colors ${className}`}
      >
        <input
          type={showPassword ? 'text' : 'password'}
          className="flex-1 w-full border-none outline-none font-lexend text-base font-medium text-gray-800 bg-transparent placeholder:text-gray-600"
          {...props}
        />
        <button
          type="button"
          onClick={() => setShowPassword(!showPassword)}
          className="flex items-center bg-none border-none p-0 cursor-pointer"
          aria-label={showPassword ? t('common.hidePassword') : t('common.showPassword')}
        >
          {showPassword ? (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M12 16.33C9.67 16.33 7.77 14.43 7.77 12.1C7.77 9.77 9.67 7.87 12 7.87C14.33 7.87 16.23 9.77 16.23 12.1C16.23 14.43 14.33 16.33 12 16.33ZM12 9.37C10.5 9.37 9.27 10.6 9.27 12.1C9.27 13.6 10.5 14.83 12 14.83C13.5 14.83 14.73 13.6 14.73 12.1C14.73 10.6 13.5 9.37 12 9.37Z" fill="#180149"/>
              <path d="M12 21.02C8.24 21.02 4.69 18.82 2.25 15C1.19 13.35 1.19 10.66 2.25 9C4.7 5.18 8.25 2.98 12 2.98C15.75 2.98 19.3 5.18 21.75 9C22.81 10.65 22.81 13.34 21.75 15C19.3 18.82 15.75 21.02 12 21.02ZM12 4.48C8.77 4.48 5.68 6.42 3.52 9.81C2.77 10.98 2.77 13.02 3.52 14.19C5.68 17.58 8.77 19.52 12 19.52C15.23 19.52 18.32 17.58 20.48 14.19C21.23 13.02 21.23 10.98 20.48 9.81C18.32 6.42 15.23 4.48 12 4.48Z" fill="#180149"/>
            </svg>
          ) : (
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M9.47 15.28C9.28 15.28 9.09 15.21 8.94 15.06C8.12 14.24 7.67 13.15 7.67 12C7.67 9.61 9.61 7.67 12 7.67C13.15 7.67 14.24 8.12 15.06 8.94C15.2 9.08 15.28 9.27 15.28 9.47C15.28 9.67 15.2 9.86 15.06 10L10 15.06C9.85 15.21 9.66 15.28 9.47 15.28ZM12 9.17C10.44 9.17 9.17 10.44 9.17 12C9.17 12.5 9.3 12.98 9.54 13.4L13.4 9.54C12.98 9.3 12.5 9.17 12 9.17Z" fill="#180149"/>
              <path d="M5.6 18.51C5.43 18.51 5.25 18.45 5.11 18.33C4.04 17.42 3.08 16.3 2.26 15C1.2 13.35 1.2 10.66 2.26 9C4.7 5.18 8.25 2.98 12 2.98C14.2 2.98 16.37 3.74 18.27 5.17C18.6 5.42 18.67 5.89 18.42 6.22C18.17 6.55 17.7 6.62 17.37 6.37C15.73 5.13 13.87 4.48 12 4.48C8.77 4.48 5.68 6.42 3.52 9.81C2.77 10.98 2.77 13.02 3.52 14.19C4.27 15.36 5.13 16.37 6.08 17.19C6.39 17.46 6.43 17.93 6.16 18.25C6.02 18.42 5.81 18.51 5.6 18.51Z" fill="#180149"/>
              <path d="M12 21.02C10.67 21.02 9.37 20.75 8.12 20.22C7.74 20.06 7.56 19.62 7.72 19.24C7.88 18.86 8.32 18.68 8.7 18.84C9.76 19.29 10.87 19.52 11.99 19.52C15.22 19.52 18.31 17.58 20.47 14.19C21.22 13.02 21.22 10.98 20.47 9.81C20.16 9.32 19.82 8.85 19.46 8.41C19.2 8.09 19.25 7.62 19.57 7.35C19.89 7.09 20.36 7.13 20.63 7.46C21.02 7.94 21.4 8.46 21.74 9C22.8 10.65 22.8 13.34 21.74 15C19.3 18.82 15.75 21.02 12 21.02Z" fill="#180149"/>
              <path d="M2 22.75C1.81 22.75 1.62 22.68 1.47 22.53C1.18 22.24 1.18 21.76 1.47 21.47L8.94 13.999C9.23 13.71 9.71 13.71 10 13.999C10.29 14.29 10.29 14.77 10 15.06L2.53 22.53C2.38 22.68 2.19 22.75 2 22.75Z" fill="#180149"/>
              <path d="M14.53 10.22C14.34 10.22 14.15 10.15 14 10C13.71 9.71 13.71 9.23 14 8.94L21.47 1.47C21.76 1.18 22.24 1.18 22.53 1.47C22.82 1.76 22.82 2.24 22.53 2.53L15.06 10C14.91 10.15 14.72 10.22 14.53 10.22Z" fill="#180149"/>
            </svg>
          )}
        </button>
      </div>
      {error && <span className="text-red-500 text-xs">{error}</span>}
    </div>
  );
}
