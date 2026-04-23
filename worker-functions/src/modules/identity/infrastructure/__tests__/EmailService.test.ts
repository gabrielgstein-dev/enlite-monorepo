/**
 * EmailService.test.ts
 *
 * Unit tests for the SendGrid-backed transactional email service.
 *
 * Scenarios:
 * 1. sendInvitationEmail — calls sgMail.send with correct to/from/subject
 * 2. sendInvitationEmail — HTML contains the invite link + CTA
 * 3. sendInvitationEmail — HTML contains the recipient's name
 * 4. sendPasswordResetEmail — calls sgMail.send with correct to/from/subject
 * 5. sendPasswordResetEmail — HTML contains the reset link + CTA
 * 6. EMAIL_FROM env var is respected
 * 7. EMAIL_FROM falls back to enlite@enlite.health when unset
 * 8. SENDGRID_API_KEY is passed to sgMail.setApiKey on construction
 * 9. Propagates SendGrid errors (caller decides how to handle)
 */

const mockSend = jest.fn();
const mockSetApiKey = jest.fn();

jest.mock('@sendgrid/mail', () => ({
  __esModule: true,
  default: {
    send: (...args: unknown[]) => mockSend(...args),
    setApiKey: (...args: unknown[]) => mockSetApiKey(...args),
  },
}));

import { EmailService } from '../EmailService';

describe('EmailService', () => {
  beforeEach(() => {
    mockSend.mockReset();
    mockSetApiKey.mockReset();
    mockSend.mockResolvedValue([{ statusCode: 202, headers: { 'x-message-id': 'msg-test' } }]);
    delete process.env.EMAIL_FROM;
    delete process.env.SENDGRID_API_KEY;
  });

  describe('construction', () => {
    it('calls sgMail.setApiKey when SENDGRID_API_KEY is set', () => {
      process.env.SENDGRID_API_KEY = 'SG.test-key';
      new EmailService();
      expect(mockSetApiKey).toHaveBeenCalledWith('SG.test-key');
    });

    it('does NOT call sgMail.setApiKey when SENDGRID_API_KEY is unset', () => {
      delete process.env.SENDGRID_API_KEY;
      new EmailService();
      expect(mockSetApiKey).not.toHaveBeenCalled();
    });
  });

  describe('sendInvitationEmail', () => {
    it('calls sgMail.send with correct to/from/subject', async () => {
      process.env.EMAIL_FROM = 'custom-from@enlite.health';
      const service = new EmailService();
      await service.sendInvitationEmail('new-admin@enlite.health', 'Ana', 'https://firebase.link/abc');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('new-admin@enlite.health');
      expect(call.from).toEqual({ email: 'custom-from@enlite.health', name: 'Enlite' });
      expect(call.subject).toBe('Fuiste invitado a Enlite — Definí tu contraseña');
    });

    it('HTML contains invite link and CTA button', async () => {
      const service = new EmailService();
      await service.sendInvitationEmail('x@test.com', 'Ana', 'https://firebase.link/invite-xyz');

      const html = mockSend.mock.calls[0][0].html as string;
      expect(html).toContain('https://firebase.link/invite-xyz');
      expect(html).toContain('Definir contraseña');
    });

    it('HTML contains recipient name', async () => {
      const service = new EmailService();
      await service.sendInvitationEmail('x@test.com', 'Juan Pérez', 'https://link');

      const html = mockSend.mock.calls[0][0].html as string;
      expect(html).toContain('Juan Pérez');
    });
  });

  describe('sendPasswordResetEmail', () => {
    it('calls sgMail.send with correct to/from/subject', async () => {
      const service = new EmailService();
      await service.sendPasswordResetEmail('admin@enlite.health', 'Carlos', 'https://firebase.link/reset');

      expect(mockSend).toHaveBeenCalledTimes(1);
      const call = mockSend.mock.calls[0][0];
      expect(call.to).toBe('admin@enlite.health');
      expect(call.from).toEqual({ email: 'enlite@enlite.health', name: 'Enlite' });
      expect(call.subject).toBe('Restablecimiento de contraseña - Enlite');
    });

    it('HTML contains reset link and CTA button', async () => {
      const service = new EmailService();
      await service.sendPasswordResetEmail('x@test.com', 'Carlos', 'https://firebase.link/reset-abc');

      const html = mockSend.mock.calls[0][0].html as string;
      expect(html).toContain('https://firebase.link/reset-abc');
      expect(html).toContain('Restablecer contraseña');
    });
  });

  describe('EMAIL_FROM fallback', () => {
    it('uses enlite@enlite.health when EMAIL_FROM is not set', async () => {
      delete process.env.EMAIL_FROM;
      const service = new EmailService();
      await service.sendInvitationEmail('x@test.com', 'Ana', 'https://link');

      expect(mockSend.mock.calls[0][0].from).toEqual({
        email: 'enlite@enlite.health',
        name: 'Enlite',
      });
    });
  });

  describe('error propagation', () => {
    it('throws when SendGrid rejects', async () => {
      mockSend.mockRejectedValueOnce(new Error('401 Unauthorized'));
      const service = new EmailService();

      await expect(
        service.sendInvitationEmail('x@test.com', 'Ana', 'https://link'),
      ).rejects.toThrow('401 Unauthorized');
    });
  });
});
