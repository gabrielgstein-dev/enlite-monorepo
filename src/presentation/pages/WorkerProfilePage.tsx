import { useState, useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useAuth } from '@presentation/hooks/useAuth';
import {
  useWorkerRegistrationStore,
  getWorkerStorageKey,
} from '@presentation/stores/workerRegistrationStore';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { AppLayout } from '@presentation/components/templates/DashboardLayout';
import { useWorkerNavItems } from '@presentation/config/workerNavigation';
import { GeneralInfoTab } from './tabs/GeneralInfoTab';
import { ServiceAddressTab } from './tabs/ServiceAddressTab';
import { AvailabilityTab } from './tabs/AvailabilityTab';
import { DocumentsTab } from './tabs/DocumentsTab';
import { Typography } from '@presentation/components/atoms';

type TabId = 'general' | 'address' | 'availability' | 'documents';

export function WorkerProfilePage(): JSX.Element {
  const { t } = useTranslation();
  const { user } = useAuth();
  const navItems = useWorkerNavItems();
  const { getProgress, initWorker } = useWorkerApi();
  
  // Use individual selectors to prevent re-renders
  const setMode = useWorkerRegistrationStore((state) => state.setMode);
  const updateGeneralInfo = useWorkerRegistrationStore((state) => state.updateGeneralInfo);
  const setReadonlyFields = useWorkerRegistrationStore((state) => state.setReadonlyFields);
  const hydrateFromServer = useWorkerRegistrationStore((state) => state.hydrateFromServer);

  const [activeTab, setActiveTab] = useState<TabId>('general');
  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  const didRekey = useRef(false);
  useEffect(() => {
    if (!user || didRekey.current) return;
    didRekey.current = true;
    const storageKey = getWorkerStorageKey(user.id);
    const previousRaw = localStorage.getItem('worker-registration-anonymous');
    if (previousRaw && !localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, previousRaw);
      localStorage.removeItem('worker-registration-anonymous');
    }
  }, [user]);

  useEffect(() => {
    if (!user?.id) return;

    let cancelled = false;

    const init = async () => {
      setIsInitializing(true);
      setInitError(null);
      setMode('self');

      try {
        const progress = await getProgress();
        if (!cancelled) {
          hydrateFromServer(progress);
          setReadonlyFields(['email', 'fullName']);
        }
      } catch {
        try {
          const newWorker = await initWorker({});
          if (!cancelled) {
            hydrateFromServer(newWorker);
            updateGeneralInfo({
              email: user.email,
              fullName: user.name || '',
            });
            setReadonlyFields(['email']);
          }
        } catch (err) {
          if (!cancelled) {
            setInitError(
              err instanceof Error ? err.message : t('workerRegistration.errorInit'),
            );
          }
        }
      } finally {
        if (!cancelled) setIsInitializing(false);
      }
    };

    init();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user?.id]);

  const tabs: { id: TabId; label: string }[] = [
    { id: 'general', label: t('profile.tabs.general', 'Informações Gerais') },
    { id: 'address', label: t('profile.tabs.address', 'Endereço de Atendimento') },
    { id: 'availability', label: t('profile.tabs.availability', 'Disponibilidade') },
    { id: 'documents', label: t('profile.tabs.documents', 'Documentos') },
  ];

  const renderTabContent = () => {
    switch (activeTab) {
      case 'general':
        return <GeneralInfoTab />;
      case 'address':
        return <ServiceAddressTab />;
      case 'availability':
        return <AvailabilityTab />;
      case 'documents':
        return <DocumentsTab />;
      default:
        return <GeneralInfoTab />;
    }
  };

  return (
    <AppLayout navItems={navItems} userName={user?.name || t('common.userFallback')}>
      <div className="max-w-4xl mx-auto">
        <h1 className="text-2xl font-poppins font-semibold text-gray-900 mb-6">
          {t('profile.title', 'Meu Perfil')}
        </h1>

        {initError && (
          <div className="mb-6 p-4 rounded-lg bg-red-100 border border-red-400 text-red-700">
            {initError}
            <button
              onClick={() => window.location.reload()}
              className="ml-4 underline font-semibold"
            >
              {t('workerRegistration.retry')}
            </button>
          </div>
        )}

        {isInitializing ? (
          <div className="animate-pulse space-y-4">
            <div className="h-10 bg-gray-200 rounded-lg w-full" />
            <div className="h-64 bg-gray-200 rounded-lg w-full" />
          </div>
        ) : (
          <>
            {/* Tabs Navigation */}
            <div className="border-b border-gray-200 mb-6">
              <nav className="flex space-x-8" aria-label="Tabs">
                {tabs.map((tab) => {
                  const isActive = activeTab === tab.id;
                  return (
                    <button
                      key={tab.id}
                      onClick={() => setActiveTab(tab.id)}
                      className={`
                        py-4 px-1 border-b-2 whitespace-nowrap transition-colors
                        ${isActive
                          ? 'border-primary'
                          : 'border-transparent hover:border-gray-300'
                        }
                      `}
                      aria-current={isActive ? 'page' : undefined}
                    >
                      <Typography
                        variant="body"
                        weight="medium"
                        color={isActive ? 'primary' : 'secondary'}
                      >
                        {tab.label}
                      </Typography>
                    </button>
                  );
                })}
              </nav>
            </div>

            {/* Tab Content */}
            <div className="bg-white rounded-lg shadow-sm p-6">
              {renderTabContent()}
            </div>
          </>
        )}
      </div>
    </AppLayout>
  );
}
