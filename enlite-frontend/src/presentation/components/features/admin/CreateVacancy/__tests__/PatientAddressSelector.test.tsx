import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { PatientAddressSelector } from '../PatientAddressSelector';
import type { AddressMatchCandidate } from '@domain/entities/PatientAddress';

// ── Mock i18n ───────────────────────────────────────────────────
vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => {
      const map: Record<string, string> = {
        'admin.createVacancy.addressStep.title': 'Confirmar domicilio',
        'admin.createVacancy.addressStep.subtitle': 'Seleccioná el domicilio',
        'admin.createVacancy.addressStep.noAddresses': 'No se encontraron domicilios.',
        'admin.createVacancy.addressStep.noPatient': 'No se pudo identificar al paciente.',
        'admin.createVacancy.addressStep.badgeExact': 'Exacto',
        'admin.createVacancy.addressStep.badgeFuzzy': 'Aproximado',
        'admin.createVacancy.addressStep.createNew': 'Crear nuevo domicilio',
        'admin.createVacancy.addressStep.continue': 'Continuar',
        'admin.createVacancy.addressStep.back': 'Volver',
        'admin.createVacancy.createAddressDialog.title': 'Crear nuevo domicilio',
        'admin.createVacancy.createAddressDialog.addressFormatted': 'Dirección formateada',
        'admin.createVacancy.createAddressDialog.addressFormattedRequired': 'Obligatorio',
        'admin.createVacancy.createAddressDialog.addressRaw': 'Dirección informada',
        'admin.createVacancy.createAddressDialog.addressType': 'Tipo',
        'admin.createVacancy.createAddressDialog.addressTypePrimary': 'Principal',
        'admin.createVacancy.createAddressDialog.addressTypeSecondary': 'Secundario',
        'admin.createVacancy.createAddressDialog.addressTypeService': 'Servicio',
        'admin.createVacancy.createAddressDialog.save': 'Guardar',
        'admin.createVacancy.createAddressDialog.cancel': 'Cancelar',
        'common.optional': 'opcional',
        'common.saving': 'Guardando...',
      };
      return map[key] ?? key;
    },
  }),
}));

// ── Fixtures ─────────────────────────────────────────────────────

const EXACT_MATCH: AddressMatchCandidate = {
  patient_address_id: 'addr-1',
  addressFormatted: 'Av. Corrientes 1234, CABA',
  confidence: 1,
  matchType: 'EXACT',
};

const FUZZY_MATCH: AddressMatchCandidate = {
  patient_address_id: 'addr-2',
  addressFormatted: 'Corrientes 1234',
  confidence: 0.8,
  matchType: 'FUZZY',
};

function renderSelector(
  overrides: Partial<React.ComponentProps<typeof PatientAddressSelector>> = {}
) {
  const props = {
    patientId: 'pat-1',
    addressMatches: [EXACT_MATCH],
    selectedAddressId: null,
    onSelect: vi.fn(),
    onCreateNew: vi.fn(),
    onNext: vi.fn(),
    onBack: vi.fn(),
    isCreating: false,
    ...overrides,
  };
  const result = render(<PatientAddressSelector {...props} />);
  return { ...result, props };
}

// ── Tests ────────────────────────────────────────────────────────

describe('PatientAddressSelector', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('rendering', () => {
    it('renders title and subtitle', () => {
      renderSelector();
      expect(screen.getByText('Confirmar domicilio')).toBeInTheDocument();
      expect(screen.getByText('Seleccioná el domicilio')).toBeInTheDocument();
    });

    it('renders address card with EXACT badge', () => {
      renderSelector();
      expect(screen.getByText('Av. Corrientes 1234, CABA')).toBeInTheDocument();
      expect(screen.getByText('Exacto')).toBeInTheDocument();
    });

    it('renders FUZZY badge for fuzzy match', () => {
      renderSelector({ addressMatches: [FUZZY_MATCH] });
      expect(screen.getByText('Aproximado')).toBeInTheDocument();
    });

    it('shows "no patient" warning when patientId is null', () => {
      renderSelector({ patientId: null, addressMatches: [] });
      expect(screen.getByText('No se pudo identificar al paciente.')).toBeInTheDocument();
    });

    it('shows "no addresses" message when matches is empty and patientId is set', () => {
      renderSelector({ addressMatches: [] });
      expect(screen.getByText('No se encontraron domicilios.')).toBeInTheDocument();
    });
  });

  describe('Continue button', () => {
    it('is disabled when no address is selected', () => {
      renderSelector({ selectedAddressId: null });
      const btn = screen.getByText('Continuar').closest('button')!;
      expect(btn).toBeDisabled();
    });

    it('is enabled when an address is selected', () => {
      renderSelector({ selectedAddressId: 'addr-1' });
      const btn = screen.getByText('Continuar').closest('button')!;
      expect(btn).not.toBeDisabled();
    });

    it('calls onNext when clicked and address is selected', async () => {
      const { props } = renderSelector({ selectedAddressId: 'addr-1' });
      await userEvent.click(screen.getByText('Continuar'));
      expect(props.onNext).toHaveBeenCalled();
    });
  });

  describe('address card interaction', () => {
    it('calls onSelect with address id when card is clicked', async () => {
      const { props } = renderSelector();
      await userEvent.click(screen.getByText('Av. Corrientes 1234, CABA'));
      expect(props.onSelect).toHaveBeenCalledWith('addr-1');
    });

    it('highlights selected card with border-primary class', () => {
      renderSelector({ selectedAddressId: 'addr-1' });
      const card = screen.getByText('Av. Corrientes 1234, CABA').closest('button')!;
      expect(card.className).toContain('border-primary');
    });

    it('shows multiple address cards', () => {
      renderSelector({ addressMatches: [EXACT_MATCH, FUZZY_MATCH] });
      expect(screen.getByText('Av. Corrientes 1234, CABA')).toBeInTheDocument();
      expect(screen.getByText('Corrientes 1234')).toBeInTheDocument();
    });
  });

  describe('Back button', () => {
    it('calls onBack when clicked', async () => {
      const { props } = renderSelector();
      await userEvent.click(screen.getByText('Volver'));
      expect(props.onBack).toHaveBeenCalled();
    });
  });

  describe('Create new address', () => {
    it('shows "Crear nuevo domicilio" button when patientId is set', () => {
      renderSelector();
      expect(screen.getByText('Crear nuevo domicilio')).toBeInTheDocument();
    });

    it('does not show "Crear nuevo domicilio" when patientId is null', () => {
      renderSelector({ patientId: null, addressMatches: [] });
      expect(screen.queryByText('Crear nuevo domicilio')).not.toBeInTheDocument();
    });

    it('opens dialog when "Crear nuevo domicilio" is clicked', async () => {
      renderSelector();
      await userEvent.click(screen.getByText('Crear nuevo domicilio'));
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    it('calls onCreateNew when dialog is submitted', async () => {
      const onCreateNew = vi.fn().mockResolvedValue('addr-new');
      renderSelector({ onCreateNew });

      await userEvent.click(screen.getByText('Crear nuevo domicilio'));
      const input = screen.getByPlaceholderText('Av. Corrientes 1234, CABA');
      await userEvent.type(input, 'Florida 123');
      await userEvent.click(screen.getByText('Guardar'));

      await waitFor(() => {
        expect(onCreateNew).toHaveBeenCalledWith(
          expect.objectContaining({ addressFormatted: 'Florida 123', addressType: 'primary' })
        );
      });
    });
  });
});
