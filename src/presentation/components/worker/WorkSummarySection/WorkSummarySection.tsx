import { AlertBanner } from '../../common/AlertBanner';
import { SummaryCard } from '../../common/SummaryCard';

interface SummaryCardData {
  icon: string;
  label: string;
  value: string;
  mlIcon?: string;
  mrContent?: string;
}

export const WorkSummarySection = () => {
  const summaryCards: SummaryCardData[] = [
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725.svg',
      label: 'Horas trabalhadas',
      value: '500h',
      mlIcon: '',
      mrContent: '',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725-1.svg',
      label: 'Relatórios concluídos',
      value: '20',
      mlIcon: 'ml-[-5.25px]',
      mrContent: 'mr-[-5.25px]',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725-2.svg',
      label: 'Relatórios pendentes',
      value: '44',
      mlIcon: 'ml-[-4.75px]',
      mrContent: 'mr-[-4.75px]',
    },
    {
      icon: 'https://c.animaapp.com/rTGW2XnX/img/frame-1410125725-3.svg',
      label: 'Vacantes',
      value: '0',
      mlIcon: '',
      mrContent: '',
    },
  ];

  return (
    <div className="inline-flex flex-col items-end gap-6 w-full mb-8">
      <AlertBanner
        title="Documentos Pendentes"
        message="Carregue seus antecedentes penais em PDF"
        variant="warning"
        className="w-full"
      />

      <div className="flex w-full items-center gap-4 relative flex-[0_0_auto]">
        {summaryCards.map((card, index) => (
          <SummaryCard
            key={index}
            icon={card.icon}
            label={card.label}
            value={card.value}
            iconClass={card.mlIcon}
            contentClass={card.mrContent}
          />
        ))}
      </div>
    </div>
  );
};
