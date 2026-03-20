import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { ProgressBar } from '../ProgressBar';

describe('ProgressBar', () => {
  it('renders with correct percentage', () => {
    const { container } = render(<ProgressBar percentage={60} />);
    const progressFill = container.querySelector('[style*="width: 60%"]');
    expect(progressFill).toBeInTheDocument();
  });

  it('clamps percentage to 0-100 range', () => {
    const { container, rerender } = render(<ProgressBar percentage={150} />);
    let progressFill = container.querySelector('[style*="width: 100%"]');
    expect(progressFill).toBeInTheDocument();

    rerender(<ProgressBar percentage={-20} />);
    progressFill = container.querySelector('[style*="width: 0%"]');
    expect(progressFill).toBeInTheDocument();
  });

  it('shows label when showLabel is true', () => {
    render(<ProgressBar percentage={75} showLabel />);
    expect(screen.getByText('75% concluído')).toBeInTheDocument();
  });

  it('applies correct height class', () => {
    const { container, rerender } = render(<ProgressBar percentage={50} height="sm" />);
    let progressBar = container.querySelector('.h-2');
    expect(progressBar).toBeInTheDocument();

    rerender(<ProgressBar percentage={50} height="lg" />);
    progressBar = container.querySelector('.h-4');
    expect(progressBar).toBeInTheDocument();
  });
});
