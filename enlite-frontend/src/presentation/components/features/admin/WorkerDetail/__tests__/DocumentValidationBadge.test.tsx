import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { DocumentValidationBadge } from '../DocumentValidationBadge';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const noopFn = vi.fn().mockResolvedValue(undefined);

describe('DocumentValidationBadge', () => {
  // ── No document uploaded ───────────────────────────────────────────────────

  it('renders nothing when hasDocument is false', () => {
    const { container } = render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={false}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  // ── Uploaded, not validated ────────────────────────────────────────────────

  it('renders validate button when document is uploaded but not validated', () => {
    render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    const btn = screen.getByTestId('validate-btn-resume_cv');
    expect(btn).toBeInTheDocument();
    expect(btn.textContent).toContain('admin.workerDetail.validateDoc');
  });

  it('opens confirmation modal when validate button is clicked', () => {
    render(
      <DocumentValidationBadge
        docType="criminal_record"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('validate-btn-criminal_record'));
    expect(screen.getByTestId('confirm-validation-modal')).toBeInTheDocument();
  });

  it('does not call onValidate directly when validate button is clicked', () => {
    const onValidate = vi.fn().mockResolvedValue(undefined);
    render(
      <DocumentValidationBadge
        docType="criminal_record"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={onValidate}
        onInvalidate={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('validate-btn-criminal_record'));
    expect(onValidate).not.toHaveBeenCalled();
  });

  it('calls onValidate with docType when confirm button is clicked in modal', async () => {
    const onValidate = vi.fn().mockResolvedValue(undefined);
    render(
      <DocumentValidationBadge
        docType="criminal_record"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={onValidate}
        onInvalidate={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('validate-btn-criminal_record'));
    fireEvent.click(screen.getByTestId('confirm-validation-btn'));
    await waitFor(() => {
      expect(onValidate).toHaveBeenCalledWith('criminal_record');
    });
  });

  it('closes modal when cancel button is clicked', () => {
    render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('validate-btn-resume_cv'));
    expect(screen.getByTestId('confirm-validation-modal')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('cancel-validation-btn'));
    expect(screen.queryByTestId('confirm-validation-modal')).not.toBeInTheDocument();
  });

  it('closes modal when overlay is clicked', () => {
    render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('validate-btn-resume_cv'));
    fireEvent.click(screen.getByTestId('confirm-validation-modal'));
    expect(screen.queryByTestId('confirm-validation-modal')).not.toBeInTheDocument();
  });

  it('closes modal on Escape key press', () => {
    render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('validate-btn-resume_cv'));
    expect(screen.getByTestId('confirm-validation-modal')).toBeInTheDocument();
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(screen.queryByTestId('confirm-validation-modal')).not.toBeInTheDocument();
  });

  it('disables validate button when isLoading is true', () => {
    render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={true}
        isLoading={true}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    expect(screen.getByTestId('validate-btn-resume_cv')).toBeDisabled();
  });

  // ── Uploaded and validated ─────────────────────────────────────────────────

  it('renders validated badge when validation entry is provided', () => {
    render(
      <DocumentValidationBadge
        docType="identity_document"
        validation={{ validatedBy: 'admin@enlite.com', validatedAt: '2026-04-12T10:00:00Z' }}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    const badge = screen.getByTestId('validation-badge-identity_document');
    expect(badge).toBeInTheDocument();
    expect(badge.textContent).toContain('admin.workerDetail.validatedBy');
    expect(badge.textContent).toContain('admin@enlite.com');
  });

  it('renders remove validation button inside validated badge', () => {
    render(
      <DocumentValidationBadge
        docType="identity_document"
        validation={{ validatedBy: 'admin@enlite.com', validatedAt: '2026-04-12T10:00:00Z' }}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    const removeBtn = screen.getByLabelText('admin.workerDetail.removeValidation');
    expect(removeBtn).toBeInTheDocument();
  });

  it('calls onInvalidate with docType when remove button is clicked', () => {
    const onInvalidate = vi.fn().mockResolvedValue(undefined);
    render(
      <DocumentValidationBadge
        docType="identity_document"
        validation={{ validatedBy: 'admin@enlite.com', validatedAt: '2026-04-12T10:00:00Z' }}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={onInvalidate}
      />,
    );
    fireEvent.click(screen.getByLabelText('admin.workerDetail.removeValidation'));
    expect(onInvalidate).toHaveBeenCalledWith('identity_document');
  });

  it('disables remove validation button when isLoading is true', () => {
    render(
      <DocumentValidationBadge
        docType="identity_document"
        validation={{ validatedBy: 'admin@enlite.com', validatedAt: '2026-04-12T10:00:00Z' }}
        hasDocument={true}
        isLoading={true}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    expect(screen.getByLabelText('admin.workerDetail.removeValidation')).toBeDisabled();
  });

  it('applies green badge styling on validated state', () => {
    render(
      <DocumentValidationBadge
        docType="identity_document"
        validation={{ validatedBy: 'admin@enlite.com', validatedAt: '2026-04-12T10:00:00Z' }}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    const badge = screen.getByTestId('validation-badge-identity_document');
    expect(badge.className).toContain('bg-green-50');
    expect(badge.className).toContain('border-green-200');
  });

  it('does not render validated badge when validation is undefined', () => {
    render(
      <DocumentValidationBadge
        docType="resume_cv"
        validation={undefined}
        hasDocument={true}
        isLoading={false}
        onValidate={noopFn}
        onInvalidate={noopFn}
      />,
    );
    expect(screen.queryByTestId('validation-badge-resume_cv')).not.toBeInTheDocument();
  });
});
