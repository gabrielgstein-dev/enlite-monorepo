import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { Badge } from '../Badge';

describe('Badge', () => {
  it('renders completed status with correct icon', () => {
    const { container } = render(<Badge status="completed" />);
    expect(container.textContent).toContain('✅');
  });

  it('renders pending status with correct icon', () => {
    const { container } = render(<Badge status="pending" />);
    expect(container.textContent).toContain('⚠️');
  });

  it('renders locked status with correct icon', () => {
    const { container } = render(<Badge status="locked" />);
    expect(container.textContent).toContain('🔒');
  });

  it('applies correct color classes for each status', () => {
    const { container, rerender } = render(<Badge status="completed" />);
    expect(container.firstChild).toHaveClass('text-green-700', 'bg-green-50');

    rerender(<Badge status="pending" />);
    expect(container.firstChild).toHaveClass('text-amber-700', 'bg-amber-50');

    rerender(<Badge status="locked" />);
    expect(container.firstChild).toHaveClass('text-gray-600', 'bg-gray-100');
  });
});
