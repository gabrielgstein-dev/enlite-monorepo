export interface PageHeaderProps {
  title: string;
  subtitle?: string;
  className?: string;
}

export const PageHeader = ({ title, subtitle, className = '' }: PageHeaderProps) => {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <div className="flex flex-col gap-1">
        <p className="relative w-fit mt-[-1.00px] font-head-web-head-24-web font-[number:var(--head-web-head-24-web-font-weight)] text-primary text-[length:var(--head-web-head-24-web-font-size)] text-center tracking-[var(--head-web-head-24-web-letter-spacing)] leading-[var(--head-web-head-24-web-line-height)] whitespace-nowrap [font-style:var(--head-web-head-24-web-font-style)]">
          {title}
        </p>
        {subtitle && (
          <p className="relative w-fit font-body-web-body-14-web font-[number:var(--body-web-body-14-web-font-weight)] text-graygray-700 text-[length:var(--body-web-body-14-web-font-size)] tracking-[var(--body-web-body-14-web-letter-spacing)] leading-[var(--body-web-body-14-web-line-height)] [font-style:var(--body-web-body-14-web-font-style)]">
            {subtitle}
          </p>
        )}
      </div>
    </div>
  );
};
