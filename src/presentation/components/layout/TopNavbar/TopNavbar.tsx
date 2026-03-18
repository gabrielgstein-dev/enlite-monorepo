export interface TopNavbarProps {
  userName: string;
  greeting?: string;
  country?: string;
  countryFlag?: string;
  className?: string;
}

export const TopNavbar = ({
  userName,
  greeting = 'Olá',
  country = 'Argentina',
  countryFlag = 'https://c.animaapp.com/rTGW2XnX/img/group-237688@2x.png',
  className = '',
}: TopNavbarProps) => {
  return (
    <div className={`flex items-center justify-between ${className}`}>
      <p className="relative w-fit mt-[-1.00px] font-head-web-head-24-web font-[number:var(--head-web-head-24-web-font-weight)] text-primary text-[length:var(--head-web-head-24-web-font-size)] text-center tracking-[var(--head-web-head-24-web-letter-spacing)] leading-[var(--head-web-head-24-web-line-height)] whitespace-nowrap [font-style:var(--head-web-head-24-web-font-style)]">
        {greeting}, {userName}, essa é sua página principal
      </p>

      <div className="inline-flex items-center gap-7 relative flex-[0_0_auto]">
        <div className="inline-flex items-center gap-10 relative flex-[0_0_auto]">
          <div className="inline-flex items-center gap-2 relative flex-[0_0_auto]">
            <img className="relative w-7 h-5" alt="Country flag" src={countryFlag} />

            <div className="relative flex items-center w-fit mt-[-1.00px] font-body-web-body-14-web-medium font-[number:var(--body-web-body-14-web-medium-font-weight)] text-graygray-800 text-[length:var(--body-web-body-14-web-medium-font-size)] tracking-[var(--body-web-body-14-web-medium-letter-spacing)] leading-[var(--body-web-body-14-web-medium-line-height)] whitespace-nowrap [font-style:var(--body-web-body-14-web-medium-font-style)]">
              {country}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
