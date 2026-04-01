import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import { KanbanBoard } from '../KanbanBoard';
import type { FunnelStages } from '@hooks/admin/useEncuadreFunnel';

// ── i18n mock — returns the key so we can assert exact i18n paths ────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, fallback?: string) => fallback ?? key,
  }),
}));

// ── dnd-kit mocks ────────────────────────────────────────────────────────────
let droppableIds: { id: string; disabled: boolean }[] = [];

vi.mock('@dnd-kit/core', () => ({
  DndContext: ({ children }: { children: React.ReactNode }) => <div data-testid="dnd-context">{children}</div>,
  DragOverlay: ({ children }: { children: React.ReactNode }) => <div data-testid="drag-overlay">{children}</div>,
  useSensor: vi.fn(),
  useSensors: vi.fn(() => []),
  PointerSensor: vi.fn(),
  closestCenter: vi.fn(),
  useDroppable: ({ id, disabled }: { id: string; disabled?: boolean }) => {
    droppableIds.push({ id, disabled: !!disabled });
    return { setNodeRef: vi.fn(), isOver: false };
  },
  useDraggable: ({ id }: { id: string }) => ({
    attributes: { 'data-draggable-id': id },
    listeners: {},
    setNodeRef: vi.fn(),
    transform: null,
    isDragging: false,
  }),
}));

// ── Typography mock (renders children directly) ──────────────────────────────
vi.mock('@presentation/components/atoms/Typography', () => ({
  Typography: ({ children, ...props }: { children: React.ReactNode; [k: string]: unknown }) => (
    <span {...props}>{children}</span>
  ),
}));

// ── Helpers ──────────────────────────────────────────────────────────────────

function makeEncuadre(overrides: Partial<FunnelStages['INVITED'][0]> = {}) {
  return {
    id: overrides.id ?? crypto.randomUUID(),
    workerName: 'María García',
    workerPhone: '+54 11 1234',
    occupation: 'AT',
    interviewDate: null,
    interviewTime: null,
    meetLink: null,
    resultado: null,
    attended: null,
    rejectionReasonCategory: null,
    rejectionReason: null,
    matchScore: 85,
    talentumStatus: null,
    workZone: 'Palermo',
    redireccionamiento: null,
    ...overrides,
  };
}

function emptyStages(): FunnelStages {
  return {
    INVITED: [],
    INITIATED: [],
    IN_PROGRESS: [],
    COMPLETED: [],
    CONFIRMED: [],
    INTERVIEWING: [],
    SELECTED: [],
    REJECTED: [],
    PENDING: [],
  };
}

const noop = vi.fn(async () => {});

// ── Setup ────────────────────────────────────────────────────────────────────

beforeEach(() => {
  droppableIds = [];
  vi.clearAllMocks();
});

// ── Visual Rendering ─────────────────────────────────────────────────────────

