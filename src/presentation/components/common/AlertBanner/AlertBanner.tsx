export interface AlertBannerProps {
  title: string;
  message: string;
  variant?: 'info' | 'warning' | 'error' | 'success';
  className?: string;
}

const variantStyles = {
  info: 'bg-primary',
  warning: 'bg-[#ff0066]',
  error: 'bg-red-500',
  success: 'bg-green-500',
};

export const AlertBanner = ({
  title,
  message,
  variant = 'warning',
  className = '',
}: AlertBannerProps) => {
  return (
    <div className={`flex w-full items-center gap-2.5 px-6 py-4 relative flex-[0_0_auto] ${variantStyles[variant]} rounded-xl ${className}`}>
      <p className="relative w-fit mt-[-1.00px] [font-family:'Lexend',Helvetica] font-normal text-white text-base tracking-[0] leading-[21.6px] whitespace-nowrap">
        <span className="font-[number:var(--body-web-body-16-web-medium-font-weight)] font-body-web-body-16-web-medium [font-style:var(--body-web-body-16-web-medium-font-style)] tracking-[var(--body-web-body-16-web-medium-letter-spacing)] leading-[var(--body-web-body-16-web-medium-line-height)] text-[length:var(--body-web-body-16-web-medium-font-size)]">
          {title}:{' '}
        </span>
        <span className="font-body-web-body-16-web font-[number:var(--body-web-body-16-web-font-weight)] text-[#ffffff] text-[length:var(--body-web-body-16-web-font-size)] tracking-[var(--body-web-body-16-web-letter-spacing)] leading-[var(--body-web-body-16-web-line-height)] [font-style:var(--body-web-body-16-web-font-style)]">
          {message}
        </span>
      </p>
    </div>
  );
};
