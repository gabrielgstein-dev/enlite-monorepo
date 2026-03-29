/**
 * Unit tests for AdminUploadsPage — covers the two critical bugs:
 *
 * Bug 1: Upload response field is `importJobId`, not `jobId`.
 *        Before the fix, jobId was always undefined → pollStatus never ran.
 *
 * Bug 2: ImportHistoryList must reload after a new upload is submitted.
 *        Before the fix, the history list had no channel to receive that signal.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, waitFor } from '@testing-library/react';
import { AdminUploadsPage } from '../AdminUploadsPage';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

vi.mock('@infrastructure/services/FirebaseAuthService', () => ({
  FirebaseAuthService: vi.fn().mockImplementation(() => ({
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

// Capture the refreshKey prop passed to ImportHistoryList so we can assert on it.
let capturedRefreshKey: number | undefined;
vi.mock('@presentation/components/organisms/ImportHistory', () => ({
  ImportHistoryList: vi.fn(({ refreshKey }: { refreshKey?: number }) => {
    capturedRefreshKey = refreshKey;
    return <div data-testid="history-list" />;
  }),
  ImportJobDetails: vi.fn(() => <div data-testid="job-details" />),
}));

// ── Helpers ─────────────────────────────────────────────────────────────────

const XLSX_FILE = new File([new Uint8Array([0x50, 0x4b, 0x03, 0x04])], 'test.xlsx', {
  type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
});

/**
 * Triggers the upload zone's React `onChange` handler directly via the React
 * fiber tree. This bypasses JSDOM's pointer/visibility constraints for
 * `display:none` file inputs (Tailwind's `hidden` class) while still exercising
 * the real component code path.
 */
async function uploadFileToZone(zoneKey: string, file: File) {
  const input = document
    .querySelector<HTMLInputElement>(`[data-testid="upload-zone-${zoneKey}"] input[type="file"]`);
  if (!input) throw new Error(`File input not found for zone ${zoneKey}`);

  // React 18 stores event handlers under __reactProps$... on the DOM node.
  const propsKey = Object.keys(input).find(k => k.startsWith('__reactProps'));
  const reactProps = propsKey ? (input as any)[propsKey] : null;
  const onChange = reactProps?.onChange;
  if (!onChange) throw new Error(`Could not find React onChange on input (keys: ${Object.keys(input).join(', ')})`);

  // Call directly — waitFor will wrap assertions in act() which flushes updates.
  onChange({ target: { files: [file] } });
}

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  capturedRefreshKey = undefined;
  vi.clearAllMocks();
});

// ── Bug 1 — importJobId field ─────────────────────────────────────────────────
//
// Core proof: when the upload response returns `importJobId`, the component reads
// it and calls the status polling endpoint.
// Before the fix, `json.data?.jobId` was always undefined so the poll was skipped.

describe('Bug 1 — importJobId field name', () => {
  it('upload fetch is called when file is selected (handler wiring sanity check)', async () => {
    // Freeze the upload fetch so we can assert it was called.
    const fetchMock = vi.fn(async () => new Promise<never>(() => {}));
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminUploadsPage />);
    await uploadFileToZone('candidatos', XLSX_FILE);

    await waitFor(() => {
      const uploadCall = (fetchMock.mock.calls as unknown[][]).find(([url]) =>
        String(url).includes('/api/import/upload'),
      );
      expect(uploadCall).toBeTruthy();
    }, { timeout: 3000 });
  });

  it('calls the status endpoint after upload returns importJobId', async () => {
    const jobId = 'job-abc-123';
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/import/upload')) {
        return { ok: true, json: async () => ({ success: true, data: { importJobId: jobId } }) };
      }
      // Status poll — return done so polling terminates.
      return { ok: true, json: async () => ({ success: true, data: { status: 'done', inserted: 5, updated: 0, errors: 0 } }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminUploadsPage />);
    await uploadFileToZone('candidatos', XLSX_FILE);

    // pollStatus waits 2 seconds before the first poll. Use a 6-second timeout.
    await waitFor(() => {
      const statusCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes(`/api/import/status/${jobId}`),
      );
      expect(statusCall).toBeTruthy();
    }, { timeout: 6000 });
  }, 10000);

  it('does NOT call status endpoint when response has wrong field (old jobId)', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/import/upload')) {
        // Old wrong field — frontend can't read it.
        return { ok: true, json: async () => ({ success: true, data: { jobId: 'wrong-field' } }) };
      }
      return { ok: true, json: async () => ({ success: true, data: [] }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminUploadsPage />);
    await uploadFileToZone('candidatos', XLSX_FILE);

    // Wait long enough for a poll to have fired (if broken), then confirm it wasn't.
    await new Promise(r => setTimeout(r, 3000));

    const statusCall = fetchMock.mock.calls.find(([url]) =>
      String(url).includes('/api/import/status/'),
    );
    expect(statusCall).toBeUndefined();
  }, 8000);
});

