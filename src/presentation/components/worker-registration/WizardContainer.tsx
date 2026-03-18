import { ReactNode } from 'react';
import { Stepper } from './Stepper';

interface WizardContainerProps {
  children: ReactNode;
  className?: string;
}

export function WizardContainer({ children, className = '' }: WizardContainerProps) {
  return (
    <div className={`flex flex-col items-center w-full gap-0 ${className}`}>
      <Stepper className="mb-[80px]" />
      <div className="w-full max-w-[1200px] flex justify-center">
        {children}
      </div>
    </div>
  );
}
