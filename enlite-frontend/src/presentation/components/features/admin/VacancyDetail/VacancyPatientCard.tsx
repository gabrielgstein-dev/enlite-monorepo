import { Typography } from '@presentation/components/atoms/Typography';

interface VacancyPatientCardProps {
  firstName: string | null;
  lastName: string | null;
  diagnosis: string | null;
  dependencyLevel: string | null;
  zone: string | null;
  insuranceVerified: boolean | null;
}

export function VacancyPatientCard({
  firstName,
  lastName,
  diagnosis,
  dependencyLevel,
  zone,
  insuranceVerified,
}: VacancyPatientCardProps) {
  const patientName = [firstName, lastName].filter(Boolean).join(' ') || '—';

  return (
    <div className="bg-white rounded-2xl border border-slate-200 shadow-sm p-6 flex flex-col gap-4">
      <Typography variant="h3" weight="semibold" className="text-[#737373]">
        Paciente
      </Typography>
      <div className="flex flex-col gap-3">
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Nome</Typography>
          <Typography variant="body" weight="medium">{patientName}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Diagnóstico</Typography>
          <Typography variant="body" weight="medium">{diagnosis ?? '—'}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Nível de dependência</Typography>
          <Typography variant="body" weight="medium">{dependencyLevel ?? '—'}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Zona / Bairro</Typography>
          <Typography variant="body" weight="medium">{zone ?? '—'}</Typography>
        </div>
        <div className="flex justify-between">
          <Typography variant="body" className="text-[#737373]">Plano verificado</Typography>
          <Typography variant="body" weight="medium">
            {insuranceVerified === null ? '—' : insuranceVerified ? 'Sim' : 'Não'}
          </Typography>
        </div>
      </div>
    </div>
  );
}
