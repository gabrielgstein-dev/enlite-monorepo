import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { KanbanCard } from '../KanbanCard';

// ── i18n mock — always returns key so we can assert exact i18n paths ─────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ── Typography mock ──────────────────────────────────────────────────────────
vi.mock('@presentation/components/atoms/Typography', () => ({
  Typography: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <span {...props}>{children}</span>
  ),
}));

// ── lucide-react mock ────────────────────────────────────────────────────────
vi.mock('lucide-react', () => ({
  MapPin: (props: Record<string, unknown>) => <svg data-testid="icon-map-pin" {...props} />,
  Phone: (props: Record<string, unknown>) => <svg data-testid="icon-phone" {...props} />,
  Star: (props: Record<string, unknown>) => <svg data-testid="icon-star" {...props} />,
}));

// ── Default props ────────────────────────────────────────────────────────────

const defaultProps = {
  id: 'enc-1',
  workerName: 'Ana Martínez',
  workerPhone: '+54 11 5555-1234',
  occupation: 'Acompañante Terapéutico',
  workZone: 'Palermo',
  matchScore: 92,
  talentumStatus: null as string | null,
  rejectionReasonCategory: null as string | null,
  interviewDate: null as string | null,
  interviewTime: null as string | null,
};

// ── Visual Rendering ─────────────────────────────────────────────────────────

describe('KanbanCard — visual rendering', () => {
  it('renders worker name', () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText('Ana Martínez')).toBeInTheDocument();
  });

  it('renders i18n fallback key when worker name is null', () => {
    render(<KanbanCard {...defaultProps} workerName={null} />);
    // i18n mock returns the key: admin.kanban.noName
    expect(screen.getByText('admin.kanban.noName')).toBeInTheDocument();
  });

  it('renders match score with star icon', () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByTestId('icon-star')).toBeInTheDocument();
    expect(screen.getByText('92')).toBeInTheDocument();
  });

  it('does not render match score when null', () => {
    render(<KanbanCard {...defaultProps} matchScore={null} />);
    expect(screen.queryByTestId('icon-star')).not.toBeInTheDocument();
  });

  it('renders occupation badge', () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByText('Acompañante Terapéutico')).toBeInTheDocument();
  });

  it('does not render occupation when null', () => {
    render(<KanbanCard {...defaultProps} occupation={null} />);
    expect(screen.queryByText('Acompañante Terapéutico')).not.toBeInTheDocument();
  });

  it('renders phone number with icon', () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByTestId('icon-phone')).toBeInTheDocument();
    expect(screen.getByText('+54 11 5555-1234')).toBeInTheDocument();
  });

  it('does not render phone when null', () => {
    render(<KanbanCard {...defaultProps} workerPhone={null} />);
    expect(screen.queryByTestId('icon-phone')).not.toBeInTheDocument();
  });

  it('renders work zone with map pin icon', () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByTestId('icon-map-pin')).toBeInTheDocument();
    expect(screen.getByText('Palermo')).toBeInTheDocument();
  });

  it('does not render work zone when null', () => {
    render(<KanbanCard {...defaultProps} workZone={null} />);
    expect(screen.queryByTestId('icon-map-pin')).not.toBeInTheDocument();
  });

  it('renders interview date formatted as es-AR locale', () => {
    render(<KanbanCard {...defaultProps} interviewDate="2026-03-15T12:00:00" />);
    // es-AR format: d/m/yyyy — using midday to avoid timezone shifts
    expect(screen.getByText(/15\/3\/2026/)).toBeInTheDocument();
  });

  it('renders interview date with time when provided', () => {
    render(<KanbanCard {...defaultProps} interviewDate="2026-03-15T12:00:00" interviewTime="10:30" />);
    expect(screen.getByText(/15\/3\/2026.*10:30/)).toBeInTheDocument();
  });

  it('does not render interview date when null', () => {
    render(<KanbanCard {...defaultProps} interviewDate={null} />);
    expect(screen.queryByText(/\/.*\//)).not.toBeInTheDocument();
  });
});

// ── Talentum Status Badges ───────────────────────────────────────────────────

