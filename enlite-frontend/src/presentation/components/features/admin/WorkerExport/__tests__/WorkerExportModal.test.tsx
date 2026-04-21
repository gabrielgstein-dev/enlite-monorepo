/**
 * WorkerExportModal.test.tsx
 *
 * Unit tests for the WorkerExportModal component.
 *
 * Covers:
 *   - Modal renders when isOpen=true
 *   - Modal does not render when isOpen=false
 *   - All 33 checkboxes are rendered
 *   - "Exportar" button is disabled when no columns are selected
 *   - "Exportar" button is enabled when at least one column is selected
 *   - "Seleccionar todas" selects all columns
 *   - "Deseleccionar todas" deselects all columns
 *   - onClose is called when Cancel is clicked
 *   - onClose is called on Escape key
 *   - Calls WorkersExportApiService.exportWorkers with correct params
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';

// ── i18n mock ─────────────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ── Service mock ──────────────────────────────────────────────────────────────
const { mockExportWorkers } = vi.hoisted(() => ({
  mockExportWorkers: vi.fn().mockResolvedValue(undefined),
}));
vi.mock('@infrastructure/http/WorkersExportApiService', () => ({
  WorkersExportApiService: { exportWorkers: mockExportWorkers },
}));

// ── Component under test ──────────────────────────────────────────────────────
import { WorkerExportModal } from '../WorkerExportModal';
import { ALL_EXPORT_COLUMNS } from '../workerExportColumns';

// ── Helpers ───────────────────────────────────────────────────────────────────
function renderModal(props: Partial<React.ComponentProps<typeof WorkerExportModal>> = {}) {
  return render(
    <WorkerExportModal
      isOpen={true}
      onClose={vi.fn()}
      {...props}
    />,
  );
}

// ── Tests ──────────────────────────────────────────────────────────────────────
describe('WorkerExportModal', () => {
  beforeEach(() => {
    mockExportWorkers.mockReset();
    mockExportWorkers.mockResolvedValue(undefined);
  });

  it('renders when isOpen=true', () => {
    renderModal();
    expect(screen.getByTestId('worker-export-modal')).toBeInTheDocument();
  });

  it('does not render when isOpen=false', () => {
    renderModal({ isOpen: false });
    expect(screen.queryByTestId('worker-export-modal')).not.toBeInTheDocument();
  });

  it('renders all 33 column checkboxes', () => {
    renderModal();
    const checkboxes = screen.getAllByRole('checkbox');
    expect(checkboxes).toHaveLength(ALL_EXPORT_COLUMNS.length);
    expect(checkboxes).toHaveLength(33);
  });

  it('export button is enabled by default (all columns selected)', () => {
    renderModal();
    expect(screen.getByTestId('worker-export-submit-btn')).not.toBeDisabled();
  });

  it('export button is disabled when all columns are deselected', async () => {
    renderModal();
    fireEvent.click(screen.getByText('admin.workers.export.deselectAll'));
    await waitFor(() => {
      expect(screen.getByTestId('worker-export-submit-btn')).toBeDisabled();
    });
    expect(screen.getByTestId('export-no-columns-error')).toBeInTheDocument();
  });

  it('"Seleccionar todas" re-enables all checkboxes', async () => {
    renderModal();
    fireEvent.click(screen.getByText('admin.workers.export.deselectAll'));
    fireEvent.click(screen.getByText('admin.workers.export.selectAll'));
    await waitFor(() => {
      expect(screen.getByTestId('worker-export-submit-btn')).not.toBeDisabled();
    });
    const checkboxes = screen.getAllByRole('checkbox') as HTMLInputElement[];
    expect(checkboxes.every((c) => c.checked)).toBe(true);
  });

  it('calls onClose when Cancel button is clicked', () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByText('admin.workers.export.cancel'));
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls onClose when Escape key is pressed', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    await userEvent.keyboard('{Escape}');
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('calls WorkersExportApiService.exportWorkers on submit with correct format', async () => {
    renderModal({ activeFilters: { docs_complete: 'complete' } });
    fireEvent.click(screen.getByTestId('worker-export-submit-btn'));
    await waitFor(() => expect(mockExportWorkers).toHaveBeenCalledTimes(1));
    const call = mockExportWorkers.mock.calls[0][0];
    expect(call.format).toBe('csv');
    expect(call.columns).toHaveLength(33);
    expect(call.docs_complete).toBe('complete');
  });

  it('closes modal after successful export', async () => {
    const onClose = vi.fn();
    renderModal({ onClose });
    fireEvent.click(screen.getByTestId('worker-export-submit-btn'));
    await waitFor(() => expect(onClose).toHaveBeenCalledTimes(1));
  });

  it('shows API error message when export fails', async () => {
    mockExportWorkers.mockRejectedValueOnce(new Error('500 Internal Server Error'));
    renderModal();
    fireEvent.click(screen.getByTestId('worker-export-submit-btn'));
    await waitFor(() => {
      expect(screen.getByTestId('export-api-error')).toBeInTheDocument();
    });
  });
});
