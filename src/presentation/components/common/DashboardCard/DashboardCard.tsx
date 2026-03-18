import { ReactNode } from 'react';
import { Card } from '../../ui/Card';
import { Button } from '../../ui/Button';

export interface DashboardCardProps {
  icon?: ReactNode;
  title: string;
  subtitle?: string;
  description: string;
  buttonText: string;
  onButtonClick?: () => void;
  borderColor?: string;
  textColor?: string;
  backgroundColor?: string;
  buttonVariant?: 'primary' | 'outline';
}

export const DashboardCard = ({
  icon,
  title,
  subtitle,
  description,
  buttonText,
  onButtonClick,
  borderColor,
  textColor = 'text-primary',
  backgroundColor = 'bg-white',
  buttonVariant = 'outline',
}: DashboardCardProps) => {
  return (
    <Card
      className={`h-[314px] relative w-[334px] ${backgroundColor}`}
      borderColor={borderColor}
    >
      <div className="flex flex-col w-[294px] items-start gap-8 relative top-[calc(50.00%_-_116px)] left-[calc(50.00%_-_147px)]">
        <div className="flex flex-col items-start gap-4 relative self-stretch w-full flex-[0_0_auto]">
          {icon && <div>{icon}</div>}

          <div className="flex flex-col items-start gap-2 relative self-stretch w-full flex-[0_0_auto]">
            <div className="flex flex-col items-start gap-0.5 relative flex-[0_0_auto]">
              {subtitle && (
                <div className={`relative w-fit mt-[-1.00px] font-body-mobile-body-14-regular font-[number:var(--body-mobile-body-14-regular-font-weight)] ${textColor} text-[length:var(--body-mobile-body-14-regular-font-size)] tracking-[var(--body-mobile-body-14-regular-letter-spacing)] leading-[var(--body-mobile-body-14-regular-line-height)] whitespace-nowrap [font-style:var(--body-mobile-body-14-regular-font-style)]`}>
                  {subtitle}
                </div>
              )}

              <div className={`font-[number:var(--body-web-body-16-web-medium-font-weight)] ${textColor} relative w-fit font-body-web-body-16-web-medium text-[length:var(--body-web-body-16-web-medium-font-size)] tracking-[var(--body-web-body-16-web-medium-letter-spacing)] leading-[var(--body-web-body-16-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-16-web-medium-font-style)]`}>
                {title}
              </div>
            </div>

            <p className={`relative self-stretch font-body-web-body-14-web font-[number:var(--body-web-body-14-web-font-weight)] ${textColor} text-[length:var(--body-web-body-14-web-font-size)] tracking-[var(--body-web-body-14-web-letter-spacing)] leading-[var(--body-web-body-14-web-line-height)] [font-style:var(--body-web-body-14-web-font-style)]`}>
              {description}
            </p>
          </div>
        </div>

        <Button
          variant={buttonVariant}
          size="lg"
          fullWidth
          borderColor={borderColor}
          textColor={textColor}
          onClick={onButtonClick}
        >
          {buttonText}
        </Button>
      </div>
    </Card>
  );
};
