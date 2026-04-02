import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { ServiceAddressTab } from '../ServiceAddressTab';
import { useAutoSave } from '@presentation/hooks/useAutoSave';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';

const mockTriggerSave = vi.fn();
const mockSaveServiceArea = vi.fn().mockResolvedValue(undefined);
const mockGetProgress = vi.fn().mockResolvedValue({
  serviceAddress: 'Av. Corrientes 1234',
  serviceAddressComplement: '',
  serviceRadiusKm: 10,
});

vi.mock('@presentation/hooks/useAutoSave', () => ({
  useAutoSave: vi.fn(),
}));

vi.mock('@presentation/hooks/useWorkerApi', () => ({
  useWorkerApi: vi.fn(),
}));

vi.mock('@hookform/resolvers/zod', () => ({
  zodResolver: () => async (values: any) => ({ values, errors: {} }),
}));

vi.mock('@presentation/stores/workerRegistrationStore', () => ({
  useWorkerRegistrationStore: vi.fn((selector: (state: any) => any) => {
    const state = {
      data: {
        generalInfo: {
          profilePhoto: null, fullName: '', lastName: '', cpf: '', phone: '',
          email: '', birthDate: '', sex: '', gender: '', documentType: 'DNI',
          professionalLicense: '', languages: [], profession: '', knowledgeLevel: '',
          experienceTypes: [], yearsExperience: '', preferredTypes: [], preferredAgeRange: '',
        },
        serviceAddress: { serviceRadius: 10, address: 'Av. Corrientes 1234', complement: '', acceptsRemoteService: false },
        availability: { schedule: [] },
      },
      isFieldReadonly: () => false,
    };
    return selector(state);
  }),
}));

vi.mock('@presentation/components/molecules', () => ({
  GooglePlacesAutocomplete: () => null,
  AddressField: () => null,
  InputWithIcon: () => null,
}));

vi.mock('@presentation/components/shared/DistanceSlider', () => ({
  DistanceSlider: () => null,
}));

describe('ServiceAddressTab - Auto Save & Scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAutoSave).mockReturnValue(mockTriggerSave);
    vi.mocked(useWorkerApi).mockReturnValue({
      saveServiceArea: mockSaveServiceArea,
      getProgress: mockGetProgress,
      initWorker: vi.fn(),
      saveStep: vi.fn(),
      saveGeneralInfo: vi.fn(),
      saveAvailability: vi.fn(),
    } as any);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should call useAutoSave with a save function', () => {
    render(<ServiceAddressTab />);
    expect(useAutoSave).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should trigger auto-save on form blur', () => {
    const { container } = render(<ServiceAddressTab />);
    const form = container.querySelector('form')!;
    fireEvent.blur(form);
    expect(mockTriggerSave).toHaveBeenCalled();
  });

  it('should call saveServiceArea when auto-save function executes', async () => {
    render(<ServiceAddressTab />);
    const saveFn = vi.mocked(useAutoSave).mock.calls[0][0];
    await saveFn();
    expect(mockSaveServiceArea).toHaveBeenCalledWith(
      expect.objectContaining({
        serviceRadiusKm: expect.any(Number),
      }),
    );
  });

  it('should scroll to top on successful manual save', async () => {
    mockSaveServiceArea.mockResolvedValueOnce(undefined);
    const { container } = render(<ServiceAddressTab />);

    await waitFor(() => expect(mockGetProgress).toHaveBeenCalled());

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });

  it('should scroll to top on save error', async () => {
    mockSaveServiceArea.mockRejectedValueOnce(new Error('Network error'));
    const { container } = render(<ServiceAddressTab />);

    await waitFor(() => expect(mockGetProgress).toHaveBeenCalled());

    const form = container.querySelector('form')!;
    fireEvent.submit(form);

    await waitFor(() => {
      expect(Element.prototype.scrollIntoView).toHaveBeenCalledWith({
        behavior: 'smooth',
        block: 'start',
      });
    });
  });
});
