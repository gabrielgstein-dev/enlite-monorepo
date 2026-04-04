import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { WorkerAvailabilityCard } from '../WorkerAvailabilityCard';

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}));

vi.mock('lucide-react', () => ({
  Clock: () => <svg data-testid="clock-icon" />,
}));

interface AvailabilitySlot {
  id: string;
  dayOfWeek: number;
  startTime: string;
  endTime: string;
  timezone: string;
  crossesMidnight: boolean;
}

const mondaySlot: AvailabilitySlot = {
  id: 'slot-1',
  dayOfWeek: 1,
  startTime: '09:00:00',
  endTime: '17:00:00',
  timezone: 'America/Argentina/Buenos_Aires',
  crossesMidnight: false,
};

const wednesdaySlotA: AvailabilitySlot = {
  id: 'slot-2',
  dayOfWeek: 3,
  startTime: '08:00:00',
  endTime: '12:00:00',
  timezone: 'America/Argentina/Buenos_Aires',
  crossesMidnight: false,
};

const wednesdaySlotB: AvailabilitySlot = {
  id: 'slot-3',
  dayOfWeek: 3,
  startTime: '14:00:00',
  endTime: '18:00:00',
  timezone: 'America/Argentina/Buenos_Aires',
  crossesMidnight: false,
};

const sundaySlot: AvailabilitySlot = {
  id: 'slot-4',
  dayOfWeek: 0,
  startTime: '10:00:00',
  endTime: '14:00:00',
  timezone: 'America/Argentina/Buenos_Aires',
  crossesMidnight: false,
};

const saturdaySlot: AvailabilitySlot = {
  id: 'slot-5',
  dayOfWeek: 6,
  startTime: '09:00:00',
  endTime: '13:00:00',
  timezone: 'America/Argentina/Buenos_Aires',
  crossesMidnight: false,
};

describe('WorkerAvailabilityCard', () => {
  // ── Empty state ────────────────────────────────────────────────────────────

  it('renders card title when availability is empty', () => {
    render(<WorkerAvailabilityCard availability={[]} />);
    expect(screen.getByText('admin.workerDetail.tabs.availability')).toBeInTheDocument();
  });

  it('renders noAvailability message when availability is empty', () => {
    render(<WorkerAvailabilityCard availability={[]} />);
    expect(screen.getByText('admin.workerDetail.noAvailability')).toBeInTheDocument();
  });

  it('does not render any time slots when availability is empty', () => {
    render(<WorkerAvailabilityCard availability={[]} />);
    expect(screen.queryByTestId('clock-icon')).not.toBeInTheDocument();
  });

  // ── Populated state ────────────────────────────────────────────────────────

  it('renders card title when slots are present', () => {
    render(<WorkerAvailabilityCard availability={[mondaySlot]} />);
    expect(screen.getByText('admin.workerDetail.tabs.availability')).toBeInTheDocument();
  });

  it('does not render noAvailability message when slots are present', () => {
    render(<WorkerAvailabilityCard availability={[mondaySlot]} />);
    expect(screen.queryByText('admin.workerDetail.noAvailability')).not.toBeInTheDocument();
  });

  // ── Day name i18n keys ─────────────────────────────────────────────────────

  it('renders the correct day i18n key for monday slot', () => {
    render(<WorkerAvailabilityCard availability={[mondaySlot]} />);
    expect(screen.getByText('workerRegistration.availability.monday')).toBeInTheDocument();
  });

  it('renders the correct day i18n key for wednesday slot', () => {
    render(<WorkerAvailabilityCard availability={[wednesdaySlotA]} />);
    expect(screen.getByText('workerRegistration.availability.wednesday')).toBeInTheDocument();
  });

  it('renders the correct day i18n key for sunday slot', () => {
    render(<WorkerAvailabilityCard availability={[sundaySlot]} />);
    expect(screen.getByText('workerRegistration.availability.sunday')).toBeInTheDocument();
  });

  it('renders the correct day i18n key for saturday slot', () => {
    render(<WorkerAvailabilityCard availability={[saturdaySlot]} />);
    expect(screen.getByText('workerRegistration.availability.saturday')).toBeInTheDocument();
  });

  it('only renders day rows for days that have slots', () => {
    render(<WorkerAvailabilityCard availability={[mondaySlot]} />);
    expect(screen.queryByText('workerRegistration.availability.tuesday')).not.toBeInTheDocument();
    expect(screen.queryByText('workerRegistration.availability.sunday')).not.toBeInTheDocument();
  });

  // ── Time formatting ────────────────────────────────────────────────────────

  it('formats startTime and endTime by stripping seconds', () => {
    render(<WorkerAvailabilityCard availability={[mondaySlot]} />);
    expect(screen.getByText('09:00 – 17:00')).toBeInTheDocument();
  });

  it('formats times correctly for a second slot', () => {
    render(<WorkerAvailabilityCard availability={[wednesdaySlotA]} />);
    expect(screen.getByText('08:00 – 12:00')).toBeInTheDocument();
  });

  // ── Multiple slots per day ─────────────────────────────────────────────────

  it('renders multiple time slots for the same day', () => {
    render(<WorkerAvailabilityCard availability={[wednesdaySlotA, wednesdaySlotB]} />);
    expect(screen.getByText('08:00 – 12:00')).toBeInTheDocument();
    expect(screen.getByText('14:00 – 18:00')).toBeInTheDocument();
  });

  it('renders only one day row when two slots share the same day', () => {
    render(<WorkerAvailabilityCard availability={[wednesdaySlotA, wednesdaySlotB]} />);
    const dayLabels = screen.getAllByText('workerRegistration.availability.wednesday');
    expect(dayLabels.length).toBe(1);
  });

  it('renders clock icons for each slot', () => {
    render(<WorkerAvailabilityCard availability={[wednesdaySlotA, wednesdaySlotB]} />);
    const icons = screen.getAllByTestId('clock-icon');
    expect(icons.length).toBe(2);
  });

  // ── Day ordering ───────────────────────────────────────────────────────────

  it('renders sunday before saturday when both are present', () => {
    render(<WorkerAvailabilityCard availability={[saturdaySlot, sundaySlot]} />);
    const sunday = screen.getByText('workerRegistration.availability.sunday');
    const saturday = screen.getByText('workerRegistration.availability.saturday');
    expect(sunday.compareDocumentPosition(saturday)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
  });

  it('renders all days across the week when slots span multiple days', () => {
    render(<WorkerAvailabilityCard availability={[sundaySlot, mondaySlot, wednesdaySlotA, saturdaySlot]} />);
    expect(screen.getByText('workerRegistration.availability.sunday')).toBeInTheDocument();
    expect(screen.getByText('workerRegistration.availability.monday')).toBeInTheDocument();
    expect(screen.getByText('workerRegistration.availability.wednesday')).toBeInTheDocument();
    expect(screen.getByText('workerRegistration.availability.saturday')).toBeInTheDocument();
    expect(screen.queryByText('workerRegistration.availability.tuesday')).not.toBeInTheDocument();
    expect(screen.queryByText('workerRegistration.availability.thursday')).not.toBeInTheDocument();
    expect(screen.queryByText('workerRegistration.availability.friday')).not.toBeInTheDocument();
  });
});
