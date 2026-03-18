import { useTranslation } from 'react-i18next';
import { 
  WorkerRegistrationStep, 
  WORKER_REGISTRATION_STEPS,
  useWorkerRegistrationStore 
} from '@presentation/stores/workerRegistrationStore';

interface StepperProps {
  className?: string;
}

const STEP_ICONS: Record<WorkerRegistrationStep, (isActive: boolean) => JSX.Element> = {
  'general-info': (isActive) => (
    <div className={`w-9 h-9 md:w-[42px] md:h-[42px] rounded-[10px] flex items-center justify-center flex-shrink-0 relative ${isActive ? 'bg-[#180149]' : 'bg-[#e5e5e5]'}`}>
      <svg className="w-5 h-5 md:w-[22px] md:h-[22px]" viewBox="0 0 42 42" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path d="M10 32V29.5556C10 28.2589 10.5151 27.0154 11.4319 26.0986C12.3488 25.1817 13.5923 24.6667 14.8889 24.6667H19.7778C21.0744 24.6667 22.3179 25.1817 23.2347 26.0986C24.1516 27.0154 24.6667 28.2589 24.6667 29.5556V32M25.8889 10.1589C26.9405 10.4281 27.8726 11.0397 28.5382 11.8973C29.2038 12.7548 29.5651 13.8095 29.5651 14.895C29.5651 15.9805 29.2038 17.0352 28.5382 17.8927C27.8726 18.7503 26.9405 19.3619 25.8889 19.6311M32 32V29.5556C31.9938 28.4765 31.6308 27.4299 30.9675 26.5787C30.3043 25.7276 29.3781 25.1197 28.3333 24.85M12.4444 14.8889C12.4444 16.1855 12.9595 17.429 13.8764 18.3459C14.7932 19.2627 16.0367 19.7778 17.3333 19.7778C18.6299 19.7778 19.8735 19.2627 20.7903 18.3459C21.7071 17.429 22.2222 16.1855 22.2222 14.8889C22.2222 13.5923 21.7071 12.3488 20.7903 11.4319C19.8735 10.5151 18.6299 10 17.3333 10C16.0367 10 14.7932 10.5151 13.8764 11.4319C12.9595 12.3488 12.4444 13.5923 12.4444 14.8889Z" stroke={isActive ? 'white' : '#737373'} strokeWidth="2.16667" strokeLinecap="round" strokeLinejoin="round"/>
      </svg>
    </div>
  ),
  'service-address': (isActive) => (
    <div className={`w-9 h-9 md:w-[42px] md:h-[42px] rounded-[10px] flex items-center justify-center flex-shrink-0 relative ${isActive ? 'bg-[#180149]' : 'bg-[#e5e5e5]'}`}>
      <svg className="w-4 h-5 md:w-5 md:h-[22px]" viewBox="0 0 20 22" fill="none" xmlns="http://www.w3.org/2000/svg">
        <path fillRule="evenodd" clipRule="evenodd" d="M10 0C12.6522 0 15.1957 1.0344 17.0711 2.87564C18.9464 4.71688 20 7.21414 20 9.81805C20 13.1715 18.1378 15.9161 16.1756 17.8852C15.1952 18.8584 14.1255 19.7406 12.98 20.5208L12.5067 20.8372L12.2844 20.9823L11.8656 21.2441L11.4922 21.4677L11.03 21.7317C10.7163 21.9075 10.3613 22 10 22C9.63875 22 9.28374 21.9075 8.97 21.7317L8.50778 21.4677L7.93 21.1186L7.71667 20.9823L7.26111 20.6844C6.02537 19.8636 4.87434 18.926 3.82444 17.8852C1.86222 15.9151 0 13.1715 0 9.81805C0 7.21414 1.05357 4.71688 2.92893 2.87564C4.8043 1.0344 7.34784 0 10 0ZM10 2.18179C7.93721 2.18179 5.9589 2.98632 4.50028 4.4184C3.04166 5.85047 2.22222 7.79279 2.22222 9.81805C2.22222 12.3511 3.63556 14.5743 5.41222 16.3591C6.17615 17.1183 7.00184 17.8151 7.88111 18.4427L8.39 18.7983C8.55444 18.911 8.71259 19.0157 8.86444 19.1125L9.29778 19.3852L9.67889 19.6132L10 19.7975L10.5056 19.5041L10.9133 19.2532C11.1304 19.1179 11.3626 18.9663 11.61 18.7983L12.1189 18.4427C12.9982 17.8151 13.8239 17.1183 14.5878 16.3591C16.3644 14.5754 17.7778 12.3511 17.7778 9.81805C17.7778 7.79279 16.9583 5.85047 15.4997 4.4184C14.0411 2.98632 12.0628 2.18179 10 2.18179ZM10 5.45447C11.1787 5.45447 12.3092 5.9142 13.1427 6.73253C13.9762 7.55086 14.4444 8.66076 14.4444 9.81805C14.4444 10.9753 13.9762 12.0852 13.1427 12.9036C12.3092 13.7219 11.1787 14.1816 10 14.1816C8.82126 14.1816 7.6908 13.7219 6.8573 12.9036C6.02381 12.0852 5.55556 10.9753 5.55556 9.81805C5.55556 8.66076 6.02381 7.55086 6.8573 6.73253C7.6908 5.9142 8.82126 5.45447 10 5.45447ZM10 7.63626C9.41063 7.63626 8.8454 7.86613 8.42865 8.27529C8.0119 8.68446 7.77778 9.2394 7.77778 9.81805C7.77778 10.3967 8.0119 10.9516 8.42865 11.3608C8.8454 11.77 9.41063 11.9998 10 11.9998C10.5894 11.9998 11.1546 11.77 11.5713 11.3608C11.9881 10.9516 12.2222 10.3967 12.2222 9.81805C12.2222 9.2394 11.9881 8.68446 11.5713 8.27529C11.1546 7.86613 10.5894 7.63626 10 7.63626Z" fill={isActive ? 'white' : '#737373'} />
      </svg>
    </div>
  ),
  'availability': (isActive) => (
    <div className={`w-9 h-9 md:w-[42px] md:h-[42px] rounded-[10px] flex items-center justify-center flex-shrink-0 relative ${isActive ? 'bg-[#180149]' : 'bg-[#e5e5e5]'}`}>
      <div className="w-5 h-5 md:w-[23px] md:h-[23px] relative flex items-center justify-center">
        <svg width="23" height="23" viewBox="0 0 23 23" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute">
          <path d="M11.1992 0.0996094C17.3224 0.0996094 22.2988 5.07609 22.2988 11.1992C22.2988 17.3224 17.3224 22.2988 11.1992 22.2988C5.07608 22.2988 0.0996109 17.3224 0.0996094 11.1992C0.0996094 5.07609 5.07608 0.0996099 11.1992 0.0996094ZM11.1992 1.83398C6.03584 1.83398 1.83398 6.03584 1.83398 11.1992C1.83399 16.3626 6.03584 20.5645 11.1992 20.5645C16.3626 20.5645 20.5645 16.3626 20.5645 11.1992C20.5645 6.03584 16.3626 1.83398 11.1992 1.83398Z" fill={isActive ? 'white' : '#737373'} stroke={isActive ? 'white' : '#737373'} strokeWidth="0.2" />
        </svg>
        <svg width="7" height="10" viewBox="0 0 7 10" fill="none" xmlns="http://www.w3.org/2000/svg" className="absolute" style={{ top: '5.6px', left: '9.8px' }}>
          <path d="M0.966797 0.0996094C1.4415 0.0996845 1.83398 0.492079 1.83398 0.966797V5.16211C1.83401 5.32261 1.90305 5.53327 2.01465 5.72949C2.1263 5.92565 2.27082 6.09112 2.4082 6.1709H2.40918L5.58008 8.06348C5.99832 8.30745 6.12399 8.84015 5.88281 9.25391L5.88086 9.25684C5.70917 9.53144 5.42125 9.68262 5.13086 9.68262C4.9835 9.68255 4.83218 9.64819 4.69141 9.55566L1.51953 7.66309C0.701371 7.17432 0.0996523 6.1079 0.0996094 5.16211V0.966797C0.0996094 0.492034 0.492033 0.0996094 0.966797 0.0996094Z" fill={isActive ? 'white' : '#737373'} stroke={isActive ? 'white' : '#737373'} strokeWidth="0.2" />
        </svg>
      </div>
    </div>
  ),
};

