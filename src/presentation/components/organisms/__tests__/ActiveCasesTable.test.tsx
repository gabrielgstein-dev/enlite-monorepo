import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { ActiveCasesTable } from '../ActiveCasesTable';
import type { ActiveCase } from '@domain/entities/RecruitmentData';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

describe('ActiveCasesTable', () => {
  const mockCases: ActiveCase[] = [
    {
      id: '442',
      name: 'Caso 442 - Test',
      status: 'BUSQUEDA',
      inicioBusqueda: '2024-01-15',
      inicioBusquedaObj: new Date('2024-01-15')
    },
    {
      id: '443',
      name: 'Caso 443 - Demo',
      status: 'REEMPLAZO',
      inicioBusqueda: '2024-01-20',
      inicioBusquedaObj: new Date('2024-01-20')
    }
  ];

  it('should render table with cases', () => {
    render(<ActiveCasesTable cases={mockCases} onCaseClick={vi.fn()} />);

    expect(screen.getByText('442')).toBeInTheDocument();
    expect(screen.getByText('443')).toBeInTheDocument();
    expect(screen.getByText('Caso 442 - Test')).toBeInTheDocument();
  });

  it('should call onCaseClick when row is clicked', () => {
    const onClickMock = vi.fn();
    render(<ActiveCasesTable cases={mockCases} onCaseClick={onClickMock} />);

    const firstRow = screen.getByText('442').closest('tr');
    if (firstRow) {
      fireEvent.click(firstRow);
    }

    expect(onClickMock).toHaveBeenCalledWith('442');
  });

  it('should apply red color class for cases with sel=0 or rem=0', () => {
    const reemplazosColors = { '442': 'red' as const };
    const { container } = render(
      <ActiveCasesTable 
        cases={mockCases} 
        onCaseClick={vi.fn()} 
        reemplazosColors={reemplazosColors}
      />
    );

    const firstRow = container.querySelector('tr[class*="bg-red"]');
    expect(firstRow).toBeInTheDocument();
  });

  it('should apply yellow color class for cases with sel>0, rem>0 but <10', () => {
    const reemplazosColors = { '442': 'yellow' as const };
    const { container } = render(
      <ActiveCasesTable 
        cases={mockCases} 
        onCaseClick={vi.fn()} 
        reemplazosColors={reemplazosColors}
      />
    );

    const firstRow = container.querySelector('tr[class*="bg-yellow"]');
    expect(firstRow).toBeInTheDocument();
  });

  it('should apply green color class for cases with sel>0, rem>0 and >=10', () => {
    const reemplazosColors = { '442': 'green' as const };
    const { container } = render(
      <ActiveCasesTable 
        cases={mockCases} 
        onCaseClick={vi.fn()} 
        reemplazosColors={reemplazosColors}
      />
    );

    const firstRow = container.querySelector('tr[class*="bg-green"]');
    expect(firstRow).toBeInTheDocument();
  });

  it('should render without colors when reemplazosColors is not provided', () => {
    const { container } = render(
      <ActiveCasesTable cases={mockCases} onCaseClick={vi.fn()} />
    );

    const rows = container.querySelectorAll('tbody tr');
    rows.forEach(row => {
      expect(row.className).not.toContain('bg-red');
      expect(row.className).not.toContain('bg-yellow');
      expect(row.className).not.toContain('bg-green');
    });
  });

  it('should sort cases by id when header is clicked', () => {
    render(<ActiveCasesTable cases={mockCases} onCaseClick={vi.fn()} />);

    const headers = screen.getAllByRole('columnheader');
    const idHeader = headers[0];
    fireEvent.click(idHeader);

    const rows = screen.getAllByRole('row');
    expect(rows[1]).toHaveTextContent('442');
  });
});
