import { useMemo } from 'react';
import type { WorkerProgressResponse } from '@infrastructure/http/WorkerApiService';
import type { WorkerProfileProgress, ProgressSection } from '../../types/workerProgress';
import {
  validateRegistrationSteps,
  getStep1Progress,
  getStep2Progress,
  getStep3Progress,
} from '../utils/workerProgressValidation';

interface UseWorkerProfileProgressResult {
  progress: WorkerProfileProgress;
  isComplete: boolean;
}

export function useWorkerProfileProgress(
  workerData: WorkerProgressResponse | null
): UseWorkerProfileProgressResult {
  const progress = useMemo((): WorkerProfileProgress => {
    if (!workerData) {
      return {
        overallPercentage: 0,
        sections: [],
      };
    }

    const stepValidation = validateRegistrationSteps(workerData);
    const step1Progress = getStep1Progress(workerData);
    const step2Progress = getStep2Progress(workerData);
    const step3Progress = getStep3Progress(workerData);

    const registrationSteps = [
      { id: 'step1', label: 'Informações Gerais', completed: stepValidation.step1 },
      { id: 'step2', label: 'Endereço de Atendimento', completed: stepValidation.step2 },
      { id: 'step3', label: 'Disponibilidade', completed: stepValidation.step3 },
    ];

    const registrationCompletedSteps = registrationSteps.filter((s) => s.completed).length;
    const registrationTotalSteps = registrationSteps.length;

    const registrationCompletedFields =
      step1Progress.completedFields +
      step2Progress.completedFields +
      step3Progress.completedFields;
    const registrationTotalFields =
      step1Progress.totalFields + step2Progress.totalFields + step3Progress.totalFields;

    const documentsSteps = [
      { id: 'doc1', label: 'Currículo (PDF)', completed: false },
      { id: 'doc2', label: 'Documento de Identidade', completed: false },
      { id: 'doc3', label: 'Antecedentes Penais', completed: false },
      { id: 'doc4', label: 'Registro Profissional', completed: false },
      { id: 'doc5', label: 'Seguro de Responsabilidade', completed: false },
    ];

    const documentsCompleted = documentsSteps.filter((s) => s.completed).length;
    const documentsTotal = documentsSteps.length;

    const sections: ProgressSection[] = [
      {
        id: 'registration',
        title: 'Cadastro Básico',
        icon: '📋',
        steps: registrationSteps.map((step) => ({
          id: step.id,
          label: step.label,
          status: step.completed ? 'completed' : 'pending',
        })),
        completedCount: registrationCompletedSteps,
        totalCount: registrationTotalSteps,
        percentage: registrationTotalFields > 0
          ? Math.round((registrationCompletedFields / registrationTotalFields) * 100)
          : 0,
      },
      {
        id: 'documents',
        title: 'Documentos Profissionais',
        icon: '📄',
        steps: documentsSteps.map((step) => ({
          id: step.id,
          label: step.label,
          status: workerData.registrationCompleted
            ? (step.completed ? 'completed' : 'pending')
            : 'locked',
        })),
        completedCount: documentsCompleted,
        totalCount: documentsTotal,
        percentage: Math.round((documentsCompleted / documentsTotal) * 100),
      },
    ];

    const totalFields = registrationTotalFields + documentsTotal;
    const completedFields = registrationCompletedFields + documentsCompleted;
    const overallPercentage = totalFields > 0
      ? Math.round((completedFields / totalFields) * 100)
      : 0;

    let nextAction;
    if (!workerData.registrationCompleted) {
      nextAction = {
        label: 'Completar Cadastro',
        route: '/worker-registration',
      };
    } else if (documentsCompleted < documentsTotal) {
      nextAction = {
        label: 'Enviar Documentos',
        route: '/worker/documents',
      };
    }

    return {
      overallPercentage,
      sections,
      nextAction,
    };
  }, [workerData]);

  const isComplete = progress.overallPercentage === 100;

  return { progress, isComplete };
}
