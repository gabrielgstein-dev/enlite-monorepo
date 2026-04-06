export function classifyWorkerCaseStatus(resultado: string | null): string {
  if (!resultado) return 'SEM_RESULTADO';
  if (resultado === 'SELECCIONADO') return 'SELECCIONADO';
  if (resultado === 'RECHAZADO') return 'RECHAZADO';
  if (resultado === 'AT_NO_ACEPTA') return 'NAO_INTERESSADO';
  if (resultado === 'BLACKLIST') return 'BLACKLIST';
  if (['PENDIENTE','REPROGRAMAR','REEMPLAZO'].includes(resultado)) return 'EM_ANDAMENTO';
  return 'OUTRO';
}

export function groupByResultado(encuadres: { resultado: string | null }[]): Record<string, number> {
  return encuadres.reduce((acc, e) => {
    const key = e.resultado ?? 'SEM_RESULTADO';
    acc[key] = (acc[key] ?? 0) + 1;
    return acc;
  }, {} as Record<string, number>);
}