describe('KanbanBoard — column rendering', () => {
  it('renders all 9 columns', () => {
    render(<KanbanBoard stages={emptyStages()} onMove={noop} />);

    const expectedColumns = [
      'INVITED', 'INITIATED', 'IN_PROGRESS', 'COMPLETED',
      'CONFIRMED', 'INTERVIEWING', 'SELECTED', 'REJECTED', 'PENDING',
    ];

    for (const id of expectedColumns) {
      expect(screen.getByTestId(`kanban-column-${id}`)).toBeInTheDocument();
    }
  });

  it('renders columns in correct order (INVITED → INITIATED → IN_PROGRESS → COMPLETED → CONFIRMED → ...)', () => {
    render(<KanbanBoard stages={emptyStages()} onMove={noop} />);

    const columns = screen.getAllByTestId(/^kanban-column-/);
    const ids = columns.map((el) => el.getAttribute('data-testid')!.replace('kanban-column-', ''));

    expect(ids).toEqual([
      'INVITED', 'INITIATED', 'IN_PROGRESS', 'COMPLETED',
      'CONFIRMED', 'INTERVIEWING', 'SELECTED', 'REJECTED', 'PENDING',
    ]);
  });

  it('displays internationalized column titles via i18n keys', () => {
    render(<KanbanBoard stages={emptyStages()} onMove={noop} />);

    // Since our mock returns the key itself, we check for the i18n key pattern
    expect(screen.getByText('admin.kanban.columns.INVITED')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.INITIATED')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.IN_PROGRESS')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.COMPLETED')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.CONFIRMED')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.INTERVIEWING')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.SELECTED')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.REJECTED')).toBeInTheDocument();
    expect(screen.getByText('admin.kanban.columns.PENDING')).toBeInTheDocument();
  });

  it('shows correct card count per column', () => {
    const stages = emptyStages();
    stages.INITIATED = [makeEncuadre(), makeEncuadre()];
    stages.COMPLETED = [makeEncuadre()];

    render(<KanbanBoard stages={stages} onMove={noop} />);

    const initiatedCol = screen.getByTestId('kanban-column-INITIATED');
    expect(within(initiatedCol).getByText('2')).toBeInTheDocument();

    const completedCol = screen.getByTestId('kanban-column-COMPLETED');
    expect(within(completedCol).getByText('1')).toBeInTheDocument();

    const invitedCol = screen.getByTestId('kanban-column-INVITED');
    expect(within(invitedCol).getByText('0')).toBeInTheDocument();
  });

  it('renders cards inside the correct column', () => {
    const stages = emptyStages();
    stages.IN_PROGRESS = [makeEncuadre({ id: 'enc-1', workerName: 'Carlos López' })];

    render(<KanbanBoard stages={stages} onMove={noop} />);

    const inProgressCol = screen.getByTestId('kanban-column-IN_PROGRESS');
    expect(within(inProgressCol).getByTestId('kanban-card-enc-1')).toBeInTheDocument();
    expect(within(inProgressCol).getByText('Carlos López')).toBeInTheDocument();
  });
});

// ── Drag & Drop Behavior ─────────────────────────────────────────────────────

describe('KanbanBoard — drag & drop rules', () => {
  it('disables droppable on INITIATED, IN_PROGRESS, and COMPLETED columns', () => {
    render(<KanbanBoard stages={emptyStages()} onMove={noop} />);

    const talentumColumns = droppableIds.filter((d) =>
      ['INITIATED', 'IN_PROGRESS', 'COMPLETED'].includes(d.id),
    );

    expect(talentumColumns).toHaveLength(3);
    for (const col of talentumColumns) {
      expect(col.disabled).toBe(true);
    }
  });

  it('keeps droppable enabled on non-Talentum columns', () => {
    render(<KanbanBoard stages={emptyStages()} onMove={noop} />);

    const droppableColumns = droppableIds.filter((d) =>
      ['INVITED', 'CONFIRMED', 'INTERVIEWING', 'SELECTED', 'REJECTED', 'PENDING'].includes(d.id),
    );

    expect(droppableColumns).toHaveLength(6);
    for (const col of droppableColumns) {
      expect(col.disabled).toBe(false);
    }
  });

  it('renders draggable cards inside Talentum columns (drag FROM is allowed)', () => {
    const stages = emptyStages();
    stages.INITIATED = [makeEncuadre({ id: 'enc-drag' })];

    render(<KanbanBoard stages={stages} onMove={noop} />);

    const card = screen.getByTestId('kanban-card-enc-drag');
    expect(card).toBeInTheDocument();
    expect(card.closest('[data-draggable-id]')).toBeTruthy();
  });
});

// ── Edge Cases ───────────────────────────────────────────────────────────────

describe('KanbanBoard — edge cases', () => {
  it('renders gracefully with all stages empty', () => {
    render(<KanbanBoard stages={emptyStages()} onMove={noop} />);

    const columns = screen.getAllByTestId(/^kanban-column-/);
    expect(columns).toHaveLength(9);
  });

  it('renders multiple cards across different Talentum columns', () => {
    const stages = emptyStages();
    stages.INITIATED = [makeEncuadre({ id: 'a' })];
    stages.IN_PROGRESS = [makeEncuadre({ id: 'b' }), makeEncuadre({ id: 'c' })];
    stages.COMPLETED = [makeEncuadre({ id: 'd' })];

    render(<KanbanBoard stages={stages} onMove={noop} />);

    expect(screen.getByTestId('kanban-card-a')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-card-b')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-card-c')).toBeInTheDocument();
    expect(screen.getByTestId('kanban-card-d')).toBeInTheDocument();
  });
});
