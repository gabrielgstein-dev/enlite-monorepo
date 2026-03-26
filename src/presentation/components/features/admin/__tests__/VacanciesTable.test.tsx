import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { VacanciesTable, VacancyRow } from '../VacanciesTable';

describe('VacanciesTable', () => {
  const mockVacancies: VacancyRow[] = [
    {
      id: 'fd269cde-d8c9-4fdc-88a9-5b19ebcdb531',
      caso: 'Caso 349',
      status: 'Esperando Ativação',
      grau: 'Grave',
      grauColor: 'text-[#f9a000]',
      convidados: '329',
      postulados: '115',
      selecionados: '27',
      faltantes: '',
    },
    {
      id: 'c83963ee-beaf-45f2-88a3-365147b0c205',
      caso: 'Caso 348',
      status: 'Esperando Ativação',
      grau: 'Moderado',
      grauColor: 'text-[#fdc405]',
      convidados: '164',
      postulados: '52',
      selecionados: '6',
      faltantes: '',
    },
  ];

  it('should render table headers', () => {
    render(<VacanciesTable vacancies={[]} />);

    expect(screen.getByText('admin.vacancies.table.case')).toBeInTheDocument();
    expect(screen.getByText('admin.vacancies.table.status')).toBeInTheDocument();
    expect(screen.getByText('admin.vacancies.table.dependencyLevel')).toBeInTheDocument();
    expect(screen.getByText('admin.vacancies.table.invited')).toBeInTheDocument();
    expect(screen.getByText('admin.vacancies.table.applicants')).toBeInTheDocument();
    expect(screen.getByText('admin.vacancies.table.selected')).toBeInTheDocument();
    expect(screen.getByText('admin.vacancies.table.missing')).toBeInTheDocument();
  });

  it('should render "no vacancies" message when array is empty', () => {
    render(<VacanciesTable vacancies={[]} />);

    expect(screen.getByText('admin.vacancies.noVacancies')).toBeInTheDocument();
  });

  it('should render vacancy rows when data is provided', () => {
    render(<VacanciesTable vacancies={mockVacancies} />);

    expect(screen.getByText('Caso 349')).toBeInTheDocument();
    expect(screen.getByText('Caso 348')).toBeInTheDocument();

    const statusElements = screen.getAllByText('Esperando Ativação');
    expect(statusElements).toHaveLength(2);

    expect(screen.getByText('Grave')).toBeInTheDocument();
    expect(screen.getByText('Moderado')).toBeInTheDocument();
  });

  it('should render numeric data fields', () => {
    render(<VacanciesTable vacancies={mockVacancies} />);

    expect(screen.getByText('329')).toBeInTheDocument();
    expect(screen.getByText('115')).toBeInTheDocument();
    expect(screen.getByText('27')).toBeInTheDocument();
    expect(screen.getByText('164')).toBeInTheDocument();
    expect(screen.getByText('52')).toBeInTheDocument();
    expect(screen.getByText('6')).toBeInTheDocument();
  });

  it('should not render "no vacancies" message when data is provided', () => {
    render(<VacanciesTable vacancies={mockVacancies} />);

    expect(screen.queryByText('admin.vacancies.noVacancies')).not.toBeInTheDocument();
  });

  it('should render correct number of rows', () => {
    const { container } = render(<VacanciesTable vacancies={mockVacancies} />);

    const rows = container.querySelectorAll('[class*="h-[72px]"]');
    expect(rows).toHaveLength(2);
  });
});
