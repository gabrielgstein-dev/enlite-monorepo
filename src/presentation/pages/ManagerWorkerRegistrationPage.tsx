import { useState, useEffect } from 'react';
import { useTranslation } from 'react-i18next';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';
import { WizardContainer } from '@presentation/components/worker-registration/WizardContainer';
import { GeneralInfoStep } from '@presentation/components/worker-registration/steps/GeneralInfoStep';
import { ServiceAddressStep } from '@presentation/components/worker-registration/steps/ServiceAddressStep';
import { AvailabilityStep } from '@presentation/components/worker-registration/steps/AvailabilityStep';
import { WorkerSearchAutocomplete } from '@presentation/components/worker-registration/WorkerSearchAutocomplete';

interface Worker {
  id: string;
  email: string;
  fullName: string;
  phone: string;
  cpf?: string;
  birthDate?: string;
}

export function ManagerWorkerRegistrationPage() {
  const { t } = useTranslation();
  const { 
    currentStep, 
    setMode, 
    setCurrentStep, 
    updateGeneralInfo, 
    setReadonlyFields 
  } = useWorkerRegistrationStore();
  
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [submitError] = useState<string | null>(null);

  useEffect(() => {
    setMode('manager');
    setCurrentStep('general-info');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const handleWorkerSelect = (worker: Worker | null) => {
    setSelectedWorker(worker);
    
    if (worker) {
      updateGeneralInfo({
        email: worker.email,
        fullName: worker.fullName,
        phone: worker.phone,
        cpf: worker.cpf || '',
        birthDate: worker.birthDate || '',
      });
      
      setReadonlyFields(['email', 'fullName', 'phone', 'cpf', 'birthDate']);
    } else {
      setReadonlyFields([]);
    }
  };

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

  return (
    <div className="min-h-screen bg-[#FFF9FC] flex flex-col">
      {/* Navbar */}
      <nav className="flex justify-between items-center w-full max-w-[1200px] mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <img
          src="https://api.builder.io/api/v1/image/assets/TEMP/c445edca8ca03c56e63b003771e642c659b162b4?width=321"
          alt="Enlite Health Solutions"
          className="w-[120px] sm:w-[140px] md:w-[160px] h-auto"
        />
        <div className="flex items-center gap-3 sm:gap-5 md:gap-7">
          <div className="flex items-center gap-2">
            <svg width="28" height="20" viewBox="0 0 28 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M28 16.9231C28 17.7391 27.6722 18.5218 27.0888 19.0988C26.5053 19.6758 25.714 20 24.8889 20H3.11111C2.28599 20 1.49467 19.6758 0.911223 19.0988C0.327777 18.5218 0 17.7391 0 16.9231V3.07692C0 2.26087 0.327777 1.47824 0.911223 0.90121C1.49467 0.324175 2.28599 0 3.11111 0H24.8889C25.714 0 26.5053 0.324175 27.0888 0.90121C27.6722 1.47824 28 2.26087 28 3.07692V16.9231Z" fill="#75AADB"/>
              <path d="M0 6.15625H28V13.8486H0V6.15625Z" fill="#EEEEEE"/>
              <path d="M14 6.15625L14.3795 8.11625L15.4886 6.44933L15.0803 8.40317L16.7494 7.2824L15.6162 8.93394L17.5925 8.53087L15.9071 9.62702L17.8889 10.0024L15.9071 10.3778L17.5925 11.4747L15.6162 11.0709L16.7494 12.7216L15.0803 11.6009L15.4886 13.5555L14.3795 11.8886L14 13.8486L13.6205 11.8886L12.5122 13.5555L12.9197 11.6009L11.2498 12.7216L12.3831 11.0709L10.4075 11.4747L12.093 10.3778L10.1112 10.0024L12.093 9.62702L10.4075 8.53087L12.3831 8.93394L11.2498 7.2824L12.9197 8.40317L12.5122 6.44933L13.6205 8.11625L14 6.15625Z" fill="#FCBF49"/>
            </svg>
            <span className="hidden sm:block font-lexend text-sm font-medium text-[#737373]">
              {t('common.country')}
            </span>
          </div>
        </div>
      </nav>

      {/* Main Content */}
      <main className="flex-1 flex flex-col items-center px-4 sm:px-6 lg:px-8 pb-12">
        {submitError && (
          <div className="w-full max-w-[1200px] mb-6 p-4 rounded-lg bg-red-100 border border-red-400 text-red-700">
            {submitError}
          </div>
        )}

        <div className="w-full max-w-[1200px] mb-8">
          <h1 className="font-poppins text-3xl font-bold text-[#180149] mb-2">
            Registro de Worker - Gestor
          </h1>
          <p className="font-lexend text-base text-[#737373]">
            Busque um worker existente ou preencha os dados para criar um novo registro
          </p>
        </div>

        <div className="w-full max-w-[1200px] mb-8">
          <WorkerSearchAutocomplete 
            onWorkerSelect={handleWorkerSelect}
            selectedWorker={selectedWorker}
          />
        </div>

        <WizardContainer className="w-full">
          {renderStep()}
        </WizardContainer>
      </main>
    </div>
  );
}
