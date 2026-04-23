/**
 * ResetAdminPasswordUseCase.test.ts
 *
 * Unit tests for the invitation-link-based password reset flow.
 *
 * Scenarios:
 * 1. Success: fetches Firebase user, generates reset link, sends email, returns link
 * 2. Fails fast if Firebase user has no email
 * 3. Fails if Firebase throws on getUser
 * 4. Non-fatal: email send failure does NOT abort — resetLink still returned
 * 5. Uses display name when present; falls back to email prefix when absent
 * 6. Passes resetLink to sendPasswordResetEmail unchanged
 */

const mockGetUser = jest.fn();
const mockGeneratePasswordResetLink = jest.fn();
const mockSendPasswordResetEmail = jest.fn();

jest.mock('firebase-admin', () => {
  return {
    __esModule: true,
    auth: () => ({
      getUser: mockGetUser,
      generatePasswordResetLink: mockGeneratePasswordResetLink,
    }),
  };
});

jest.mock('../../infrastructure/EmailService', () => ({
  EmailService: jest.fn().mockImplementation(() => ({
    sendPasswordResetEmail: mockSendPasswordResetEmail,
  })),
}));

import { ResetAdminPasswordUseCase } from '../ResetAdminPasswordUseCase';

describe('ResetAdminPasswordUseCase', () => {
  const firebaseUid = 'uid-abc-123';

  beforeEach(() => {
    mockGetUser.mockReset();
    mockGeneratePasswordResetLink.mockReset();
    mockSendPasswordResetEmail.mockReset();
    mockSendPasswordResetEmail.mockResolvedValue(undefined);
  });

  it('success: generates link, sends email, returns Result.ok with resetLink', async () => {
    mockGetUser.mockResolvedValue({
      uid: firebaseUid,
      email: 'admin@enlite.health',
      displayName: 'Ana Admin',
    });
    mockGeneratePasswordResetLink.mockResolvedValue('https://firebase.link/reset-xyz');

    const useCase = new ResetAdminPasswordUseCase();
    const result = await useCase.execute(firebaseUid);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({ resetLink: 'https://firebase.link/reset-xyz' });
    expect(mockGetUser).toHaveBeenCalledWith(firebaseUid);
    expect(mockGeneratePasswordResetLink).toHaveBeenCalledWith('admin@enlite.health');
    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'admin@enlite.health',
      'Ana Admin',
      'https://firebase.link/reset-xyz',
    );
  });

  it('fails when Firebase user has no email', async () => {
    mockGetUser.mockResolvedValue({ uid: firebaseUid, email: null, displayName: 'x' });

    const useCase = new ResetAdminPasswordUseCase();
    const result = await useCase.execute(firebaseUid);

    expect(result.isFailure).toBe(true);
    expect(result.error).toMatch(/no email/i);
    expect(mockGeneratePasswordResetLink).not.toHaveBeenCalled();
    expect(mockSendPasswordResetEmail).not.toHaveBeenCalled();
  });

  it('fails when Firebase getUser throws', async () => {
    mockGetUser.mockRejectedValue(new Error('User not found'));

    const useCase = new ResetAdminPasswordUseCase();
    const result = await useCase.execute(firebaseUid);

    expect(result.isFailure).toBe(true);
    expect(result.error).toBe('User not found');
  });

  it('email failure is non-fatal — resetLink still returned', async () => {
    mockGetUser.mockResolvedValue({
      uid: firebaseUid,
      email: 'admin@enlite.health',
      displayName: 'Ana',
    });
    mockGeneratePasswordResetLink.mockResolvedValue('https://firebase.link/reset-abc');
    mockSendPasswordResetEmail.mockRejectedValue(new Error('SendGrid 500'));

    const useCase = new ResetAdminPasswordUseCase();
    const result = await useCase.execute(firebaseUid);

    expect(result.isSuccess).toBe(true);
    expect(result.getValue()).toEqual({ resetLink: 'https://firebase.link/reset-abc' });
  });

  it('falls back to email prefix when Firebase displayName is absent', async () => {
    mockGetUser.mockResolvedValue({
      uid: firebaseUid,
      email: 'carlos@enlite.health',
      displayName: null,
    });
    mockGeneratePasswordResetLink.mockResolvedValue('https://firebase.link/reset');

    const useCase = new ResetAdminPasswordUseCase();
    await useCase.execute(firebaseUid);

    expect(mockSendPasswordResetEmail).toHaveBeenCalledWith(
      'carlos@enlite.health',
      'carlos',
      'https://firebase.link/reset',
    );
  });
});
