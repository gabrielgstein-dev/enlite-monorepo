import { useTranslation } from 'react-i18next';

export interface TopNavbarProps {
  userName: string;
  className?: string;
}

export const TopNavbar = ({
  userName,
  className = '',
}: TopNavbarProps) => {
  const { t } = useTranslation();

  return (
    <div className={`flex items-start md:items-center justify-between gap-2 ${className}`}>
      <p className="font-head-web-head-24-web font-[number:var(--head-web-head-24-web-font-weight)] text-primary text-lg md:text-[length:var(--head-web-head-24-web-font-size)] tracking-[var(--head-web-head-24-web-letter-spacing)] leading-snug [font-style:var(--head-web-head-24-web-font-style)]">
        {t('topNavbar.greeting', 'Olá')}, {userName},{' '}
        <span className="block md:inline">{t('topNavbar.mainPage', 'essa é sua página principal')}</span>
      </p>

      <div className="hidden md:inline-flex items-center gap-7 flex-[0_0_auto]">
        <div className="inline-flex items-center gap-2">
          <img className="w-7 h-5" alt={t('topNavbar.countryFlagAlt', 'Country flag')} src="https://c.animaapp.com/rTGW2XnX/img/group-237688@2x.png" />
          <span className="font-body-web-body-14-web-medium font-[number:var(--body-web-body-14-web-medium-font-weight)] text-graygray-800 text-[length:var(--body-web-body-14-web-medium-font-size)] tracking-[var(--body-web-body-14-web-medium-letter-spacing)] leading-[var(--body-web-body-14-web-medium-line-height)] [font-style:var(--body-web-body-14-web-medium-font-style)] whitespace-nowrap">
            {t('topNavbar.country', 'Argentina')}
          </span>
        </div>
      </div>
    </div>
  );
};
