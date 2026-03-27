import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';
import { Button } from '@presentation/components/atoms/Button';

interface ReemplazosButtonProps {
  onClick: () => void;
  isCalculating: boolean;
  hasCalculated: boolean;
}

export function ReemplazosButton({ 
  onClick, 
  isCalculating, 
  hasCalculated 
}: ReemplazosButtonProps): JSX.Element {
  const { t } = useTranslation();

  return (
    <Button
      variant={hasCalculated ? 'outline' : 'primary'}
      onClick={onClick}
      disabled={isCalculating}
      className="flex items-center gap-2"
    >
      <RefreshCw size={16} className={isCalculating ? 'animate-spin' : ''} />
      {isCalculating 
        ? t('admin.recruitment.calculating') 
        : hasCalculated 
          ? t('admin.recruitment.recalculate')
          : t('admin.recruitment.calculateReemplazos')
      }
    </Button>
  );
}
