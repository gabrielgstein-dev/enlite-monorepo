import i18n from 'i18next';
import { initReactI18next } from 'react-i18next';
import ptBR from './locales/pt-BR.json';
import es from './locales/es.json';

const SUPPORTED = ['es', 'pt-BR'] as const;
type SupportedLng = (typeof SUPPORTED)[number];

function detectInitialLng(): SupportedLng {
  if (typeof window === 'undefined') return 'es';
  try {
    const fromQuery = new URL(window.location.href).searchParams.get('lng');
    if (fromQuery && (SUPPORTED as readonly string[]).includes(fromQuery)) {
      return fromQuery as SupportedLng;
    }
    const fromStorage = window.localStorage?.getItem('i18nextLng');
    if (fromStorage && (SUPPORTED as readonly string[]).includes(fromStorage)) {
      return fromStorage as SupportedLng;
    }
  } catch {
    // localStorage may be unavailable (SSR, sandboxed iframe). Fall back.
  }
  return 'es';
}

i18n
  .use(initReactI18next)
  .init({
    resources: {
      'pt-BR': {
        translation: ptBR,
      },
      es: {
        translation: es,
      },
    },
    lng: detectInitialLng(),
    fallbackLng: 'es',
    interpolation: {
      escapeValue: false,
    },
  });

export default i18n;
