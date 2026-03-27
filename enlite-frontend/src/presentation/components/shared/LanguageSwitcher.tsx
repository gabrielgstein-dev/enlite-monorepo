import { useTranslation } from 'react-i18next';

export function LanguageSwitcher() {
  const { i18n } = useTranslation();

  const changeLanguage = (lng: string) => {
    i18n.changeLanguage(lng);
  };

  return (
    <div className="flex items-center gap-2">
      <button
        onClick={() => changeLanguage('pt-BR')}
        className={`px-3 py-1 rounded ${
          i18n.language === 'pt-BR'
            ? 'bg-[#180149] text-white'
            : 'bg-gray-200 text-gray-700'
        }`}
      >
        PT
      </button>
      <button
        onClick={() => changeLanguage('es')}
        className={`px-3 py-1 rounded ${
          i18n.language === 'es'
            ? 'bg-[#180149] text-white'
            : 'bg-gray-200 text-gray-700'
        }`}
      >
        ES
      </button>
    </div>
  );
}
