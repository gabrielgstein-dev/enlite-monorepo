import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ConfirmValidationModal } from '../ConfirmValidationModal';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

const noopFn = vi.fn();

describe('ConfirmValidationModal', () => {
  // ── Visibility ─────────────────────────────────────────────────────────────

  it('renders nothing when isOpen is false', () => {
    const { container } = render(
      <ConfirmValidationModal
        isOpen={false}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(container.firstChild).toBeNull();
  });

  it('renders modal overlay when isOpen is true', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(screen.getByTestId('confirm-validation-modal')).toBeInTheDocument();
  });

  // ── Content ────────────────────────────────────────────────────────────────

  it('renders title with i18n key', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(
      screen.getByText('admin.workerDetail.validateDocTitle'),
    ).toBeInTheDocument();
  });

  it('renders body text with i18n key', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(
      screen.getByText('admin.workerDetail.validateDocBody'),
    ).toBeInTheDocument();
  });

  it('renders confirm and cancel buttons', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(screen.getByTestId('confirm-validation-btn')).toBeInTheDocument();
    expect(screen.getByTestId('cancel-validation-btn')).toBeInTheDocument();
  });

  // ── Interactions ───────────────────────────────────────────────────────────

  it('calls onConfirm when confirm button is clicked', () => {
    const onConfirm = vi.fn();
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={onConfirm}
        onCancel={noopFn}
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-validation-btn'));
    expect(onConfirm).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when cancel button is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('cancel-validation-btn'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('calls onCancel when overlay is clicked', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={onCancel}
      />,
    );
    fireEvent.click(screen.getByTestId('confirm-validation-modal'));
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel when clicking inside the card', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={onCancel}
      />,
    );
    // Click on the title which is inside the card
    fireEvent.click(screen.getByText('admin.workerDetail.validateDocTitle'));
    expect(onCancel).not.toHaveBeenCalled();
  });

  it('calls onCancel when Escape key is pressed', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
  });

  it('does not call onCancel on other key presses', () => {
    const onCancel = vi.fn();
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={onCancel}
      />,
    );
    fireEvent.keyDown(document, { key: 'Enter' });
    expect(onCancel).not.toHaveBeenCalled();
  });

  // ── Loading state ──────────────────────────────────────────────────────────

  it('disables confirm button when isLoading is true', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={true}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(screen.getByTestId('confirm-validation-btn')).toBeDisabled();
  });

  it('disables cancel button when isLoading is true', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={true}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(screen.getByTestId('cancel-validation-btn')).toBeDisabled();
  });

  it('shows loading text in confirm button when isLoading is true', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={true}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    const confirmBtn = screen.getByTestId('confirm-validation-btn');
    expect(confirmBtn.textContent).toContain('common.loading');
  });

  it('shows confirm text in button when isLoading is false', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    const confirmBtn = screen.getByTestId('confirm-validation-btn');
    expect(confirmBtn.textContent).toContain(
      'admin.workerDetail.confirmValidation',
    );
  });

  // ── Accessibility ──────────────────────────────────────────────────────────

  it('has role=dialog on overlay', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(screen.getByRole('dialog')).toBeInTheDocument();
  });

  it('has aria-modal=true', () => {
    render(
      <ConfirmValidationModal
        isOpen={true}
        isLoading={false}
        onConfirm={noopFn}
        onCancel={noopFn}
      />,
    );
    expect(screen.getByRole('dialog')).toHaveAttribute('aria-modal', 'true');
  });
});
