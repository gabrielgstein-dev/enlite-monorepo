import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
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
  CalendarClock: (props: Record<string, unknown>) => <svg data-testid="icon-calendar-clock" {...props} />,
  MapPin: (props: Record<string, unknown>) => <svg data-testid="icon-map-pin" {...props} />,
  Phone: (props: Record<string, unknown>) => <svg data-testid="icon-phone" {...props} />,
  Star: (props: Record<string, unknown>) => <svg data-testid="icon-star" {...props} />,
}));

// ── Default props ────────────────────────────────────────────────────────────

const defaultProps = {
  id: 'enc-1',
  workerId: null as string | null,
  workerName: 'Ana Martínez',
  workerPhone: '5491155551234',
  occupation: 'Acompañante Terapéutico',
  workZone: 'Palermo',
  matchScore: 92,
  talentumStatus: null as string | null,
  rejectionReasonCategory: null as string | null,
  interviewDate: null as string | null,
  interviewTime: null as string | null,
  stage: 'COMPLETED',
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

  it('renders formatted phone number with icon', () => {
    render(<KanbanCard {...defaultProps} />);
    expect(screen.getByTestId('icon-phone')).toBeInTheDocument();
    // formatPhoneDisplay('5491155551234') → '+54 9 11 5555-1234'
    expect(screen.getByText('+54 9 11 5555-1234')).toBeInTheDocument();
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
        workerId={null}
        workerName={null}
        workerPhone={null}
        occupation={null}
        workZone={null}
        matchScore={null}
        talentumStatus={null}
        rejectionReasonCategory={null}
        interviewDate={null}
        interviewTime={null}
        stage="INVITED"
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

// ── Clickable Worker Name ───────────────────────────────────────────────────

describe('KanbanCard — clickable worker name', () => {
  it('renders name as a button when workerId and onWorkerClick are provided', () => {
    const onClick = vi.fn();
    render(
      <KanbanCard {...defaultProps} workerId="worker-42" onWorkerClick={onClick} />,
    );
    const button = screen.getByRole('button');
    expect(button).toBeInTheDocument();
    expect(button).toHaveTextContent('Ana Martínez');
  });

  it('does NOT render button when workerId is null', () => {
    const onClick = vi.fn();
    render(
      <KanbanCard {...defaultProps} workerId={null} onWorkerClick={onClick} />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
    // Name should still be visible as plain text
    expect(screen.getByText('Ana Martínez')).toBeInTheDocument();
  });

  it('does NOT render button when onWorkerClick is undefined', () => {
    render(
      <KanbanCard {...defaultProps} workerId="worker-42" />,
    );
    expect(screen.queryByRole('button')).not.toBeInTheDocument();
  });

  it('calls onWorkerClick with workerId when name is clicked', () => {
    const onClick = vi.fn();
    render(
      <KanbanCard {...defaultProps} workerId="worker-42" onWorkerClick={onClick} />,
    );
    fireEvent.click(screen.getByRole('button'));
    expect(onClick).toHaveBeenCalledTimes(1);
    expect(onClick).toHaveBeenCalledWith('worker-42');
  });

  it('does NOT call onWorkerClick when workerId is null even if button somehow clicked', () => {
    const onClick = vi.fn();
    render(
      <KanbanCard {...defaultProps} workerId={null} onWorkerClick={onClick} />,
    );
    // No button rendered, so click on name text
    fireEvent.click(screen.getByText('Ana Martínez'));
    expect(onClick).not.toHaveBeenCalled();
  });

  it('applies hover:underline class to clickable name', () => {
    const onClick = vi.fn();
    render(
      <KanbanCard {...defaultProps} workerId="worker-42" onWorkerClick={onClick} />,
    );
    const nameSpan = screen.getByText('Ana Martínez');
    expect(nameSpan.className).toContain('hover:underline');
  });
});

// ── Phone Formatting ────────────────────────────────────────────────────────

describe('KanbanCard — phone formatting by country', () => {
  it('formats Argentine phone (13 digits, starts with 54)', () => {
    render(<KanbanCard {...defaultProps} workerPhone="5491155551234" />);
    expect(screen.getByText('+54 9 11 5555-1234')).toBeInTheDocument();
  });

  it('formats Brazilian phone (13 digits, starts with 55)', () => {
    render(<KanbanCard {...defaultProps} workerPhone="5511999991234" />);
    expect(screen.getByText('+55 (11) 99999-1234')).toBeInTheDocument();
  });

  it('formats generic international phone (8+ digits)', () => {
    render(<KanbanCard {...defaultProps} workerPhone="34612345678" />);
    expect(screen.getByText('+34612345678')).toBeInTheDocument();
  });

  it('strips non-digit characters before formatting', () => {
    render(<KanbanCard {...defaultProps} workerPhone="+54-911-5555-1234" />);
    expect(screen.getByText('+54 9 11 5555-1234')).toBeInTheDocument();
  });

  it('returns raw value for short numbers (< 8 digits)', () => {
    render(<KanbanCard {...defaultProps} workerPhone="12345" />);
    expect(screen.getByText('12345')).toBeInTheDocument();
  });
});

// ── Interview Schedule Tag (CONFIRMED stage) ────────────────────────────────

describe('KanbanCard — interview schedule tag in CONFIRMED', () => {
  it('shows interview tag with CalendarClock icon when stage is CONFIRMED and interviewDate exists', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="CONFIRMED"
        interviewDate="2026-03-15T12:00:00"
        interviewTime="10:30"
      />,
    );
    expect(screen.getByTestId('icon-calendar-clock')).toBeInTheDocument();
    // Should show short date + time
    expect(screen.getByText(/mar.*10:30/i)).toBeInTheDocument();
  });

  it('shows interview tag with date only when interviewTime is null', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="CONFIRMED"
        interviewDate="2026-03-15T12:00:00"
        interviewTime={null}
      />,
    );
    expect(screen.getByTestId('icon-calendar-clock')).toBeInTheDocument();
    // Should show short date only (e.g. "15 mar")
    expect(screen.getByText(/15.*mar/i)).toBeInTheDocument();
  });

  it('does NOT show interview tag when stage is CONFIRMED but interviewDate is null', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="CONFIRMED"
        interviewDate={null}
        interviewTime={null}
      />,
    );
    expect(screen.queryByTestId('icon-calendar-clock')).not.toBeInTheDocument();
  });

  it('does NOT show interview tag when stage is COMPLETED (non-CONFIRMED)', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="COMPLETED"
        interviewDate="2026-03-15T12:00:00"
        interviewTime="10:30"
      />,
    );
    expect(screen.queryByTestId('icon-calendar-clock')).not.toBeInTheDocument();
  });

  it.each(['INVITED', 'INITIATED', 'IN_PROGRESS', 'SELECTED', 'REJECTED'])(
    'does NOT show interview tag when stage is %s',
    (stage) => {
      render(
        <KanbanCard
          {...defaultProps}
          stage={stage}
          interviewDate="2026-03-15T12:00:00"
          interviewTime="10:30"
        />,
      );
      expect(screen.queryByTestId('icon-calendar-clock')).not.toBeInTheDocument();
    },
  );

  it('shows interview tag with cyan styling', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="CONFIRMED"
        interviewDate="2026-03-15T12:00:00"
        interviewTime="10:30"
      />,
    );
    const tag = screen.getByTestId('icon-calendar-clock').closest('span')!;
    expect(tag.className).toContain('bg-cyan-50');
    expect(tag.className).toContain('text-cyan-700');
  });

  it('hides plain interview date text when stage is CONFIRMED (no duplication)', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="CONFIRMED"
        interviewDate="2026-03-15T12:00:00"
        interviewTime="10:30"
      />,
    );
    // The full date format (d/m/yyyy) used in non-CONFIRMED should NOT appear
    expect(screen.queryByText(/15\/3\/2026/)).not.toBeInTheDocument();
  });

  it('shows plain interview date text in non-CONFIRMED stages', () => {
    render(
      <KanbanCard
        {...defaultProps}
        stage="COMPLETED"
        interviewDate="2026-03-15T12:00:00"
        interviewTime="10:30"
      />,
    );
    // Full date format should appear
    expect(screen.getByText(/15\/3\/2026.*10:30/)).toBeInTheDocument();
  });
});
