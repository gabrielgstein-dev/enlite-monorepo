/**
 * Unit tests for ImportHistoryList — covers Bug 2:
 *
 * Bug 2: The list must reload when `refreshKey` prop changes.
 *        Before the fix, the useEffect only ran on page/limit/statusFilter changes,
 *        so a new upload was invisible until the user manually changed a filter.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ImportHistoryList } from '../ImportHistoryList';

// ── Module mocks ────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string, fallback?: string) => fallback ?? key }),
}));

const mockFetchHistory = vi.fn();
const mockFetchQueue = vi.fn();

vi.mock('@hooks/useImportHistory', () => ({
  useImportHistory: () => ({
    fetchHistory: mockFetchHistory,
    fetchQueue: mockFetchQueue,
    cancelJob: vi.fn(),
  }),
}));

// ── Shared fixtures ─────────────────────────────────────────────────────────

const EMPTY_HISTORY = {
  data: [],
  pagination: { page: 1, limit: 20, total: 0, totalPages: 0, hasNext: false, hasPrev: false },
};
const EMPTY_QUEUE = { data: { running: null, queued: [] } };

const ONE_JOB_HISTORY = {
  data: [
    {
      id: 'job-1',
      filename: 'candidatos_new.xlsx',
      status: 'done',
      currentPhase: 'complete',
      workersCreated: 3,
      encuadresCreated: 0,
      encuadresSkipped: 0,
      errorRows: 0,
      createdBy: 'admin@test.com',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: new Date().toISOString(),
      cancelledAt: null,
      duration: '5s',
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
};

// ── Setup ───────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockFetchHistory.mockResolvedValue(EMPTY_HISTORY);
  mockFetchQueue.mockResolvedValue(EMPTY_QUEUE);
});

// ── Additional fixtures ───────────────────────────────────────────────────────

const ACTIVE_QUEUE_RUNNING = {
  data: {
    running: { jobId: 'job-running', filename: 'active.xlsx', enqueuedAt: new Date().toISOString() },
    queued: [] as Array<{ jobId: string; filename: string; position: number; enqueuedAt: string }>,
  },
};

const ACTIVE_QUEUE_WITH_QUEUED = {
  data: {
    running: null,
    queued: [{ jobId: 'job-q', filename: 'queued.xlsx', position: 1, enqueuedAt: new Date().toISOString() }],
  },
};

// ── Tests ────────────────────────────────────────────────────────────────────

describe('ImportHistoryList — Bug 3: polling starts even when list is empty/only-done', () => {
  let setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

  beforeEach(() => {
    setIntervalSpy = vi.spyOn(globalThis, 'setInterval');
  });

  afterEach(() => {
    setIntervalSpy.mockRestore();
  });

  it('starts polling interval when queueInfo has a running job and jobs list is empty', async () => {
    mockFetchHistory.mockResolvedValue(EMPTY_HISTORY);
    mockFetchQueue.mockResolvedValue(ACTIVE_QUEUE_RUNNING);

    render(<ImportHistoryList onSelectJob={vi.fn()} />);

    await waitFor(() => {
      const pollingCalls = setIntervalSpy.mock.calls.filter(([_fn, ms]) => ms === 3000);
      expect(pollingCalls.length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });

  it('starts polling interval when queueInfo has queued jobs and list has only done jobs', async () => {
    mockFetchHistory.mockResolvedValue(ONE_JOB_HISTORY); // all done
    mockFetchQueue.mockResolvedValue(ACTIVE_QUEUE_WITH_QUEUED);

    render(<ImportHistoryList onSelectJob={vi.fn()} />);

    await waitFor(() => {
      const pollingCalls = setIntervalSpy.mock.calls.filter(([_fn, ms]) => ms === 3000);
      expect(pollingCalls.length).toBeGreaterThan(0);
    }, { timeout: 2000 });
  });

  it('does NOT start polling interval when both jobs list and queueInfo are fully inactive', async () => {
    mockFetchHistory.mockResolvedValue(ONE_JOB_HISTORY); // all done
    mockFetchQueue.mockResolvedValue(EMPTY_QUEUE);

    render(<ImportHistoryList onSelectJob={vi.fn()} />);

    // Wait for full initial load.
    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(1));
    await waitFor(() => expect(mockFetchQueue).toHaveBeenCalledTimes(1));
    // Allow effects to settle.
    await act(async () => { await new Promise((r) => setTimeout(r, 100)); });

    const pollingCalls = setIntervalSpy.mock.calls.filter(([_fn, ms]) => ms === 3000);
    expect(pollingCalls.length).toBe(0);
  });
});

describe('ImportHistoryList — refreshKey prop (Bug 2)', () => {
  it('calls fetchHistory once on initial mount', async () => {
    render(<ImportHistoryList onSelectJob={vi.fn()} />);

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(1));
  });

  it('calls fetchHistory again when refreshKey increments', async () => {
    const { rerender } = render(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={0} />);

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(1));

    // Simulate a new upload → parent increments refreshKey from 0 to 1.
    rerender(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={1} />);

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(2));
  });

  it('renders new job in list after refreshKey-triggered reload', async () => {
    // First render: empty list.
    mockFetchHistory.mockResolvedValueOnce(EMPTY_HISTORY);
    const { rerender } = render(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={0} />);

    await waitFor(() => expect(screen.getByText(/Nenhum import/i)).toBeInTheDocument());

    // Second render with refreshKey=1: list returns a new job.
    mockFetchHistory.mockResolvedValueOnce(ONE_JOB_HISTORY);
    rerender(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={1} />);

    await waitFor(() => {
      expect(screen.getByText('candidatos_new.xlsx')).toBeInTheDocument();
    });
  });

  it('does NOT re-fetch when refreshKey stays the same', async () => {
    const { rerender } = render(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={5} />);

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(1));

    // Re-render with identical props — no extra fetch.
    rerender(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={5} />);

    // Give React a tick to process.
    await new Promise(r => setTimeout(r, 50));

    expect(mockFetchHistory).toHaveBeenCalledTimes(1);
  });

  it('re-fetches when statusFilter changes (existing behaviour still works)', async () => {
    render(<ImportHistoryList onSelectJob={vi.fn()} refreshKey={0} />);

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(1));

    // Click the "Em andamento" filter tab.
    await userEvent.click(screen.getByRole('button', { name: /Em andamento/i }));

    await waitFor(() => expect(mockFetchHistory).toHaveBeenCalledTimes(2));
    expect(mockFetchHistory).toHaveBeenLastCalledWith(1, 20, 'processing');
  });
});

// ── Additional fixture for Bug 5 ─────────────────────────────────────────────

const PROCESSING_JOB_HISTORY = {
  data: [
    {
      id: 'job-active',
      filename: 'active.xlsx',
      status: 'processing',
      currentPhase: 'import',
      workersCreated: 0,
      encuadresCreated: 0,
      encuadresSkipped: 0,
      errorRows: 0,
      createdBy: 'admin@test.com',
      createdAt: new Date().toISOString(),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      cancelledAt: null,
      duration: null,
    },
  ],
  pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
};

describe('ImportHistoryList — Bug 5: polling interval race condition', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('setInterval(3000) is called exactly ONCE across 3 polling ticks while jobs stay active', async () => {
    vi.useFakeTimers();

    // Always return the same processing job — shouldPoll stays true throughout
    mockFetchHistory.mockResolvedValue(PROCESSING_JOB_HISTORY);
    mockFetchQueue.mockResolvedValue(EMPTY_QUEUE);

    const setIntervalSpy = vi.spyOn(globalThis, 'setInterval');

    render(<ImportHistoryList onSelectJob={vi.fn()} />);

    // Flush initial data load (promises resolve as microtasks)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After loading an active job, the polling interval should have started exactly once
    const countAfterLoad = setIntervalSpy.mock.calls.filter(([, ms]) => ms === 3000).length;
    expect(countAfterLoad).toBe(1);

    // Fire 3 polling ticks — each fires the interval callback which calls setJobs(newArray)
    for (let tick = 0; tick < 3; tick++) {
      await act(async () => {
        vi.advanceTimersByTime(3001);
        // Flush the async chain inside the interval: fetchHistory.then → setJobs
        await Promise.resolve();
        await Promise.resolve();
        await Promise.resolve();
      });
    }

    // KEY ASSERTION: despite 3 ticks that updated component state (new array refs for `jobs`),
    // setInterval(3000) was called ONLY ONCE — the interval was never recreated.
    // Before the fix (jobs in deps): would be called 4× (1 initial + 3 recreations).
    const countAfterTicks = setIntervalSpy.mock.calls.filter(([, ms]) => ms === 3000).length;
    expect(countAfterTicks).toBe(1);

    setIntervalSpy.mockRestore();
  });

  it('clears the interval when shouldPoll transitions to false (all jobs done)', async () => {
    vi.useFakeTimers();

    const DONE_HISTORY = {
      data: [
        {
          id: 'job-active',
          filename: 'active.xlsx',
          status: 'done',
          currentPhase: 'complete',
          workersCreated: 5,
          encuadresCreated: 0,
          encuadresSkipped: 0,
          errorRows: 0,
          createdBy: 'admin@test.com',
          createdAt: new Date().toISOString(),
          startedAt: new Date().toISOString(),
          finishedAt: new Date().toISOString(),
          cancelledAt: null,
          duration: '5s',
        },
      ],
      pagination: { page: 1, limit: 20, total: 1, totalPages: 1, hasNext: false, hasPrev: false },
    };

    // First call (loadData): active job → starts polling
    mockFetchHistory.mockResolvedValueOnce(PROCESSING_JOB_HISTORY);
    // Subsequent calls (polling): job is done → shouldPoll becomes false → interval cleared
    mockFetchHistory.mockResolvedValue(DONE_HISTORY);
    mockFetchQueue.mockResolvedValue(EMPTY_QUEUE);

    const clearIntervalSpy = vi.spyOn(globalThis, 'clearInterval');

    render(<ImportHistoryList onSelectJob={vi.fn()} />);

    // Flush initial load (active job)
    await act(async () => {
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // Fire one polling tick — polling returns done job → shouldPoll becomes false
    await act(async () => {
      vi.advanceTimersByTime(3001);
      await Promise.resolve();
      await Promise.resolve();
      await Promise.resolve();
    });

    // After shouldPoll transitions false, React re-runs the effect cleanup → clearInterval called
    expect(clearIntervalSpy).toHaveBeenCalled();

    clearIntervalSpy.mockRestore();
  });
});
