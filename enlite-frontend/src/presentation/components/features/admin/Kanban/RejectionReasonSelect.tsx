import { useState } from 'react';
import { Typography } from '@presentation/components/atoms/Typography';
import { Button } from '@presentation/components/atoms/Button';

interface RejectionReasonSelectProps {
  onSubmit: (category: string) => void;
  onCancel: () => void;
}

const REJECTION_OPTIONS = [
  { value: 'DISTANCE', label: 'Distancia al lugar' },
  { value: 'SCHEDULE_INCOMPATIBLE', label: 'Horario incompatible' },
  { value: 'INSUFFICIENT_EXPERIENCE', label: 'Experiencia insuficiente' },
  { value: 'SALARY_EXPECTATION', label: 'Pretensiones salariales' },
  { value: 'WORKER_DECLINED', label: 'AT no acepta' },
  { value: 'OVERQUALIFIED', label: 'Sobrecualificado' },
  { value: 'DEPENDENCY_MISMATCH', label: 'Nivel de dependencia' },
  { value: 'OTHER', label: 'Otro motivo' },
];

export function RejectionReasonSelect({ onSubmit, onCancel }: RejectionReasonSelectProps) {
  const [selected, setSelected] = useState('');

  return (
    <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
      <div className="bg-white rounded-2xl p-6 w-full max-w-sm shadow-xl">
        <Typography variant="h3" weight="semibold" className="text-[#180149] mb-4">
          Motivo de rechazo
        </Typography>

        <div className="flex flex-col gap-2 mb-6">
          {REJECTION_OPTIONS.map((opt) => (
            <label
              key={opt.value}
              className={`flex items-center gap-3 px-3 py-2.5 rounded-xl border cursor-pointer transition-colors ${
                selected === opt.value
                  ? 'border-purple-500 bg-purple-50'
                  : 'border-slate-200 hover:border-slate-300'
              }`}
            >
              <input
                type="radio"
                name="rejection"
                value={opt.value}
                checked={selected === opt.value}
                onChange={(e) => setSelected(e.target.value)}
                className="accent-purple-600"
              />
              <span className="text-sm font-medium text-[#180149]">{opt.label}</span>
            </label>
          ))}
        </div>

        <div className="flex gap-3">
          <Button variant="outline" size="sm" onClick={onCancel} className="flex-1">
            Cancelar
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={() => selected && onSubmit(selected)}
            disabled={!selected}
            className="flex-1"
          >
            Confirmar
          </Button>
        </div>
      </div>
    </div>
  );
}
