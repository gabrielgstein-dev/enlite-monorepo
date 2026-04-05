import { useTranslation } from 'react-i18next';

export type VacancyTab = 'encuadres' | 'talentum' | 'links';

interface VacancyDetailTabsProps {
  activeTab: VacancyTab;
  onTabChange: (tab: VacancyTab) => void;
}

const TABS: VacancyTab[] = ['encuadres', 'talentum', 'links'];

const TAB_I18N_KEYS: Record<VacancyTab, string> = {
  encuadres: 'admin.vacancyDetail.tabs.encuadres',
  talentum: 'admin.vacancyDetail.tabs.talentum',
  links: 'admin.vacancyDetail.tabs.links',
};

export function VacancyDetailTabs({ activeTab, onTabChange }: VacancyDetailTabsProps) {
  const { t } = useTranslation();

  return (
    <div className="flex items-center gap-8 flex-wrap">
      {TABS.map((tab) => (
        <button
          key={tab}
          onClick={() => onTabChange(tab)}
          className={`
            px-5 py-2 rounded-card font-lexend text-base font-medium transition-all whitespace-nowrap
            ${
              activeTab === tab
                ? 'bg-primary text-white shadow-[0px_4px_20px_0px_rgba(0,0,0,0.4)]'
                : 'text-gray-800 hover:text-primary'
            }
          `}
        >
          {t(TAB_I18N_KEYS[tab])}
        </button>
      ))}
    </div>
  );
}
