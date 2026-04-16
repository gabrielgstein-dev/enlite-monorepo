import { useState, useCallback, useRef } from 'react';
import { WorkerApiService } from '@infrastructure/http/WorkerApiService';

interface UseWorkerEmailLookupReturn {
  /** Trigger the lookup for the given email. */
  lookup: (email: string) => Promise<void>;
  /** Reset lookup state (call when email changes). */
  reset: () => void;
  isLoading: boolean;
  /** null = not yet looked up */
  found: boolean | null;
  phoneMasked?: string;
}

const EMAIL_REGEX = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export function useWorkerEmailLookup(): UseWorkerEmailLookupReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [found, setFound] = useState<boolean | null>(null);
  const [phoneMasked, setPhoneMasked] = useState<string | undefined>();
  const lastLookedUpEmail = useRef<string>('');

  const reset = useCallback(() => {
    setFound(null);
    setPhoneMasked(undefined);
    lastLookedUpEmail.current = '';
  }, []);

  const lookup = useCallback(async (email: string) => {
    const trimmed = email.trim().toLowerCase();

    if (!EMAIL_REGEX.test(trimmed)) return;
    if (trimmed === lastLookedUpEmail.current) return;

    lastLookedUpEmail.current = trimmed;
    setIsLoading(true);

    try {
      const result = await WorkerApiService.lookupByEmail(trimmed);
      setFound(result.found);
      setPhoneMasked(result.phoneMasked);
    } catch {
      setFound(false);
      setPhoneMasked(undefined);
    } finally {
      setIsLoading(false);
    }
  }, []);

  return { lookup, reset, isLoading, found, phoneMasked };
}
