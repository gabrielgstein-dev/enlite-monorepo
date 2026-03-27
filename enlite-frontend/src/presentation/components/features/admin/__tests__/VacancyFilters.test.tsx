/**
 * VacancyFilters.test.tsx
 *
 * Testa o componente de filtros da página de vagas:
 * - Renderização dos três selects (cliente, status, prioridade)
 * - Callbacks disparados ao alterar cada filtro
 * - Opções corretas em cada select
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { VacancyFilters } from '../VacancyFilters';
import { SelectOption } from '@presentation/components/molecules/SelectField';

// ── Fixtures ──────────────────────────────────────────────────────────────────

const STATUS_OPTIONS: SelectOption[] = [
  { value: '',        label: 'Todos' },
  { value: 'ativo',   label: 'Ativo' },
  { value: 'processo', label: 'Em Processo' },
  { value: 'pausado', label: 'Pausado' },
];

const PRIORITY_OPTIONS: SelectOption[] = [
  { value: '',       label: 'Todas' },
  { value: 'urgent', label: 'Urgente' },
  { value: 'high',   label: 'Alta' },
  { value: 'normal', label: 'Normal' },
  { value: 'low',    label: 'Baixa' },
];

const CLIENT_OPTIONS: SelectOption[] = [
  { value: '',     label: 'Nombre obra social' },
  { value: 'osde', label: 'OSDE' },
];

function defaultProps(overrides: Partial<Parameters<typeof VacancyFilters>[0]> = {}) {
  return {
    searchQuery: '',
    onSearchChange: vi.fn(),
    selectedClient: '',
    onClientChange: vi.fn(),
    selectedStatus: '',
    onStatusChange: vi.fn(),
    selectedPriority: '',
    onPriorityChange: vi.fn(),
    clientOptions: CLIENT_OPTIONS,
    statusOptions: STATUS_OPTIONS,
    priorityOptions: PRIORITY_OPTIONS,
    ...overrides,
  };
}

// ── Renderização ──────────────────────────────────────────────────────────────

describe('VacancyFilters — renderização', () => {
  it('exibe o campo de busca', () => {
    render(<VacancyFilters {...defaultProps()} />);
    // SearchInput é renderizado como input text
    expect(screen.getByRole('textbox')).toBeInTheDocument();
  });

  it('exibe o label de Status', () => {
    render(<VacancyFilters {...defaultProps()} />);
    // i18n não está configurado nos testes — a chave é retornada como string
    expect(screen.getByText('admin.vacancies.statusLabel')).toBeInTheDocument();
  });

  it('exibe o label de Prioridade', () => {
    render(<VacancyFilters {...defaultProps()} />);
    expect(screen.getByText('admin.vacancies.priorityLabel')).toBeInTheDocument();
  });

  it('exibe o label de Clientes', () => {
    render(<VacancyFilters {...defaultProps()} />);
    expect(screen.getByText('admin.vacancies.clients')).toBeInTheDocument();
  });
});

// ── Opções dos selects ────────────────────────────────────────────────────────

describe('VacancyFilters — opções', () => {
  it('select de status renderiza todas as opções incluindo "Todos"', () => {
    render(<VacancyFilters {...defaultProps()} />);
    expect(screen.getByText('Todos')).toBeInTheDocument();
    expect(screen.getByText('Ativo')).toBeInTheDocument();
    expect(screen.getByText('Em Processo')).toBeInTheDocument();
    expect(screen.getByText('Pausado')).toBeInTheDocument();
  });

  it('select de prioridade renderiza todas as opções incluindo "Todas"', () => {
    render(<VacancyFilters {...defaultProps()} />);
    expect(screen.getByText('Todas')).toBeInTheDocument();
    expect(screen.getByText('Urgente')).toBeInTheDocument();
    expect(screen.getByText('Alta')).toBeInTheDocument();
    expect(screen.getByText('Normal')).toBeInTheDocument();
    expect(screen.getByText('Baixa')).toBeInTheDocument();
  });
});

// ── Callbacks ─────────────────────────────────────────────────────────────────

describe('VacancyFilters — callbacks', () => {
  it('onStatusChange é chamado ao selecionar um status', async () => {
    const onStatusChange = vi.fn();
    render(<VacancyFilters {...defaultProps({ onStatusChange })} />);

    const selects = screen.getAllByRole('combobox');
    // O select de status é o segundo combobox (cliente, status, prioridade)
    await userEvent.selectOptions(selects[1], 'ativo');

    expect(onStatusChange).toHaveBeenCalledWith('ativo');
  });

  it('onPriorityChange é chamado ao selecionar uma prioridade', async () => {
    const onPriorityChange = vi.fn();
    render(<VacancyFilters {...defaultProps({ onPriorityChange })} />);

    const selects = screen.getAllByRole('combobox');
    // O select de prioridade é o terceiro combobox
    await userEvent.selectOptions(selects[2], 'urgent');

    expect(onPriorityChange).toHaveBeenCalledWith('urgent');
  });

  it('onClientChange é chamado ao selecionar um cliente', async () => {
    const onClientChange = vi.fn();
    render(<VacancyFilters {...defaultProps({ onClientChange })} />);

    const selects = screen.getAllByRole('combobox');
    await userEvent.selectOptions(selects[0], 'osde');

    expect(onClientChange).toHaveBeenCalledWith('osde');
  });

  it('onSearchChange é chamado ao digitar na busca', async () => {
    const onSearchChange = vi.fn();
    render(<VacancyFilters {...defaultProps({ onSearchChange })} />);

    await userEvent.type(screen.getByRole('textbox'), 'Ana');

    expect(onSearchChange).toHaveBeenCalled();
  });
});

// ── Estado refletido ──────────────────────────────────────────────────────────

describe('VacancyFilters — estado refletido nos selects', () => {
  it('selectedStatus="pausado" é refletido no select de status', () => {
    render(<VacancyFilters {...defaultProps({ selectedStatus: 'pausado' })} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[1].value).toBe('pausado');
  });

  it('selectedPriority="high" é refletido no select de prioridade', () => {
    render(<VacancyFilters {...defaultProps({ selectedPriority: 'high' })} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[2].value).toBe('high');
  });

  it('selectedPriority="" mostra a opção "Todas" selecionada', () => {
    render(<VacancyFilters {...defaultProps({ selectedPriority: '' })} />);
    const selects = screen.getAllByRole('combobox') as HTMLSelectElement[];
    expect(selects[2].value).toBe('');
  });
});
