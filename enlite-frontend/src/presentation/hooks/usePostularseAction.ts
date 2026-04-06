import { useState, useCallback } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@presentation/hooks/useAuth';
import { WorkerApiService } from '@infrastructure/http/WorkerApiService';
import { DocumentApiService } from '@infrastructure/http/DocumentApiService';
import { validateRegistrationSteps } from '@presentation/utils/workerProgressValidation';

type PostularseState = 'idle' | 'loading' | 'unauthenticated' | 'incomplete' | 'ready' | 'not_available';

export interface UsePostularseActionResult {
  state: PostularseState;
  postularse: () => Promise<void>;
  dismissModal: () => void;
  confirmRegister: () => void;
}

export function usePostularseAction(whatsappUrl: string | null): UsePostularseActionResult {
  const { isAuthenticated } = useAuth();
  const navigate = useNavigate();
  const [state, setState] = useState<PostularseState>('idle');

  const postularse = useCallback(async () => {
    if (!whatsappUrl) {
      setState('not_available');
      return;
    }

    if (!isAuthenticated) {
      setState('unauthenticated');
      return;
    }

    setState('loading');
    try {
      const [workerData, documentsData] = await Promise.all([
        WorkerApiService.getProgress(),
        DocumentApiService.getDocuments(),
      ]);

      const docsComplete = !!(
        documentsData?.resumeCvUrl &&
        documentsData?.identityDocumentUrl &&
        documentsData?.criminalRecordUrl &&
        documentsData?.professionalRegistrationUrl &&
        documentsData?.liabilityInsuranceUrl
      );

      const steps = validateRegistrationSteps(workerData);
      const registrationComplete = steps.step1 && steps.step2 && steps.step3;

      if (!registrationComplete || !docsComplete) {
        navigate('/worker/profile');
        return;
      }

      window.open(whatsappUrl, '_blank');
      setState('idle');
    } catch {
      // If getProgress fails (e.g. worker not initialized), treat as incomplete
      navigate('/worker/profile');
    }
  }, [whatsappUrl, isAuthenticated, navigate]);

  const dismissModal = useCallback(() => setState('idle'), []);

  const confirmRegister = useCallback(() => {
    navigate('/register');
  }, [navigate]);

  return { state, postularse, dismissModal, confirmRegister };
}