export function Stepper({ className = '' }: StepperProps) {
  const { t } = useTranslation();
  const { currentStep, setCurrentStep, canGoToStep } = useWorkerRegistrationStore();

  return (
    <div className={`flex items-center justify-between w-full max-w-[1120px] px-4 md:px-6 lg:px-0 ${className}`}>
      {WORKER_REGISTRATION_STEPS.map((step, index) => {
        const isActive = step === currentStep;
        const isClickable = canGoToStep(step);
        const isLast = index === WORKER_REGISTRATION_STEPS.length - 1;

        return (
          <div key={step} className="flex items-center gap-2 md:gap-[10px] flex-1 last:flex-none" style={{ flex: isLast ? 'none' : '1' }}>
            <button
              type="button"
              onClick={() => isClickable && setCurrentStep(step)}
              disabled={!isClickable}
              className={`
                inline-flex items-center gap-1.5 md:gap-2.5 relative flex-[0_0_auto] bg-transparent outline-none border-none p-0
                ${isClickable ? 'cursor-pointer hover:opacity-80 hover:bg-transparent' : 'cursor-not-allowed'}
              `}
            >
              {STEP_ICONS[step](isActive)}

              <div className="hidden sm:inline-flex items-center gap-3 relative flex-[0_0_auto]">
                <div
                  className={`
                    relative w-fit ${!isLast ? "mt-[-1.00px]" : ""} 
                    font-lexend text-xs md:text-[14px] font-medium text-center tracking-[0] leading-[150%] whitespace-nowrap
                    ${isActive ? "text-[#180149]" : "text-[#374151]"}
                  `}
                >
                  {step === 'general-info' && t('workerRegistration.steps.generalInfo')}
                  {step === 'service-address' && t('workerRegistration.steps.serviceAddress')}
                  {step === 'availability' && t('workerRegistration.steps.availability')}
                </div>
              </div>
            </button>
            {!isLast && (
              <div className="flex-1 flex justify-center w-full">
                <svg className="w-2 h-3 md:w-[11px] md:h-[19px] flex-shrink-0" viewBox="0 0 11 19" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M0 16.3263L6.79892 9.25L0 2.17375L2.09312 0L11 9.25L2.09312 18.5L0 16.3263Z" fill="#737373" />
                </svg>
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