describe('KanbanCard — talentum status badges', () => {
  it('renders talentum badge when talentumStatus is provided', () => {
    render(<KanbanCard {...defaultProps} talentumStatus="INITIATED" />);
    expect(screen.getByTestId('talentum-badge')).toBeInTheDocument();
  });

  it('does not render talentum badge when talentumStatus is null', () => {
    render(<KanbanCard {...defaultProps} talentumStatus={null} />);
    expect(screen.queryByTestId('talentum-badge')).not.toBeInTheDocument();
  });

  it.each([
    ['INITIATED', 'admin.kanban.talentumStatus.INITIATED'],
    ['IN_PROGRESS', 'admin.kanban.talentumStatus.IN_PROGRESS'],
    ['COMPLETED', 'admin.kanban.talentumStatus.COMPLETED'],
    ['QUALIFIED', 'admin.kanban.talentumStatus.QUALIFIED'],
    ['IN_DOUBT', 'admin.kanban.talentumStatus.IN_DOUBT'],
    ['NOT_QUALIFIED', 'admin.kanban.talentumStatus.NOT_QUALIFIED'],
  ])('renders correct i18n key for %s status', (status, expectedKey) => {
    render(<KanbanCard {...defaultProps} talentumStatus={status} />);
    const badge = screen.getByTestId('talentum-badge');
    expect(badge).toHaveTextContent(expectedKey);
  });

  it.each([
    ['INITIATED', 'bg-slate-100'],
    ['IN_PROGRESS', 'bg-amber-50'],
    ['COMPLETED', 'bg-blue-50'],
    ['QUALIFIED', 'bg-green-50'],
    ['IN_DOUBT', 'bg-orange-50'],
    ['NOT_QUALIFIED', 'bg-red-50'],
  ])('applies correct CSS class for %s status badge', (status, expectedBg) => {
    render(<KanbanCard {...defaultProps} talentumStatus={status} />);
    const badge = screen.getByTestId('talentum-badge');
    expect(badge.className).toContain(expectedBg);
  });

  it('does not render badge for unknown talentum status', () => {
    render(<KanbanCard {...defaultProps} talentumStatus="UNKNOWN_STATUS" />);
    expect(screen.queryByTestId('talentum-badge')).not.toBeInTheDocument();
  });
});

// ── Rejection Reason Badges ──────────────────────────────────────────────────

describe('KanbanCard — rejection reason badges', () => {
  it('renders rejection badge when category is provided', () => {
    render(<KanbanCard {...defaultProps} rejectionReasonCategory="DISTANCE" />);
    expect(screen.getByTestId('rejection-badge')).toBeInTheDocument();
  });

  it('does not render rejection badge when category is null', () => {
    render(<KanbanCard {...defaultProps} rejectionReasonCategory={null} />);
    expect(screen.queryByTestId('rejection-badge')).not.toBeInTheDocument();
  });

  it('uses i18n key for rejection categories', () => {
    render(<KanbanCard {...defaultProps} rejectionReasonCategory="TALENTUM_NOT_QUALIFIED" />);
    const badge = screen.getByTestId('rejection-badge');
    expect(badge).toHaveTextContent('admin.kanban.rejectionLabels.TALENTUM_NOT_QUALIFIED');
  });

  it('uses i18n key pattern for any rejection category', () => {
    render(<KanbanCard {...defaultProps} rejectionReasonCategory="DISTANCE" />);
    const badge = screen.getByTestId('rejection-badge');
    expect(badge).toHaveTextContent('admin.kanban.rejectionLabels.DISTANCE');
  });
});

// ── Combined Scenarios ───────────────────────────────────────────────────────

describe('KanbanCard — combined scenarios', () => {
  it('renders card with talentum badge AND rejection reason simultaneously', () => {
    render(
      <KanbanCard
        {...defaultProps}
        talentumStatus="NOT_QUALIFIED"
        rejectionReasonCategory="TALENTUM_NOT_QUALIFIED"
      />,
    );
    expect(screen.getByTestId('talentum-badge')).toBeInTheDocument();
    expect(screen.getByTestId('rejection-badge')).toBeInTheDocument();
  });

  it('renders minimal card with all optional fields null', () => {
    render(
      <KanbanCard
        id="minimal"
        workerName={null}
        workerPhone={null}
        occupation={null}
        workZone={null}
        matchScore={null}
        talentumStatus={null}
        rejectionReasonCategory={null}
        interviewDate={null}
        interviewTime={null}
      />,
    );
    // Should still render with fallback name
    expect(screen.getByText('admin.kanban.noName')).toBeInTheDocument();
    // No optional elements
    expect(screen.queryByTestId('icon-phone')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-map-pin')).not.toBeInTheDocument();
    expect(screen.queryByTestId('icon-star')).not.toBeInTheDocument();
    expect(screen.queryByTestId('talentum-badge')).not.toBeInTheDocument();
    expect(screen.queryByTestId('rejection-badge')).not.toBeInTheDocument();
  });
});
