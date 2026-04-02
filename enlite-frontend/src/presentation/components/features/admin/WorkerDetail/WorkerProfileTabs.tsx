import { useTranslation } from 'react-i18next';

export type WorkerTab = 'encuadres' | 'documents' | 'availability' | 'financial' | 'history';

interface WorkerProfileTabsProps {
  activeTab: WorkerTab;
  onTabChange: (tab: WorkerTab) => void;
}

const TABS: WorkerTab[] = ['encuadres', 'documents', 'availability', 'financial', 'history'];

const TAB_I18N_KEYS: Record<WorkerTab, string> = {
  encuadres: 'admin.workerDetail.tabs.encuadres',
  documents: 'admin.workerDetail.tabs.documents',
  availability: 'admin.workerDetail.tabs.availability',
  financial: 'admin.workerDetail.tabs.financial',
  history: 'admin.workerDetail.tabs.history',
};

export function WorkerProfileTabs({ activeTab, onTabChange }: WorkerProfileTabsProps) {
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
