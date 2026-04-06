import { useCallback, useRef, useEffect } from 'react';

/**
 * Hook that debounces auto-save calls on blur/change events.
 * Uses a ref for saveFn so it always invokes the latest closure.
 */
export function useAutoSave(
  saveFn: () => Promise<void>,
  delay = 500,
  onError?: (error: unknown) => void,
): () => void {
  const saveFnRef = useRef(saveFn);
  saveFnRef.current = saveFn;

  const timeoutRef = useRef<ReturnType<typeof setTimeout>>();
  const isSavingRef = useRef(false);
  const pendingSaveRef = useRef(false);

  const executeSave = useCallback(async () => {
    if (isSavingRef.current) {
      pendingSaveRef.current = true;
      return;
    }

    isSavingRef.current = true;
    try {
      await saveFnRef.current();
    } catch (error) {
      console.error('[AutoSave] Failed:', error);
      onError?.(error);
    } finally {
      isSavingRef.current = false;
      if (pendingSaveRef.current) {
        pendingSaveRef.current = false;
        executeSave();
      }
    }
  }, []);

  const triggerSave = useCallback(() => {
    if (timeoutRef.current) clearTimeout(timeoutRef.current);
    timeoutRef.current = setTimeout(executeSave, delay);
  }, [executeSave, delay]);

  useEffect(() => {
    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, []);

  return triggerSave;
}
