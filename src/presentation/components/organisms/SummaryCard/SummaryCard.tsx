export interface SummaryCardProps {
  icon: string;
  label: string;
  value: string | number;
  iconClass?: string;
  contentClass?: string;
}

export const SummaryCard = ({
  icon,
  label,
  value,
  iconClass = '',
  contentClass = '',
}: SummaryCardProps) => {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-9 relative flex-1 grow bg-primary rounded-[20px] border-[1.5px] border-solid border-primary">
      <img className={`relative w-16 h-16 ${iconClass}`} alt={label} src={icon} />
      <div className={`inline-flex flex-col items-start relative flex-[0_0_auto] ${contentClass}`}>
        <div className="relative w-fit mt-[-1.00px] font-body-web-body-14-web-medium font-[number:var(--body-web-body-14-web-medium-font-weight)] text-white text-[length:var(--body-web-body-14-web-medium-font-size)] tracking-[var(--body-web-body-14-web-medium-letter-spacing)] leading-[var(--body-web-body-14-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-14-web-medium-font-style)]">
          {label}
        </div>
        <div className="relative w-fit font-body-web-body-32-web-n-meros font-[number:var(--body-web-body-32-web-n-meros-font-weight)] text-white text-[length:var(--body-web-body-32-web-n-meros-font-size)] text-center tracking-[var(--body-web-body-32-web-n-meros-letter-spacing)] leading-[var(--body-web-body-32-web-n-meros-line-height)] whitespace-nowrap [font-style:var(--body-web-body-32-web-n-meros-font-style)]">
          {value}
        </div>
      </div>
    </div>
  );
};
