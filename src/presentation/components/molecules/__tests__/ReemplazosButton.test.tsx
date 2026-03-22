import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ReemplazosButton } from '../ReemplazosButton';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ReemplazosButton', () => {
  it('should render with initial state', () => {
    render(
      <ReemplazosButton onClick={vi.fn()} isCalculating={false} hasCalculated={false} />
    );

    expect(screen.getByText(/admin.recruitment.calculateReemplazos/)).toBeInTheDocument();
  });

  it('should show calculating state', () => {
    render(
      <ReemplazosButton onClick={vi.fn()} isCalculating={true} hasCalculated={false} />
    );

    expect(screen.getByText(/admin.recruitment.calculating/)).toBeInTheDocument();
    const button = screen.getByRole('button');
    expect(button).toBeDisabled();
  });

  it('should show recalculate state after calculation', () => {
    render(
      <ReemplazosButton onClick={vi.fn()} isCalculating={false} hasCalculated={true} />
    );

    expect(screen.getByText(/admin.recruitment.recalculate/)).toBeInTheDocument();
  });

  it('should call onClick when clicked', () => {
    const onClickMock = vi.fn();
    render(
      <ReemplazosButton onClick={onClickMock} isCalculating={false} hasCalculated={false} />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onClickMock).toHaveBeenCalledTimes(1);
  });

  it('should not call onClick when disabled', () => {
    const onClickMock = vi.fn();
    render(
      <ReemplazosButton onClick={onClickMock} isCalculating={true} hasCalculated={false} />
    );

    const button = screen.getByRole('button');
    fireEvent.click(button);

    expect(onClickMock).not.toHaveBeenCalled();
  });

  it('should have primary variant when not calculated', () => {
    const { container } = render(
      <ReemplazosButton onClick={vi.fn()} isCalculating={false} hasCalculated={false} />
    );

    const button = container.querySelector('button');
    expect(button?.className).toContain('primary');
  });

  it('should have outline variant when calculated', () => {
    const { container } = render(
      <ReemplazosButton onClick={vi.fn()} isCalculating={false} hasCalculated={true} />
    );

    const button = container.querySelector('button');
    expect(button?.className).toContain('bg-transparent');
  });
});
