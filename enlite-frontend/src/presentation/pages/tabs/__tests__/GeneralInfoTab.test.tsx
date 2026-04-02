import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor } from '@testing-library/react';
import { GeneralInfoTab } from '../GeneralInfoTab';
import { useAutoSave } from '@presentation/hooks/useAutoSave';
import { useWorkerApi } from '@presentation/hooks/useWorkerApi';

const mockTriggerSave = vi.fn();
const mockSaveGeneralInfo = vi.fn().mockResolvedValue(undefined);
const mockGetProgress = vi.fn().mockResolvedValue({
  firstName: 'John',
  lastName: 'Doe',
  email: 'john@test.com',
  phone: '+5411999999',
  birthDate: '1990-01-01',
  sex: 'male',
  gender: 'male',
  documentType: 'DNI',
  documentNumber: '12345678',
  languages: ['es'],
  profession: 'AT',
  knowledgeLevel: 'SECONDARY',
  experienceTypes: ['adicciones'],
  yearsExperience: '0_2',
  preferredTypes: ['psicosis'],
  preferredAgeRange: 'adults',
  profilePhotoUrl: null,
  titleCertificate: 'ABC-123',
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
        serviceAddress: { serviceRadius: 10, address: '', complement: '', acceptsRemoteService: false },
        availability: { schedule: [] },
      },
      isFieldReadonly: () => false,
    };
    return selector(state);
  }),
}));

vi.mock('@presentation/components/shared/PhoneInputIntl', () => ({
  PhoneInputIntl: () => null,
}));

vi.mock('@presentation/utils/imageCompression', () => ({
  compressImage: vi.fn((data: string) => Promise.resolve(data)),
}));

describe('GeneralInfoTab - Auto Save & Scroll', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(useAutoSave).mockReturnValue(mockTriggerSave);
    vi.mocked(useWorkerApi).mockReturnValue({
      saveGeneralInfo: mockSaveGeneralInfo,
      getProgress: mockGetProgress,
      initWorker: vi.fn(),
      saveStep: vi.fn(),
      saveServiceArea: vi.fn(),
      saveAvailability: vi.fn(),
    } as any);
    Element.prototype.scrollIntoView = vi.fn();
  });

  it('should call useAutoSave with a save function', () => {
    render(<GeneralInfoTab />);
    expect(useAutoSave).toHaveBeenCalledWith(expect.any(Function));
  });

  it('should trigger auto-save on form blur', () => {
    const { container } = render(<GeneralInfoTab />);
    const form = container.querySelector('form')!;
    fireEvent.blur(form);
    expect(mockTriggerSave).toHaveBeenCalled();
  });

  it('should trigger auto-save when an input field blurs', () => {
    const { container } = render(<GeneralInfoTab />);
    const input = container.querySelector('input#fullName')!;
    fireEvent.blur(input);
    expect(mockTriggerSave).toHaveBeenCalled();
  });

  it('should call saveGeneralInfo when auto-save function executes', async () => {
    render(<GeneralInfoTab />);
    const saveFn = vi.mocked(useAutoSave).mock.calls[0][0];
    await saveFn();
    expect(mockSaveGeneralInfo).toHaveBeenCalledWith(
      expect.objectContaining({
        termsAccepted: true,
        privacyAccepted: true,
      }),
    );
  });

  it('should scroll to top on successful manual save', async () => {
    mockSaveGeneralInfo.mockResolvedValueOnce(undefined);
    const { container } = render(<GeneralInfoTab />);

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
    mockSaveGeneralInfo.mockRejectedValueOnce(new Error('Save failed'));
    const { container } = render(<GeneralInfoTab />);

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
