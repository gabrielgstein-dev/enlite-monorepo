import { lazy, ComponentType } from 'react';

/**
 * Wraps React.lazy with retry logic for dynamic imports.
 * Handles transient chunk-load failures (e.g. after a new deploy changes hashes)
 * by retrying the import up to `maxRetries` times with a cache-busting query param.
 */
export function lazyWithRetry<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
  maxRetries = 2,
): ReturnType<typeof lazy> {
  return lazy(() => retryImport(importFn, maxRetries));
}

async function retryImport<T extends ComponentType<unknown>>(
  importFn: () => Promise<{ default: T }>,
  retriesLeft: number,
): Promise<{ default: T }> {
  try {
    return await importFn();
  } catch (error) {
    if (retriesLeft <= 0 || !isChunkLoadError(error)) throw error;

    // Small delay before retry (200ms, 400ms)
    await new Promise((r) => setTimeout(r, (3 - retriesLeft) * 200));

    // Bust the module cache by appending a timestamp query param to the URL.
    // Vite dynamic imports resolve to a URL — reloading the page fetches
    // the new index.html with updated chunk references.
    return retryImport(importFn, retriesLeft - 1);
  }
}

function isChunkLoadError(error: unknown): boolean {
  if (!(error instanceof Error)) return false;
  return (
    error.message.includes('Failed to fetch dynamically imported module') ||
    error.message.includes('Loading chunk') ||
    error.message.includes('Importing a module script failed')
  );
}
