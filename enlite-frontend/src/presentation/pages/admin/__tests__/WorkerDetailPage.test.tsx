import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import WorkerDetailPage from '../WorkerDetailPage';
import type { WorkerDetail } from '@domain/entities/Worker';

// ── react-i18next mock ────────────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
  }),
}));

// ── react-router-dom mocks ────────────────────────────────────────────────────
const mockNavigate = vi.fn();
const mockUseParams = vi.fn(() => ({ id: 'worker-123' }));

vi.mock('react-router-dom', () => ({
  useParams: () => mockUseParams(),
  useNavigate: () => mockNavigate,
}));

// ── useWorkerDetail hook mock ─────────────────────────────────────────────────
const mockUseWorkerDetail = vi.fn();

vi.mock('@hooks/admin/useWorkerDetail', () => ({
  useWorkerDetail: (id: string | undefined) => mockUseWorkerDetail(id),
}));

// ── WorkerDetail sub-component mocks ─────────────────────────────────────────
// Mock all feature cards to keep the test focused on page orchestration.
vi.mock('@presentation/components/features/admin/WorkerDetail/WorkerStatusCard', () => ({
  WorkerStatusCard: (props: Record<string, unknown>) => (
    <div data-testid="worker-status-card" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('@presentation/components/features/admin/WorkerDetail/WorkerPersonalCard', () => ({
  WorkerPersonalCard: (props: Record<string, unknown>) => (
    <div data-testid="worker-personal-card" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('@presentation/components/features/admin/WorkerDetail/WorkerProfessionalCard', () => ({
  WorkerProfessionalCard: (props: Record<string, unknown>) => (
    <div data-testid="worker-professional-card" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('@presentation/components/features/admin/WorkerDetail/WorkerLocationCard', () => ({
  WorkerLocationCard: (props: Record<string, unknown>) => (
    <div data-testid="worker-location-card" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('@presentation/components/features/admin/WorkerDetail/WorkerDocumentsCard', () => ({
  WorkerDocumentsCard: (props: Record<string, unknown>) => (
    <div data-testid="worker-documents-card" data-props={JSON.stringify(props)} />
  ),
}));

vi.mock('@presentation/components/features/admin/WorkerDetail/WorkerEncuadresCard', () => ({
  WorkerEncuadresCard: (props: Record<string, unknown>) => (
    <div data-testid="worker-encuadres-card" data-props={JSON.stringify(props)} />
  ),
}));

// ── DetailSkeleton mock ───────────────────────────────────────────────────────
vi.mock('@presentation/components/ui/skeletons', () => ({
  DetailSkeleton: () => <div data-testid="detail-skeleton" />,
}));

// ── Fixture ───────────────────────────────────────────────────────────────────
const MOCK_WORKER: WorkerDetail = {
  id: 'worker-123',
  email: 'ana.silva@test.com',
  phone: '+55 11 99999-0000',
  whatsappPhone: '+55 11 99999-0000',
  country: 'BR',
  timezone: 'America/Sao_Paulo',
  status: 'REGISTERED',
  overallStatus: 'QUALIFIED',
  availabilityStatus: 'available',
  dataSources: ['talentum'],
  platform: 'talentum',
  createdAt: '2026-01-10T00:00:00Z',
  updatedAt: '2026-03-20T00:00:00Z',

  firstName: 'Ana',
  lastName: 'Silva',
  sex: 'F',
  gender: 'Feminino',
  birthDate: '1995-06-15',
  documentType: 'CPF',
  documentNumber: '123.456.789-00',
  profilePhotoUrl: null,

  profession: 'Psicóloga',
  occupation: 'Acompanhante Terapêutico',
  knowledgeLevel: 'Senior',
  titleCertificate: 'CRP 06/12345',
  experienceTypes: ['TEA'],
  yearsExperience: '5',
  preferredTypes: ['Presencial'],
  preferredAgeRange: 'Adulto',
  languages: ['Português'],

  sexualOrientation: null,
  race: null,
  religion: null,
  weightKg: null,
  heightCm: null,
  hobbies: [],
  diagnosticPreferences: [],
  linkedinUrl: null,

  isMatchable: true,
  isActive: true,

  documents: null,
  serviceAreas: [],
  location: null,
  encuadres: [],
};

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockNavigate.mockReset();
  mockUseParams.mockReturnValue({ id: 'worker-123' });
});

// ── Loading state ─────────────────────────────────────────────────────────────

describe('WorkerDetailPage — loading state', () => {
  it('renders loading skeleton when isLoading is true', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.getByTestId('detail-skeleton')).toBeInTheDocument();
    expect(screen.queryByTestId('worker-status-card')).not.toBeInTheDocument();
  });

  it('does not render any cards during loading', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.queryByTestId('worker-personal-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-professional-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-location-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-documents-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-encuadres-card')).not.toBeInTheDocument();
  });
});

// ── Success state ─────────────────────────────────────────────────────────────

describe('WorkerDetailPage — success state', () => {
  beforeEach(() => {
    mockUseWorkerDetail.mockReturnValue({
      worker: MOCK_WORKER,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });
  });

  it('renders full name in the breadcrumb header', () => {
    render(<WorkerDetailPage />);
    expect(screen.getByText('Ana Silva')).toBeInTheDocument();
  });

  it('renders all six detail cards', () => {
    render(<WorkerDetailPage />);

    expect(screen.getByTestId('worker-status-card')).toBeInTheDocument();
    expect(screen.getByTestId('worker-personal-card')).toBeInTheDocument();
    expect(screen.getByTestId('worker-professional-card')).toBeInTheDocument();
    expect(screen.getByTestId('worker-location-card')).toBeInTheDocument();
    expect(screen.getByTestId('worker-documents-card')).toBeInTheDocument();
    expect(screen.getByTestId('worker-encuadres-card')).toBeInTheDocument();
  });

  it('does not render the skeleton when data is loaded', () => {
    render(<WorkerDetailPage />);

    expect(screen.queryByTestId('detail-skeleton')).not.toBeInTheDocument();
  });

  it('falls back to email when firstName and lastName are null', () => {
    const workerNoName: WorkerDetail = {
      ...MOCK_WORKER,
      firstName: null,
      lastName: null,
    };

    mockUseWorkerDetail.mockReturnValue({
      worker: workerNoName,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.getByText('ana.silva@test.com')).toBeInTheDocument();
  });

  it('shows only firstName when lastName is null', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: { ...MOCK_WORKER, lastName: null },
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);
    expect(screen.getByText('Ana')).toBeInTheDocument();
  });

  it('renders back button with i18n key admin.workerDetail.back', () => {
    render(<WorkerDetailPage />);
    const backButtons = screen.getAllByText('admin.workerDetail.back');
    expect(backButtons.length).toBeGreaterThanOrEqual(1);
  });

  it('navigates to /admin/workers when the back button is clicked', async () => {
    const user = userEvent.setup();
    render(<WorkerDetailPage />);

    const backButtons = screen.getAllByText('admin.workerDetail.back');
    await user.click(backButtons[0]);

    expect(mockNavigate).toHaveBeenCalledWith('/admin/workers');
  });

  it('calls useWorkerDetail with the id from useParams', () => {
    render(<WorkerDetailPage />);

    expect(mockUseWorkerDetail).toHaveBeenCalledWith('worker-123');
  });

  it('passes correct props to WorkerStatusCard', () => {
    render(<WorkerDetailPage />);
    const card = screen.getByTestId('worker-status-card');
    const props = JSON.parse(card.getAttribute('data-props')!);
    expect(props.status).toBe('REGISTERED');
    expect(props.isMatchable).toBe(true);
    expect(props.isActive).toBe(true);
    expect(props.platform).toBe('talentum');
  });

  it('passes correct props to WorkerPersonalCard', () => {
    render(<WorkerDetailPage />);
    const card = screen.getByTestId('worker-personal-card');
    const props = JSON.parse(card.getAttribute('data-props')!);
    expect(props.firstName).toBe('Ana');
    expect(props.lastName).toBe('Silva');
    expect(props.email).toBe('ana.silva@test.com');
    expect(props.phone).toBe('+55 11 99999-0000');
  });

  it('passes correct props to WorkerProfessionalCard', () => {
    render(<WorkerDetailPage />);
    const card = screen.getByTestId('worker-professional-card');
    const props = JSON.parse(card.getAttribute('data-props')!);
    expect(props.profession).toBe('Psicóloga');
    expect(props.knowledgeLevel).toBe('Senior');
    expect(props.languages).toEqual(['Português']);
  });

  it('passes correct props to WorkerLocationCard', () => {
    render(<WorkerDetailPage />);
    const card = screen.getByTestId('worker-location-card');
    const props = JSON.parse(card.getAttribute('data-props')!);
    expect(props.serviceAreas).toEqual([]);
    expect(props.location).toBeNull();
  });

  it('passes correct props to WorkerDocumentsCard', () => {
    render(<WorkerDetailPage />);
    const card = screen.getByTestId('worker-documents-card');
    const props = JSON.parse(card.getAttribute('data-props')!);
    expect(props.documents).toBeNull();
  });

  it('passes correct props to WorkerEncuadresCard', () => {
    render(<WorkerDetailPage />);
    const card = screen.getByTestId('worker-encuadres-card');
    const props = JSON.parse(card.getAttribute('data-props')!);
    expect(props.encuadres).toEqual([]);
  });
});

// ── Error state ───────────────────────────────────────────────────────────────

describe('WorkerDetailPage — error state', () => {
  it('renders error message when error is set', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: false,
      error: 'Worker not found',
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.getByText('Worker not found')).toBeInTheDocument();
    expect(screen.queryByTestId('detail-skeleton')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-status-card')).not.toBeInTheDocument();
  });

  it('renders the notFound i18n key when worker is null with no error', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.getByText('admin.workerDetail.notFound')).toBeInTheDocument();
  });

  it('renders back button with i18n key in error state', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: false,
      error: 'Failed to load',
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.getByText('admin.workerDetail.back')).toBeInTheDocument();
  });

  it('back button navigates to /admin/workers in error state', async () => {
    const user = userEvent.setup();

    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: false,
      error: 'Failed to load',
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    await user.click(screen.getByText('admin.workerDetail.back'));

    expect(mockNavigate).toHaveBeenCalledWith('/admin/workers');
  });

  it('does not render any cards in error state', () => {
    mockUseWorkerDetail.mockReturnValue({
      worker: null,
      isLoading: false,
      error: 'Some error',
      refetch: vi.fn(),
    });

    render(<WorkerDetailPage />);

    expect(screen.queryByTestId('worker-status-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-personal-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-professional-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-location-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-documents-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('worker-encuadres-card')).not.toBeInTheDocument();
  });
});
