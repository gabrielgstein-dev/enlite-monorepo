import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import React from 'react';
import { usePostularseAction } from '../usePostularseAction';

// ---------------------------------------------------------------------------
// Module mocks
// ---------------------------------------------------------------------------

const mockNavigate = vi.fn();

vi.mock('react-router-dom', async (importOriginal) => {
  const actual = await importOriginal<typeof import('react-router-dom')>();
  return {
    ...actual,
    useNavigate: () => mockNavigate,
  };
});

vi.mock('@presentation/hooks/useAuth');
vi.mock('@infrastructure/http/WorkerApiService');
vi.mock('@infrastructure/http/DocumentApiService');

import { useAuth } from '@presentation/hooks/useAuth';
import { WorkerApiService } from '@infrastructure/http/WorkerApiService';
import { DocumentApiService } from '@infrastructure/http/DocumentApiService';

const mockUseAuth = vi.mocked(useAuth);
const mockGetProgress = vi.mocked(WorkerApiService.getProgress);
const mockGetAvailability = vi.mocked(WorkerApiService.getAvailability);
const mockGetDocuments = vi.mocked(DocumentApiService.getDocuments);

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

const WHATSAPP_URL = 'https://wa.me/5511999999999';

const COMPLETE_DOCS = {
  id: 'doc-1',
  workerId: 'w-1',
  resumeCvUrl: 'https://example.com/cv.pdf',
  identityDocumentUrl: 'https://example.com/id.pdf',
  identityDocumentBackUrl: null,
  criminalRecordUrl: 'https://example.com/cr.pdf',
  professionalRegistrationUrl: 'https://example.com/pr.pdf',
  liabilityInsuranceUrl: 'https://example.com/li.pdf',
  monotributoCertificateUrl: null,
  atCertificateUrl: null,
  documentsStatus: 'approved',
  submittedAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
};

const COMPLETE_AVAILABILITY = [
  { id: 'a-1', workerId: 'w-1', dayOfWeek: 1, startTime: '09:00', endTime: '17:00', timezone: 'America/Argentina/Buenos_Aires', crossesMidnight: false },
];

const COMPLETE_WORKER = {
  id: 'w-1',
  authUid: 'uid-1',
  email: 'at@test.com',
  status: 'active',
  country: 'AR',
  timezone: 'America/Argentina/Buenos_Aires',
  createdAt: '2026-01-01T00:00:00Z',
  updatedAt: '2026-01-01T00:00:00Z',
  // Step 1 fields (isStep1Complete)
  firstName: 'Ana',
  lastName: 'García',
  birthDate: '1990-05-15',
  sex: 'female',
  gender: 'female',
  documentType: 'CUIL_CUIT',
  documentNumber: '27123456789',
  languages: ['es'],
  profession: 'caregiver',
  knowledgeLevel: 'technical',
  experienceTypes: ['adhd'],
  yearsExperience: '3_5',
  preferredTypes: ['adhd'],
  preferredAgeRange: ['adolescents'],
  // Step 2 fields (isStep2Complete)
  serviceAddress: 'Av. Corrientes 1234, Buenos Aires',
  serviceRadiusKm: 10,
};

