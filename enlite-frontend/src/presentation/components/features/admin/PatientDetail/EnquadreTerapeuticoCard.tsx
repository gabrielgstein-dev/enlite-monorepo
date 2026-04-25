import { useTranslation } from 'react-i18next';
import { Plus } from 'lucide-react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';

/**
 * "Enquadre Terapêutico" — kanban com 4 colunas (Entrevista, Selecionados,
 * Em Atendimento, Rejeitado) representando o workflow de matching AT ↔
 * paciente para um caso específico.
 *
 * Hoje não existe endpoint que retorne os encuadres agrupados por paciente,
 * então o card renderiza apenas o esqueleto visual com botões "Adicionar
 * novo" desabilitados. Quando a API for criada (Phase 2), cada coluna passa
 * a receber a lista de workers via prop.
 */
const COLUMNS = ['interview', 'selected', 'inService', 'rejected'] as const;
type EnquadreColumn = (typeof COLUMNS)[number];

export function EnquadreTerapeuticoCard() {
  const { t } = useTranslation();

  return (
    <div
      className="bg-white rounded-card border-[1.5px] border-gray-700 p-6 sm:px-8 sm:py-10 flex flex-col gap-6"
      data-testid="enquadre-terapeutico-card"
    >
      <Typography variant="h1" weight="semibold" as="h3" className="text-center">
        {t('admin.patients.detail.matchingCard.title')}
      </Typography>

      {/* Resumo top: Prazo de pagamento + Detalhes + Capacidade */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 border-b border-gray-300 pb-6">
        <div className="flex flex-col items-center gap-1 text-center">
          <Typography variant="body" weight="medium" className="text-gray-700">
            {t('admin.patients.detail.matchingCard.paymentTerm')}
          </Typography>
          <Typography variant="body" className="text-gray-600">—</Typography>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <Typography variant="body" weight="medium" className="text-gray-700">
            {t('admin.patients.detail.matchingCard.matchingDetails')}
          </Typography>
          <Typography variant="body" className="text-gray-600">—</Typography>
        </div>
        <div className="flex flex-col items-center gap-1 text-center">
          <Typography variant="body" weight="medium" className="text-gray-700">
            {t('admin.patients.detail.matchingCard.capacity')}
          </Typography>
          <Typography variant="body" className="text-gray-600">—</Typography>
        </div>
      </div>

      {/* Kanban: 4 colunas */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        {COLUMNS.map((col) => (
          <KanbanColumn key={col} column={col} />
        ))}
      </div>

      <Typography variant="body" className="text-center text-gray-600 italic">
        {t('admin.patients.detail.matchingCard.empty')}
      </Typography>
    </div>
  );
}

interface KanbanColumnProps {
  column: EnquadreColumn;
}

function KanbanColumn({ column }: KanbanColumnProps) {
  const { t } = useTranslation();
  return (
    <div
      className="bg-gray-100 rounded-lg p-4 flex flex-col gap-3 min-h-[160px]"
      data-testid={`enquadre-column-${column}`}
    >
      <Typography variant="body" weight="medium" className="text-gray-700">
        {t(`admin.patients.detail.matchingCard.columns.${column}`)}
      </Typography>
      <Button
        variant="outline"
        size="sm"
        disabled
        onClick={() => {}}
        className="flex items-center gap-1 self-start"
      >
        <Plus className="w-4 h-4" />
        {t('admin.patients.detail.matchingCard.addNew')}
      </Button>
    </div>
  );
}
