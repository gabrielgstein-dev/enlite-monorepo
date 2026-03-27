import { Typography } from '@presentation/components/atoms/Typography';

interface StatCard {
  label: string;
  value: string | number;
  icon: 'clock' | 'user-check' | 'user-search';
}

interface VacancyStatsCardsProps {
  stats: StatCard[];
}

const ClockIcon = (): JSX.Element => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M12 6V12L16 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const UserCheckIcon = (): JSX.Element => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3.41003 22C3.41003 18.13 7.26003 15 12 15C12.96 15 13.89 15.13 14.76 15.37" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M22 18C22 18.32 21.96 18.63 21.88 18.93C21.79 19.33 21.63 19.72 21.42 20.06C20.73 21.22 19.46 22 18 22C16.97 22 16.04 21.61 15.34 20.97C15.04 20.71 14.78 20.4 14.58 20.06C14.21 19.46 14 18.75 14 18C14 16.92 14.43 15.93 15.13 15.21C15.86 14.46 16.88 14 18 14C19.18 14 20.25 14.51 20.97 15.33C21.61 16.04 22 16.98 22 18Z" stroke="white" strokeWidth="1.5" strokeMiterlimit="10" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M16.44 18L17.43 18.99L19.56 17.02" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const UserSearchIcon = (): JSX.Element => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M3.41003 22C3.41003 18.13 7.26003 15 12 15C16.74 15 20.59 18.13 20.59 22" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
    <path d="M15.5 7.5C15.5 7.5 16.5 8.5 18.5 6.5" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round"/>
  </svg>
);

const iconMap = {
  clock: ClockIcon,
  'user-check': UserCheckIcon,
  'user-search': UserSearchIcon,
};

export function VacancyStatsCards({ stats }: VacancyStatsCardsProps): JSX.Element {
  const safeStats = stats || [];

  return (
    <div className="flex items-center gap-4 mb-12">
      {safeStats.map((stat, index) => {
        const IconComponent = iconMap[stat.icon];
        return (
          <div key={index} className="flex items-center justify-center gap-4 px-4 py-9 w-[288px] bg-primary rounded-[20px] border-[1.5px] border-solid border-primary">
            <div className="bg-[rgba(255,255,255,0.15)] border border-[rgba(255,255,255,0.15)] border-solid flex items-center justify-center p-2.5 rounded-full w-16 h-16">
              <IconComponent />
            </div>
            <div className="flex flex-col items-start">
              <Typography variant="body" weight="medium" className="text-white font-lexend text-base">
                {stat.label}
              </Typography>
              <Typography variant="h1" weight="semibold" className="text-white font-lexend text-[32px] leading-[1.25]">
                {stat.value}
              </Typography>
            </div>
          </div>
        );
      })}
    </div>
  );
}