function wrapper({ children }: { children: React.ReactNode }) {
  return React.createElement(MemoryRouter, null, children);
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('usePostularseAction', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal('open', vi.fn());

    // Default: authenticated worker with complete registration and docs
    mockUseAuth.mockReturnValue({
      isAuthenticated: true,
      isLoading: false,
      user: null,
      login: vi.fn(),
      loginWithGoogle: vi.fn(),
      register: vi.fn(),
      logout: vi.fn(),
    });

    mockGetProgress.mockResolvedValue(COMPLETE_WORKER);
    mockGetAvailability.mockResolvedValue(COMPLETE_AVAILABILITY);
    mockGetDocuments.mockResolvedValue(COMPLETE_DOCS);
  });

  // -------------------------------------------------------------------------
  // 1. whatsappUrl null
  // -------------------------------------------------------------------------

  it('sets state to not_available when whatsappUrl is null', async () => {
    const { result } = renderHook(() => usePostularseAction(null), { wrapper });

    await act(async () => {
      await result.current.postularse();
    });

    expect(result.current.state).toBe('not_available');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 2. Not authenticated
  // -------------------------------------------------------------------------

  describe('when worker is NOT authenticated', () => {
    beforeEach(() => {
      mockUseAuth.mockReturnValue({
        isAuthenticated: false,
        isLoading: false,
        user: null,
        login: vi.fn(),
        loginWithGoogle: vi.fn(),
        register: vi.fn(),
        logout: vi.fn(),
      });
    });

    it('sets state to unauthenticated', async () => {
      const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

      await act(async () => {
        await result.current.postularse();
      });

      expect(result.current.state).toBe('unauthenticated');
      expect(mockGetProgress).not.toHaveBeenCalled();
      expect(window.open).not.toHaveBeenCalled();
    });

    it('confirmRegister navigates to /register', async () => {
      const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

      await act(async () => {
        await result.current.postularse();
      });

      act(() => {
        result.current.confirmRegister();
      });

      expect(mockNavigate).toHaveBeenCalledWith('/register');
    });

    it('dismissModal resets state to idle', async () => {
      const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

      await act(async () => {
        await result.current.postularse();
      });

      expect(result.current.state).toBe('unauthenticated');

      act(() => {
        result.current.dismissModal();
      });

      expect(result.current.state).toBe('idle');
    });
  });

  // -------------------------------------------------------------------------
  // 3. Authenticated + registrationCompleted = false
  // -------------------------------------------------------------------------

  it('sets state to incomplete with missingFields when registration is incomplete', async () => {
    mockGetProgress.mockResolvedValue({
      ...COMPLETE_WORKER,
      // Remove step 1 required fields to simulate incomplete registration
      firstName: undefined,
      lastName: undefined,
    });

    const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

    await act(async () => {
      await result.current.postularse();
    });

    expect(result.current.state).toBe('incomplete');
    expect(result.current.missingFields).not.toBeNull();
    expect(result.current.missingFields!.registration.firstName).toBe(false);
    expect(result.current.missingFields!.registration.lastName).toBe(false);
    expect(result.current.missingFields!.registration.profession).toBe(true);
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  // -------------------------------------------------------------------------
  // 4. Authenticated + registrationCompleted = true + docs incompletos
  // -------------------------------------------------------------------------

  it.each([
    ['resumeCvUrl', 'resumeCv', { resumeCvUrl: null }],
    ['identityDocumentUrl', 'identityDocument', { identityDocumentUrl: null }],
    ['criminalRecordUrl', 'criminalRecord', { criminalRecordUrl: null }],
    ['professionalRegistrationUrl', 'professionalRegistration', { professionalRegistrationUrl: null }],
    ['liabilityInsuranceUrl', 'liabilityInsurance', { liabilityInsuranceUrl: null }],
  ])(
    'sets state to incomplete when %s is missing',
    async (_fieldName, docKey, missingField) => {
      mockGetDocuments.mockResolvedValue({ ...COMPLETE_DOCS, ...missingField });

      const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

      await act(async () => {
        await result.current.postularse();
      });

      expect(result.current.state).toBe('incomplete');
      expect(result.current.missingFields!.documents[docKey]).toBe(false);
      expect(mockNavigate).not.toHaveBeenCalled();
      expect(window.open).not.toHaveBeenCalled();
    },
  );

  // -------------------------------------------------------------------------
  // 5. Authenticated + registrationCompleted = true + todos os 5 docs
  // -------------------------------------------------------------------------

  it('opens whatsapp URL when worker is complete with all 5 documents', async () => {
    const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

    await act(async () => {
      await result.current.postularse();
    });

    expect(window.open).toHaveBeenCalledWith(WHATSAPP_URL, '_blank');
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(result.current.state).toBe('idle');
  });

  // -------------------------------------------------------------------------
  // 6. getProgress throws → fallback to /worker/profile
  // -------------------------------------------------------------------------

  it('sets state to incomplete when getProgress throws an error', async () => {
    mockGetProgress.mockRejectedValue(new Error('Network error'));

    const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

    await act(async () => {
      await result.current.postularse();
    });

    expect(result.current.state).toBe('incomplete');
    expect(result.current.missingFields).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });

  it('sets state to incomplete when getDocuments throws an error', async () => {
    mockGetDocuments.mockRejectedValue(new Error('Documents fetch failed'));

    const { result } = renderHook(() => usePostularseAction(WHATSAPP_URL), { wrapper });

    await act(async () => {
      await result.current.postularse();
    });

    expect(result.current.state).toBe('incomplete');
    expect(result.current.missingFields).toBeNull();
    expect(mockNavigate).not.toHaveBeenCalled();
    expect(window.open).not.toHaveBeenCalled();
  });
});