// ── Bug 4 — alreadyImported flag ─────────────────────────────────────────────
//
// When the backend returns { success: true, alreadyImported: true } the frontend
// must show explicit "already imported" feedback instead of silently entering done.
// Additionally, no status polling must be triggered.

describe('Bug 4 — alreadyImported: true shows feedback and skips polling', () => {
  it('shows "already imported" message when upload returns alreadyImported:true', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/import/upload')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            alreadyImported: true,
            message: 'Arquivo já importado.',
            data: { importJobId: 'existing-123', importedAt: new Date().toISOString() },
          }),
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { getByText } = render(<AdminUploadsPage />);
    await uploadFileToZone('candidatos', XLSX_FILE);

    await waitFor(() => {
      expect(getByText(/já importado/i)).toBeInTheDocument();
    }, { timeout: 5000 });

    // No status polling should have occurred.
    await new Promise((r) => setTimeout(r, 500));
    const statusCalls = fetchMock.mock.calls.filter(([url]) =>
      String(url).includes('/api/import/status/')
    );
    expect(statusCalls).toHaveLength(0);
  }, 8000);

  it('increments refreshKey (triggers history reload) even when alreadyImported:true', async () => {
    vi.stubGlobal('fetch', vi.fn(async (url: string) => {
      if (String(url).includes('/api/import/upload')) {
        return {
          ok: true,
          json: async () => ({
            success: true,
            alreadyImported: true,
            data: { importJobId: 'existing-dup', importedAt: new Date().toISOString() },
          }),
        };
      }
      return { ok: true, json: async () => ({ success: true }) };
    }));

    render(<AdminUploadsPage />);
    const keyBefore = capturedRefreshKey ?? 0;

    await uploadFileToZone('candidatos', XLSX_FILE);

    await waitFor(() => {
      expect(capturedRefreshKey).toBeGreaterThan(keyBefore);
    }, { timeout: 5000 });
  }, 8000);

  it('does NOT show "already imported" message on a normal successful upload', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/import/upload')) {
        return {
          ok: true,
          json: async () => ({ success: true, data: { importJobId: 'new-job-id' } }),
        };
      }
      return {
        ok: true,
        json: async () => ({ success: true, data: { status: 'done', inserted: 5 } }),
      };
    });
    vi.stubGlobal('fetch', fetchMock);

    const { queryByText } = render(<AdminUploadsPage />);
    await uploadFileToZone('candidatos', XLSX_FILE);

    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/import/upload')
      );
      expect(uploadCall).toBeTruthy();
    }, { timeout: 3000 });

    expect(queryByText(/já importado/i)).toBeNull();
  }, 8000);
});

// ── Bug 2 — history refresh after upload ──────────────────────────────────────
//
// refreshHistory() fires synchronously after the upload response arrives,
// incrementing historyRefreshKey and re-rendering ImportHistoryList.

describe('Bug 2 — ImportHistoryList refreshKey increments after upload', () => {
  it('passes an initial refreshKey of 0 to ImportHistoryList', () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: true, data: [] }),
    })));

    render(<AdminUploadsPage />);

    expect(capturedRefreshKey).toBe(0);
  });

  it('increments refreshKey after a successful upload response', async () => {
    const fetchMock = vi.fn(async (url: string) => {
      if (String(url).includes('/api/import/upload')) {
        return { ok: true, json: async () => ({ success: true, data: { importJobId: 'job-refresh-test' } }) };
      }
      return { ok: true, json: async () => ({ success: true, data: { status: 'done', inserted: 1, updated: 0, errors: 0 } }) };
    });
    vi.stubGlobal('fetch', fetchMock);

    render(<AdminUploadsPage />);
    const keyBefore = capturedRefreshKey ?? 0;

    await uploadFileToZone('candidatos', XLSX_FILE);

    // refreshHistory() fires right after the upload fetch resolves (no poll delay).
    // Wait for the upload fetch to be called first, then check refreshKey.
    await waitFor(() => {
      const uploadCall = fetchMock.mock.calls.find(([url]) =>
        String(url).includes('/api/import/upload'),
      );
      expect(uploadCall).toBeTruthy();
    }, { timeout: 3000 });

    // Now wait for the state update to commit and ImportHistoryList to re-render.
    await waitFor(() => {
      expect(capturedRefreshKey).toBeGreaterThan(keyBefore);
    }, { timeout: 3000 });
  }, 8000);

  it('does not increment refreshKey when upload API returns an error', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => ({
      ok: true,
      json: async () => ({ success: false, error: 'Server error' }),
    })));

    render(<AdminUploadsPage />);
    const keyBefore = capturedRefreshKey ?? 0;

    await uploadFileToZone('candidatos', XLSX_FILE);

    // Give async handler time to complete with an error.
    await new Promise(r => setTimeout(r, 500));

    // Upload failed — refreshHistory must NOT have been called.
    expect(capturedRefreshKey).toBe(keyBefore);
  });
});
