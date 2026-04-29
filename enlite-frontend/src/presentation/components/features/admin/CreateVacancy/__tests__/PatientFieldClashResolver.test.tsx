import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientFieldClashResolver } from '../PatientFieldClashResolver';
import type { PatientFieldClash } from '@domain/entities/PatientAddress';

// ── Mock i18n ───────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'admin.createVacancy.clashStep.title': 'Revisar datos del paciente',
        'admin.createVacancy.clashStep.subtitle': 'El PDF tiene valores diferentes.',
        'admin.createVacancy.clashStep.noClashes': 'No hay conflictos.',
        'admin.createVacancy.clashStep.keepPatient': 'Mantener paciente',
        'admin.createVacancy.clashStep.usePdf': 'Usar valor del PDF',
        'admin.createVacancy.clashStep.patientColumn': 'Paciente',
        'admin.createVacancy.clashStep.fields.pathology_types': 'Diagnóstico',
        'admin.createVacancy.clashStep.fields.dependency_level': 'Nivel de dependencia',
        'admin.createVacancy.clashStep.continue': 'Continuar',
        'admin.createVacancy.clashStep.back': 'Volver',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Fixtures ─────────────────────────────────────────────────────

const DEPENDENCY_CLASH: PatientFieldClash = {
  field: 'dependency_level',
  pdfValue: 'HIGH',
  patientValue: 'LOW',
  action: 'CLASH',
};

const PATHOLOGY_CLASH: PatientFieldClash = {
  field: 'pathology_types',
  pdfValue: 'TEA',
  patientValue: 'TGD',
  action: 'CLASH',
};

function renderResolver(
  overrides: Partial<React.ComponentProps<typeof PatientFieldClashResolver>> = {}
) {
  const props = {
    clashes: [DEPENDENCY_CLASH],
    resolvedClashes: {},
    onResolve: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    ...overrides,
  };
  const result = render(<PatientFieldClashResolver {...props} />);
  return { ...result, props };
}

// ── Tests ────────────────────────────────────────────────────────

describe('PatientFieldClashResolver', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders title and subtitle', () => {
      renderResolver();
      expect(screen.getByText('Revisar datos del paciente')).toBeInTheDocument();
      expect(screen.getByText('El PDF tiene valores diferentes.')).toBeInTheDocument();
    });

    it('shows no-clashes message when clashes array is empty', () => {
      renderResolver({ clashes: [] });
      expect(screen.getByText('No hay conflictos.')).toBeInTheDocument();
    });

    it('renders clash with PDF and patient values', () => {
      renderResolver();
      expect(screen.getByText('HIGH')).toBeInTheDocument();
      expect(screen.getByText('LOW')).toBeInTheDocument();
    });

    it('renders field label for dependency_level', () => {
      renderResolver();
      expect(screen.getByText('Nivel de dependencia')).toBeInTheDocument();
    });

    it('renders field label for pathology_types', () => {
      renderResolver({ clashes: [PATHOLOGY_CLASH] });
      expect(screen.getByText('Diagnóstico')).toBeInTheDocument();
    });

    it('renders two clashes simultaneously', () => {
      renderResolver({ clashes: [DEPENDENCY_CLASH, PATHOLOGY_CLASH] });
      expect(screen.getByText('Nivel de dependencia')).toBeInTheDocument();
      expect(screen.getByText('Diagnóstico')).toBeInTheDocument();
    });

    it('skips IDENTICAL clashes', () => {
      const identical: PatientFieldClash = { ...DEPENDENCY_CLASH, action: 'IDENTICAL' };
      renderResolver({ clashes: [identical] });
      // No clash cards rendered, only the no-clashes message
      expect(screen.getByText('No hay conflictos.')).toBeInTheDocument();
    });
  });

  describe('Continue button', () => {
    it('is disabled when clash is not resolved', () => {
      renderResolver({ resolvedClashes: {} });
      const btn = screen.getByText('Continuar').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('is enabled when all clashes are resolved', () => {
      renderResolver({ resolvedClashes: { dependency_level: 'use_pdf' } });
      const btn = screen.getByText('Continuar').closest('button')!;
      expect(btn).not.toBeDisabled();
    });

    it('is enabled when clashes array is empty', () => {
      renderResolver({ clashes: [] });
      const btn = screen.getByText('Continuar').closest('button')!;
      expect(btn).not.toBeDisabled();
    });

    it('is disabled when some clashes are unresolved', () => {
      renderResolver({
        clashes: [DEPENDENCY_CLASH, PATHOLOGY_CLASH],
        resolvedClashes: { dependency_level: 'use_pdf' },
      });
      const btn = screen.getByText('Continuar').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('calls onNext when clicked and all resolved', async () => {
      const { props } = renderResolver({ resolvedClashes: { dependency_level: 'use_pdf' } });
      await userEvent.click(screen.getByText('Continuar'));
      expect(props.onNext).toHaveBeenCalled();
    });
  });

  describe('resolution buttons', () => {
    it('calls onResolve with use_pdf when PDF column clicked', async () => {
      const { props } = renderResolver();
      await userEvent.click(screen.getAllByText('Usar valor del PDF')[0]);
      expect(props.onResolve).toHaveBeenCalledWith('dependency_level', 'use_pdf');
    });

    it('calls onResolve with keep_patient when patient column clicked', async () => {
      const { props } = renderResolver();
      await userEvent.click(screen.getAllByText('Mantener paciente')[0]);
      expect(props.onResolve).toHaveBeenCalledWith('dependency_level', 'keep_patient');
    });

    it('highlights selected resolution button', () => {
      renderResolver({ resolvedClashes: { dependency_level: 'use_pdf' } });
      // The PDF column button should have ring class
      const pdfButtons = screen.getAllByText('Usar valor del PDF');
      // The parent button should have ring-primary class
      const pdfBtn = pdfButtons[0].closest('button')!;
      expect(pdfBtn.className).toContain('ring-primary');
    });
  });

  describe('Back button', () => {
    it('calls onBack when clicked', async () => {
      const { props } = renderResolver();
      await userEvent.click(screen.getByText('Volver'));
      expect(props.onBack).toHaveBeenCalled();
    });
  });
});
