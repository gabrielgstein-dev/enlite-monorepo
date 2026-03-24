import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AdminVacanciesPage } from '../AdminVacanciesPage';
import { useVacanciesData } from '../../../../hooks/admin/useVacanciesData';

vi.mock('../../../../hooks/admin/useVacanciesData');

const mockedUseVacanciesData = vi.mocked(useVacanciesData);

describe('AdminVacanciesPage', () => {
  const mockVacancies = [
    {
      id: 'fd269cde-d8c9-4fdc-88a9-5b19ebcdb531',
      initials: 'GP',
      name: 'Gabriel Perez Heguy',
      email: '',
      caso: 'Caso 349',
      status: 'Esperando Ativação',
      grau: 'Grave',
      grauColor: 'text-[#f9a000]',
      diasAberto: '06',
      convidados: '329',
      postulados: '115',
      selecionados: '27',
      faltantes: '',
    },
    {
      id: 'c83963ee-beaf-45f2-88a3-365147b0c205',
      initials: 'NL',
      name: 'Nora Luisa Lorenzón',
      email: '',
      caso: 'Caso 348',
      status: 'Esperando Ativação',
      grau: 'Moderado',
      grauColor: 'text-[#fdc405]',
      diasAberto: '11',
      convidados: '164',
      postulados: '52',
      selecionados: '6',
      faltantes: '',
    },
  ];

  const mockStats = [
    { label: '+7 dias', value: '5', color: 'bg-[#FF6B6B]' },
    { label: '3-7 dias', value: '12', color: 'bg-[#FFA500]' },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should render loading state', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: [],
      stats: [],
      total: 0,
      isLoading: true,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText('admin.vacancies.loading')).toBeInTheDocument();
  });

  it('should render error state', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: [],
      stats: [],
      total: 0,
      isLoading: false,
      error: 'Failed to fetch data',
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText('admin.vacancies.errorLoading')).toBeInTheDocument();
    expect(screen.getByText('Failed to fetch data')).toBeInTheDocument();
  });

  it('should render vacancies data when loaded successfully', async () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: mockVacancies,
      stats: mockStats,
      total: 178,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Gabriel Perez Heguy')).toBeInTheDocument();
      expect(screen.getByText('Nora Luisa Lorenzón')).toBeInTheDocument();
    });
  });

  it('should render all vacancy details in the table', async () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: mockVacancies,
      stats: mockStats,
      total: 178,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    await waitFor(() => {
      expect(screen.getByText('Caso 349')).toBeInTheDocument();
      expect(screen.getByText('Caso 348')).toBeInTheDocument();
      
      const statusElements = screen.getAllByText('Esperando Ativação');
      expect(statusElements.length).toBeGreaterThan(0);
      
      expect(screen.getByText('Grave')).toBeInTheDocument();
      expect(screen.getByText('Moderado')).toBeInTheDocument();
      expect(screen.getByText('06')).toBeInTheDocument();
      expect(screen.getByText('329')).toBeInTheDocument();
      expect(screen.getByText('115')).toBeInTheDocument();
      expect(screen.getByText('27')).toBeInTheDocument();
    });
  });

  it('should render page title', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: [],
      stats: [],
      total: 0,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText('admin.vacancies.title')).toBeInTheDocument();
  });

  it('should render stats cards', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: [],
      stats: mockStats,
      total: 0,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText('+7 dias')).toBeInTheDocument();
    expect(screen.getByText('3-7 dias')).toBeInTheDocument();
    expect(screen.getByText('5')).toBeInTheDocument();
    expect(screen.getByText('12')).toBeInTheDocument();
  });

  it('should render "new" button', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: [],
      stats: [],
      total: 0,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText('admin.vacancies.new')).toBeInTheDocument();
  });

  it('should render filters section', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: [],
      stats: [],
      total: 0,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText('admin.vacancies.vacanciesTitle')).toBeInTheDocument();
  });

  it('should not show "no vacancies" message when data is present', async () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: mockVacancies,
      stats: mockStats,
      total: 178,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    await waitFor(() => {
      expect(screen.queryByText('admin.vacancies.noVacancies')).not.toBeInTheDocument();
    });
  });

  it('should render correct total count in pagination', () => {
    mockedUseVacanciesData.mockReturnValue({
      vacancies: mockVacancies,
      stats: mockStats,
      total: 178,
      isLoading: false,
      error: null,
      refetch: vi.fn(),
    });

    render(<AdminVacanciesPage />);

    expect(screen.getByText(/178/)).toBeInTheDocument();
  });
});
