/**
 * VacanciesTable.visual.test.tsx
 *
 * Testes visuais/estruturais que GARANTEM:
 * - Ícone Eye é do lucide-react (SVG), não uma <img> externa
 * - Colunas numéricas são ocultas em mobile (hidden md:table-cell)
 * - min-width da tabela é 500px (não 900px)
 * - Colunas essenciais (caso, status, grau) sempre visíveis
 */

import { describe, it, expect } from 'vitest';
import { render } from '@testing-library/react';
import { VacanciesTable } from '../VacanciesTable';

const MOCK_VACANCIES = [
  {
    id: '1',
    caso: 'Caso 100',
    status: 'Activo',
    grau: 'Grave',
    grauColor: 'text-[#f9a000]',
    diasAberto: '05',
    convidados: '10',
    postulados: '5',
    selecionados: '3',
    faltantes: '2',
  },
];

// ── GARANTIA 1: Eye icon é SVG lucide, não <img> ─────────────────────────

describe('VacanciesTable — Eye icon', () => {
  it('CRITICAL: uses SVG icon (lucide Eye), not external <img>', () => {
    const { container } = render(<VacanciesTable vacancies={MOCK_VACANCIES} />);

    // Não deve ter <img> com alt="View" ou src contendo "eye"
    const eyeImages = container.querySelectorAll('img[alt="View"]');
    expect(eyeImages).toHaveLength(0);

    const eyeImgSrc = container.querySelectorAll('img[src*="eye"]');
    expect(eyeImgSrc).toHaveLength(0);

    // Deve ter SVG (lucide Eye icon) na primeira coluna
    const firstRow = container.querySelector('[class*="h-[72px]"]');
    expect(firstRow).toBeTruthy();

    const svgs = firstRow!.querySelectorAll('svg');
    expect(svgs.length).toBeGreaterThanOrEqual(1);
  });

  it('Eye icon has aria-label for accessibility', () => {
    const { container } = render(<VacanciesTable vacancies={MOCK_VACANCIES} />);

    const svgWithLabel = container.querySelector('svg[aria-label]');
    expect(svgWithLabel).toBeTruthy();
  });
});

// ── GARANTIA 2: Colunas responsivas (hidden md:table-cell) ────────────────

describe('VacanciesTable — responsive columns', () => {
  it('CRITICAL: numeric columns (invited, applicants, selected, missing) have hidden md:table-cell', () => {
    const { container } = render(<VacanciesTable vacancies={MOCK_VACANCIES} />);

    const row = container.querySelector('[class*="h-[72px]"]');
    expect(row).toBeTruthy();

    const cells = row!.querySelectorAll('td');
    // Columns: eye(0), caso(1), status(2), grau(3), convidados(4), postulados(5), selecionados(6), faltantes(7)
    // Cells 4-7 should be hidden on mobile
    for (let i = 4; i <= 7; i++) {
      expect(cells[i].className).toContain('hidden');
      expect(cells[i].className).toContain('md:table-cell');
    }
  });

  it('CRITICAL: essential columns (caso, status, grau) are always visible', () => {
    const { container } = render(<VacanciesTable vacancies={MOCK_VACANCIES} />);

    const row = container.querySelector('[class*="h-[72px]"]');
    const cells = row!.querySelectorAll('td');

    // Cells 0 (eye), 1 (caso), 2 (status), 3 (grau) should NOT have "hidden"
    for (let i = 0; i <= 3; i++) {
      expect(cells[i].className).not.toContain('hidden');
    }
  });

  it('table headers also have responsive hidden classes', () => {
    const { container } = render(<VacanciesTable vacancies={MOCK_VACANCIES} />);

    const headerCells = container.querySelectorAll('thead th');
    // Headers: empty(0), case(1), status(2), dependencyLevel(3), invited(4), applicants(5), selected(6), missing(7)
    // Headers 4-7 should be hidden on mobile
    for (let i = 4; i <= 7; i++) {
      expect(headerCells[i].className).toContain('hidden');
      expect(headerCells[i].className).toContain('md:table-cell');
    }
  });
});

// ── GARANTIA 3: min-width correta ─────────────────────────────────────────

describe('VacanciesTable — min-width', () => {
  it('CRITICAL: table has min-w-[500px], not min-w-[900px]', () => {
    const { container } = render(<VacanciesTable vacancies={MOCK_VACANCIES} />);

    const table = container.querySelector('table');
    expect(table).toBeTruthy();
    expect(table!.className).toContain('min-w-[500px]');
    expect(table!.className).not.toContain('min-w-[900px]');
  });
});

// ── GARANTIA 4: colSpan dinâmico no empty state ───────────────────────────

describe('VacanciesTable — empty state colspan', () => {
  it('empty state cell spans all columns dynamically', () => {
    const { container } = render(<VacanciesTable vacancies={[]} />);

    const emptyCell = container.querySelector('td[colspan]');
    expect(emptyCell).toBeTruthy();

    const colspan = parseInt(emptyCell!.getAttribute('colspan') || '0');
    // 7 columns + 1 eye column = 8
    expect(colspan).toBe(8);
  });
});
