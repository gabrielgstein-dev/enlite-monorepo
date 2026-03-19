import { useTranslation } from 'react-i18next';

interface WorkerTopNavbarProps {
  userName?: string;
}

export const WorkerTopNavbar = ({ userName = 'Alberto' }: WorkerTopNavbarProps): JSX.Element => {
  const { t } = useTranslation();

  return (
    <div className="flex w-[1042px] items-center justify-between">
      <p className="relative w-fit font-poppins text-2xl font-semibold text-primary text-center tracking-[0] leading-[31px] whitespace-nowrap">
        {t('home.worker.greeting', `Olá, ${userName}, essa é sua página principal`)}
      </p>

      <div className="inline-flex items-center gap-7 relative flex-[0_0_auto]">
        <div className="inline-flex items-center gap-10 relative flex-[0_0_auto]">
          <div className="inline-flex items-center gap-2 relative flex-[0_0_auto]">
            <img
              className="relative w-7 h-5"
              alt="Country flag"
              src="https://c.animaapp.com/rTGW2XnX/img/group-237688@2x.png"
            />
            <span className="relative flex items-center w-fit font-lexend font-medium text-gray-800 text-sm tracking-[0] leading-[19px] whitespace-nowrap">
              {t('home.worker.country', 'Argentina')}
            </span>
          </div>
        </div>
      </div>
    </div>
  );
};
