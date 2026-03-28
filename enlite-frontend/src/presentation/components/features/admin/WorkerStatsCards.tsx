import { Typography } from '@presentation/components/atoms/Typography';

export interface WorkerStatsCardsProps {
  stats: {
    today: number;
    yesterday: number;
    sevenDaysAgo: number;
  } | null;
}

const UserPlusIcon = (): JSX.Element => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 12C14.7614 12 17 9.76142 17 7C17 4.23858 14.7614 2 12 2C9.23858 2 7 4.23858 7 7C7 9.76142 9.23858 12 12 12Z"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M3.41003 22C3.41003 18.13 7.26003 15 12 15C12.96 15 13.89 15.13 14.76 15.37"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M19 18V22" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
    <path d="M17 20H21" stroke="white" strokeWidth="1.5" strokeLinecap="round" />
  </svg>
);

const ClockIcon = (): JSX.Element => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M12 22C17.5228 22 22 17.5228 22 12C22 6.47715 17.5228 2 12 2C6.47715 2 2 6.47715 2 12C2 17.5228 6.47715 22 12 22Z"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path d="M12 6V12L16 14" stroke="white" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
  </svg>
);

const CalendarIcon = (): JSX.Element => (
  <svg className="w-6 h-6" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
    <path
      d="M8 2V5M16 2V5M3.5 9.09H20.5M21 8.5V17C21 20 19.5 22 16 22H8C4.5 22 3 20 3 17V8.5C3 5.5 4.5 3.5 8 3.5H16C19.5 3.5 21 5.5 21 8.5Z"
      stroke="white"
      strokeWidth="1.5"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
    <path
      d="M15.6947 13.7H15.7037M15.6947 16.7H15.7037M11.9955 13.7H12.0045M11.9955 16.7H12.0045M8.29431 13.7H8.30329M8.29431 16.7H8.30329"
      stroke="white"
      strokeWidth="2"
      strokeLinecap="round"
      strokeLinejoin="round"
    />
  </svg>
);

function SkeletonCard(): JSX.Element {
  return (
    <div className="flex items-center justify-center gap-4 px-4 py-9 w-full sm:w-[288px] bg-primary rounded-[20px] border-[1.5px] border-solid border-primary animate-pulse">
      <div className="bg-[rgba(255,255,255,0.15)] flex items-center justify-center p-2.5 rounded-full w-16 h-16">
        <div className="w-6 h-6 rounded-full bg-[rgba(255,255,255,0.3)]" />
      </div>
      <div className="flex flex-col items-start gap-2">
        <div className="h-4 w-28 rounded bg-[rgba(255,255,255,0.3)]" />
        <div className="h-8 w-16 rounded bg-[rgba(255,255,255,0.3)]" />
      </div>
    </div>
  );
}

interface StatCardProps {
  label: string;
  value: number;
  icon: JSX.Element;
  testId: string;
}

function StatCard({ label, value, icon, testId }: StatCardProps): JSX.Element {
  return (
    <div
      data-testid={testId}
      className="flex items-center justify-center gap-4 px-4 py-9 w-full sm:w-[288px] bg-primary rounded-[20px] border-[1.5px] border-solid border-primary"
    >
      <div className="bg-[rgba(255,255,255,0.15)] border border-[rgba(255,255,255,0.15)] border-solid flex items-center justify-center p-2.5 rounded-full w-16 h-16">
        {icon}
      </div>
      <div className="flex flex-col items-start">
        <Typography variant="body" weight="medium" className="text-white font-lexend text-base">
          {label}
        </Typography>
        <Typography
          variant="h1"
          weight="semibold"
          className="text-white font-lexend text-[32px] leading-[1.25]"
        >
          {value}
        </Typography>
      </div>
    </div>
  );
}

export function WorkerStatsCards({ stats }: WorkerStatsCardsProps): JSX.Element {
  if (stats === null) {
    return (
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-12">
        <SkeletonCard />
        <SkeletonCard />
        <SkeletonCard />
      </div>
    );
  }

  return (
    <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-4 mb-12">
      <StatCard
        label="Cadastros Hoje"
        value={stats.today}
        icon={<UserPlusIcon />}
        testId="worker-stats-today"
      />
      <StatCard
        label="Cadastros Ontem"
        value={stats.yesterday}
        icon={<ClockIcon />}
        testId="worker-stats-yesterday"
      />
      <StatCard
        label="há 7 dias"
        value={stats.sevenDaysAgo}
        icon={<CalendarIcon />}
        testId="worker-stats-seven-days"
      />
    </div>
  );
}
