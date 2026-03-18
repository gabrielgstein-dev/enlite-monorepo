import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/contexts/AuthContext';
import {
  useWorkerRegistrationStore,
  getWorkerStorageKey,
} from '@presentation/stores/workerRegistrationStore';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';
import { WizardContainer } from '@presentation/components/worker-registration/WizardContainer';
import { GeneralInfoStep } from '@presentation/components/worker-registration/steps/GeneralInfoStep';
import { ServiceAddressStep } from '@presentation/components/worker-registration/steps/ServiceAddressStep';
import { AvailabilityStep } from '@presentation/components/worker-registration/steps/AvailabilityStep';
import { Logo } from '@presentation/components/common/Logo';

export function WorkerRegistrationPage() {
  const navigate = useNavigate();
  const { user, isAuthenticated, isLoading: isAuthLoading } = useAuth();
  const { getProgress, initWorker } = useWorkerApi();
  const {
    currentStep,
    setMode,
    updateGeneralInfo,
    setReadonlyFields,
    hydrateFromServer,
    clearPersistedData,
  } = useWorkerRegistrationStore();

  const [isInitializing, setIsInitializing] = useState(true);
  const [initError, setInitError] = useState<string | null>(null);

  // Re-key the Zustand persist store to the current userId to prevent cross-user data leakage
  const didRekey = useRef(false);
  useEffect(() => {
    if (!user || didRekey.current) return;
    didRekey.current = true;
    const storageKey = getWorkerStorageKey(user.id);
    // Migrate data from previous anonymous key if present
    const previousRaw = localStorage.getItem('worker-registration-anonymous');
    if (previousRaw && !localStorage.getItem(storageKey)) {
      localStorage.setItem(storageKey, previousRaw);
      localStorage.removeItem('worker-registration-anonymous');
    }
  }, [user]);

  // Auth guard: redirect if not authenticated once auth has resolved
  useEffect(() => {
    if (!isAuthLoading && !isAuthenticated) {
      navigate('/login?next=/worker-registration', { replace: true });
    }
  }, [isAuthLoading, isAuthenticated, navigate]);

  // Initialise worker on mount: fetch existing progress or create new record
  useEffect(() => {
    if (isAuthLoading || !isAuthenticated || !user) return;

    let cancelled = false;

    const init = async () => {
      setIsInitializing(true);
      setInitError(null);
      setMode('self');

      try {
        // 1. Try to fetch existing progress from server (source of truth)
        const progress = await getProgress();
        if (!cancelled) {
          hydrateFromServer(progress);
          setReadonlyFields(['email', 'fullName']);
        }
      } catch {
        // Worker not found on server — create a new one
        try {
          const newWorker = await initWorker({});
          if (!cancelled) {
            hydrateFromServer(newWorker);
            // Pre-fill from Google / Firebase user data
            updateGeneralInfo({
              email: user.email,
              fullName: user.name || '',
            });
            setReadonlyFields(['email']);
          }
        } catch (err) {
          if (!cancelled) {
            setInitError(
              err instanceof Error ? err.message : 'Erro ao inicializar cadastro. Tente novamente.',
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
  }, [isAuthLoading, isAuthenticated, user?.id]);

  const renderStep = () => {
    switch (currentStep) {
      case 'general-info':
        return <GeneralInfoStep />;
      case 'service-address':
        return <ServiceAddressStep />;
      case 'availability':
        return <AvailabilityStep />;
      default:
        return <GeneralInfoStep />;
    }
  };

  // --- Skeleton / Loading state ---
  const showSkeleton = isAuthLoading || isInitializing;

  return (
    <div className="min-h-screen bg-background flex flex-col">
      {/* Navbar */}
      <nav className="flex justify-between items-center w-full max-w-[1200px] mx-auto px-4 py-8">
        <Logo className="h-[46px] w-[160.5px]" />
        <div className="flex items-center gap-7">
          <div className="flex items-center gap-2">
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M28 16.9231C28 17.7391 27.6722 18.5218 27.0888 19.0988C26.5053 19.6758 25.714 20 24.8889 20H3.11111C2.28599 20 1.49467 19.6758 0.911223 19.0988C0.327777 18.5218 0 17.7391 0 16.9231V3.07692C0 2.26087 0.327777 1.47824 0.911223 0.90121C1.49467 0.324175 2.28599 0 3.11111 0H24.8889C25.714 0 26.5053 0.324175 27.0888 0.90121C27.6722 1.47824 28 2.26087 28 3.07692V16.9231Z" fill="#75AADB"/>
              <path d="M0 6.15625H28V13.8486H0V6.15625Z" fill="#EEEEEE"/>
              <path d="M14 6.15625L14.3795 8.11625L15.4886 6.44933L15.0803 8.40317L16.7494 7.2824L15.6162 8.93394L17.5925 8.53087L15.9071 9.62702L17.8889 10.0024L15.9071 10.3778L17.5925 11.4747L15.6162 11.0709L16.7494 12.7216L15.0803 11.6009L15.4886 13.5555L14.3795 11.8886L14 13.8486L13.6205 11.8886L12.5122 13.5555L12.9197 11.6009L11.2498 12.7216L12.3831 11.0709L10.4075 11.4747L12.093 10.3778L10.1112 10.0024L12.093 9.62702L10.4075 8.53087L12.3831 8.93394L11.2498 7.2824L12.9197 8.40317L12.5122 6.44933L13.6205 8.11625L14 6.15625Z" fill="#FCBF49"/>
            </svg>
            <span className="font-lexend text-sm font-medium text-gray-800">Argentina</span>
          </div>
          <button
            onClick={() => { clearPersistedData(); navigate('/login'); }}
            className="h-10 w-[200px] border border-primary rounded-full font-poppins font-semibold text-base text-primary hover:bg-primary hover:text-white transition-colors"
          >
            Sair
          </button>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 pb-12 pt-6">
        {initError && (
          <div className="w-full max-w-[1200px] mb-6 p-4 rounded-lg bg-red-100 border border-red-400 text-red-700">
            {initError}
            <button
              onClick={() => window.location.reload()}
              className="ml-4 underline font-semibold"
            >
              Tentar novamente
            </button>
          </div>
        )}

        {showSkeleton ? (
          /* Skeleton loading state — never shows the form while auth/init is resolving */
          <div className="w-full max-w-[1200px] animate-pulse space-y-6 mt-8">
            <div className="h-8 bg-gray-200 rounded-full w-2/3 mx-auto" />
            <div className="flex gap-4 justify-center">
              {[1, 2, 3].map((i) => (
                <div key={i} className="flex items-center gap-2">
                  <div className="w-8 h-8 bg-gray-200 rounded-full" />
                  <div className="w-24 h-4 bg-gray-200 rounded" />
                </div>
              ))}
            </div>
            <div className="bg-white rounded-2xl shadow-sm p-8 space-y-4">
              {[1, 2, 3, 4].map((i) => (
                <div key={i} className="h-12 bg-gray-200 rounded-lg" />
              ))}
            </div>
          </div>
        ) : (
          <WizardContainer className="w-full">
            {renderStep()}
          </WizardContainer>
        )}
      </main>
    </div>
  );
}
