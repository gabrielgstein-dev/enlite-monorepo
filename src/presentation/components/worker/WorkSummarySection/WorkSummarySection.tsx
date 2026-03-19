import { useTranslation } from 'react-i18next';

interface SummaryCard {
  icon: string;
  label: string;
  value: string;
}

export const WorkSummaryCardsSection = (): JSX.Element => {
  const { t } = useTranslation();

  const summaryCards: SummaryCard[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725.svg',
      label: t('home.worker.hoursWorked', 'Horas trabalhadas'),
      value: '500h',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725-1.svg',
      label: t('home.worker.completedReports', 'Relatórios concluídos'),
      value: '20',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725-2.svg',
      label: t('home.worker.pendingReports', 'Relatórios pendentes'),
      value: '44',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725-3.svg',
      label: t('home.worker.vacancies', 'Vacantes'),
      value: '0',
    },
  ];

  return (
    <div className="inline-flex flex-col items-end gap-6">
      {/* Alert Banner */}
      <div className="flex w-[1042px] items-center gap-2.5 px-6 py-4 bg-[#ff0066] rounded-xl">
        <p className="relative w-fit font-lexend text-base text-white whitespace-nowrap">
          <span className="font-medium">
            {t('home.worker.pendingDocuments', 'Documentos Pendentes:')}{' '}
          </span>
          <span>
            {t('home.worker.uploadCriminalRecord', 'Carregue seus antecedentes penais em PDF')}
          </span>
        </p>
      </div>

      {/* Summary Cards */}
      <div className="flex w-[1042px] items-center gap-4">
        {summaryCards.map((card, index) => (
          <div
            key={index}
            className="flex items-center justify-center gap-4 px-6 py-8 relative flex-1 grow bg-primary rounded-[24px] border-[1.5px] border-solid border-primary"
          >
            <img className="relative w-16 h-16" alt="" src={card.icon} />
            <div className="inline-flex flex-col items-start relative flex-[0_0_auto]">
              <div className="relative w-fit font-lexend font-medium text-white text-sm tracking-[0] leading-[19px] whitespace-nowrap">
                {card.label}
              </div>
              <div className="relative w-fit font-lexend text-[32px] font-semibold text-white text-center tracking-[0] leading-[40px] whitespace-nowrap">
                {card.value}
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
