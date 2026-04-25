import { useState, useEffect, useCallback } from 'react';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import type { PatientDetail } from '@domain/entities/PatientDetail';

export function usePatientDetail(patientId: string | undefined) {
  const [patient, setPatient] = useState<PatientDetail | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!patientId) return;

    let cancelled = false;

    async function fetchPatient() {
      try {
        setIsLoading(true);
        setError(null);
        const data = await AdminApiService.getPatientById(patientId!);
        if (!cancelled) setPatient(data);
      } catch (err: any) {
        if (!cancelled) setError(err.message || 'Falha ao carregar paciente');
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    fetchPatient();
    return () => { cancelled = true; };
  }, [patientId]);

  const refetch = useCallback(() => {
    if (!patientId) return;
    setIsLoading(true);
    setError(null);
    AdminApiService.getPatientById(patientId)
      .then((data) => setPatient(data))
      .catch((err) => setError(err.message || 'Falha ao carregar paciente'))
      .finally(() => setIsLoading(false));
  }, [patientId]);

  return { patient, isLoading, error, refetch };
}
