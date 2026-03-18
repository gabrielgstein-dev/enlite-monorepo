import { useTranslation } from 'react-i18next';
import { useWorkerRegistrationStore } from '@presentation/stores/workerRegistrationStore';

interface WizardNavigationProps {
  onSubmit?: () => void;
  isSubmitting?: boolean;
  isCurrentStepValid?: boolean;
}

export function WizardNavigation({ 
  onSubmit, 
  isSubmitting = false,
  isCurrentStepValid = true 
}: WizardNavigationProps) {
  const { t } = useTranslation();
  const { 
    currentStepIndex, 
    goToNextStep, 
    goToPreviousStep
  } = useWorkerRegistrationStore();

  const isFirstStep = currentStepIndex === 0;
  const isLastStep = currentStepIndex === 3;

  const handleNext = () => {
    if (isLastStep && onSubmit) {
      onSubmit();
    } else {
      goToNextStep();
    }
  };

  return (
    <div className={`flex flex-col sm:flex-row items-center w-full max-w-[1200px] mt-8 md:mt-12 mb-8 gap-4 sm:gap-0 px-4 md:px-6 lg:px-0 ${isFirstStep ? 'justify-center' : 'justify-between'}`}>
      {/* Back Button - Hidden on first step */}
      {!isFirstStep && (
        <button
          onClick={goToPreviousStep}
          className="flex items-center justify-center gap-2 md:gap-3 w-full sm:w-[300px] md:w-[400px] h-14 md:h-16 rounded-[1000px] font-poppins font-semibold text-lg md:text-2xl transition-all duration-200 text-white bg-[#180149] hover:bg-[#2a0269] cursor-pointer"
        >
          <svg width="14" height="20" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
            <path d="M12 18L4 10L12 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
          </svg>
          {t('workerRegistration.navigation.back')}
        </button>
      )}

      {/* Next/Submit Button */}
      <button
        onClick={handleNext}
        disabled={!isCurrentStepValid || isSubmitting}
        className={`
          flex items-center justify-center gap-2 md:gap-3 w-full sm:w-[300px] md:w-[400px] h-14 md:h-16
          rounded-[1000px] font-poppins font-semibold text-lg md:text-2xl
          transition-all duration-200
          ${!isCurrentStepValid || isSubmitting
            ? 'opacity-40 cursor-not-allowed bg-[#D9D9D9] text-[#737373]'
            : 'bg-[#180149] text-white hover:bg-[#2a0269] cursor-pointer'
          }
        `}
      >
        {isSubmitting ? (
          <>
            <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"/>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z"/>
            </svg>
            {t('workerRegistration.navigation.saving')}
          </>
        ) : (
          <>
            {t('workerRegistration.navigation.next')}
            <svg width="14" height="20" viewBox="0 0 14 20" fill="none" xmlns="http://www.w3.org/2000/svg">
              <path d="M2 2L10 10L2 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </>
        )}
      </button>
    </div>
  );
}
