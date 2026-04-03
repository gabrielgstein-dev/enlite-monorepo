/**
 * VacancyStatsCards.test.tsx
 *
 * Garante visualmente que os stat cards:
 * - Exibem skeleton quando stats é null ou vazio
 * - Renderizam cards com dados reais
 * - Usam layout flex responsivo (flex-1, não largura fixa)
 * - Usam ícones lucide-react (SVG), não SVGs inline customizados
 */

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VacancyStatsCards } from '../VacancyStatsCards';

// ── Fixtures ──────────────────────────────────────────────────────────────

const MOCK_STATS = [
  { label: '+7 días', value: '2', icon: 'clock' },
  { label: '+24 días', value: '5', icon: 'clock' },
  { label: 'En selección', value: '10', icon: 'user-check' },
  { label: 'Total', value: '44', icon: 'user-search' },
];

// ── Skeleton / loading state ──────────────────────────────────────────────

describe('VacancyStatsCards — skeleton state', () => {
  it('renders skeleton cards when stats is null', () => {
    const { container } = render(<VacancyStatsCards stats={null} />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('renders skeleton cards when stats is empty array', () => {
    const { container } = render(<VacancyStatsCards stats={[]} />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
  });

  it('does NOT render skeleton when stats has data', () => {
    const { container } = render(<VacancyStatsCards stats={MOCK_STATS} />);

    const skeletons = container.querySelectorAll('.animate-pulse');
    expect(skeletons).toHaveLength(0);
  });
});

// ── Data rendering ────────────────────────────────────────────────────────

describe('VacancyStatsCards — data rendering', () => {
  it('renders all stat labels', () => {
    render(<VacancyStatsCards stats={MOCK_STATS} />);

    expect(screen.getByText('+7 días')).toBeInTheDocument();
    expect(screen.getByText('+24 días')).toBeInTheDocument();
    expect(screen.getByText('En selección')).toBeInTheDocument();
    expect(screen.getByText('Total')).toBeInTheDocument();
  });

  it('renders all stat values', () => {
    render(<VacancyStatsCards stats={MOCK_STATS} />);

    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('10')).toBeInTheDocument();
    expect(screen.getByText('44')).toBeInTheDocument();
  });

  it('renders correct number of stat cards', () => {
    const { container } = render(<VacancyStatsCards stats={MOCK_STATS} />);

    // Each stat card has bg-primary and flex-1
    const cards = container.querySelectorAll('.bg-primary.flex-1');
    expect(cards).toHaveLength(4);
  });
});

// ── GARANTIA VISUAL: layout flex responsivo ───────────────────────────────

describe('VacancyStatsCards — responsive flex layout', () => {
  it('CRITICAL: cards use flex-1 (not fixed width w-[288px])', () => {
    const { container } = render(<VacancyStatsCards stats={MOCK_STATS} />);

    const cards = container.querySelectorAll('.bg-primary');
    cards.forEach((card) => {
      expect(card.className).toContain('flex-1');
      expect(card.className).not.toContain('w-[288px]');
    });
  });

  it('CRITICAL: container has responsive flex-col sm:flex-row', () => {
    const { container } = render(<VacancyStatsCards stats={MOCK_STATS} />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex-col');
    expect(wrapper.className).toContain('sm:flex-row');
  });

  it('skeleton container also has responsive flex-col sm:flex-row', () => {
    const { container } = render(<VacancyStatsCards stats={null} />);

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper.className).toContain('flex-col');
    expect(wrapper.className).toContain('sm:flex-row');
  });
});

// ── GARANTIA VISUAL: ícones lucide (SVG), não SVGs inline ─────────────────

describe('VacancyStatsCards — uses lucide-react icons', () => {
  it('CRITICAL: renders SVG icons inside stat cards', () => {
    const { container } = render(<VacancyStatsCards stats={MOCK_STATS} />);

    const svgs = container.querySelectorAll('svg');
    // Cada card deve ter pelo menos 1 SVG (o ícone lucide)
    expect(svgs.length).toBeGreaterThanOrEqual(MOCK_STATS.length);
  });

  it('CRITICAL: does NOT use custom inline SVG paths (old implementation)', () => {
    const { container } = render(<VacancyStatsCards stats={MOCK_STATS} />);

    // Old implementation had SVGs with specific stroke paths like "M12 22C17.5228..."
    // Lucide icons have different path structures
    const html = container.innerHTML;
    expect(html).not.toContain('M12 22C17.5228 22 22 17.5228 22 12C22 6.47715');
    expect(html).not.toContain('M3.41003 22C3.41003 18.13');
  });
});
