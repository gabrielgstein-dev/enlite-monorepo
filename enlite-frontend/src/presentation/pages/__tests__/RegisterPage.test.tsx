import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, fireEvent, waitFor, screen } from '@testing-library/react';
import { RegisterPage } from '../RegisterPage';

// ─── Mocks ───────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
const mockRegister = vi.fn();
const mockInitWorker = vi.fn();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  Link: ({ children, to, ...rest }: any) => <a href={to} {...rest}>{children}</a>,
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string) => key,
    i18n: { language: 'es' },
  }),
}));

vi.mock('@presentation/hooks/useRegisterUser', () => ({
  useRegisterUser: () => ({
    register: mockRegister,
    isLoading: false,
  }),
}));

vi.mock('@infrastructure/http/WorkerApiService', () => ({
  WorkerApiService: {
    initWorker: (...args: any[]) => mockInitWorker(...args),
  },
}));

vi.mock('@presentation/components/features/auth/GoogleLoginButton', () => ({
  GoogleLoginButton: () => <button data-testid="google-btn">Google</button>,
}));

vi.mock('@presentation/components/shared/PhoneInputIntl', () => ({
  PhoneInputIntl: ({ value, onChange }: any) => (
    <input data-testid="phone-input" value={value} onChange={(e: any) => onChange(e.target.value)} />
  ),
}));

vi.mock('@presentation/components/atoms', () => ({
  Typography: ({ children }: any) => <span>{children}</span>,
  Checkbox: ({ id, label, labelContent, checked, onChange, error }: any) => (
    <div data-testid={`checkbox-${id}`}>
      <input
        id={id}
        type="checkbox"
        checked={checked}
        onChange={onChange}
        data-testid={`checkbox-input-${id}`}
      />
      {labelContent
        ? <div data-testid={`checkbox-labelcontent-${id}`}>{labelContent}</div>
        : label && <span data-testid={`checkbox-label-${id}`}>{label}</span>
      }
      {error && <span data-testid={`checkbox-error-${id}`}>{error}</span>}
    </div>
  ),
  Divider: () => <hr />,
}));

vi.mock('@presentation/components/atoms/Button', () => ({
  Button: ({ children, ...props }: any) => <button {...props}>{children}</button>,
}));

vi.mock('@presentation/components/molecules', () => ({
  FormField: ({ children, label }: any) => <div><label>{label}</label>{children}</div>,
  InputWithIcon: ({ id, value, onChange, ...rest }: any) => (
    <input id={id} value={value} onChange={onChange} data-testid={`input-${id}`} {...rest} />
  ),
  PasswordInput: ({ id, value, onChange }: any) => (
    <input id={id} type="password" value={value} onChange={onChange} data-testid={`input-${id}`} />
  ),
}));

vi.mock('@presentation/components/organisms/AuthNavbar', () => ({
  AuthNavbar: ({ actions }: any) => <nav>{actions}</nav>,
}));

vi.mock('@presentation/utils/authErrorMapper', () => ({
  getAuthErrorMessage: (err: Error) => err.message,
}));

// ─── Helpers ─────────────────────────────────────────────────────────────────

function fillForm(overrides: {
  email?: string;
  password?: string;
  confirmPassword?: string;
  lgpd?: boolean;
} = {}) {
  const email = overrides.email ?? 'test@example.com';
  const password = overrides.password ?? 'password123';
  const confirmPassword = overrides.confirmPassword ?? 'password123';

  fireEvent.change(screen.getByTestId('input-email'), { target: { value: email } });
  fireEvent.change(screen.getByTestId('input-password'), { target: { value: password } });
  fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: confirmPassword } });

  if (overrides.lgpd !== false) {
    fireEvent.click(screen.getByTestId('checkbox-input-lgpdOptIn'));
  }
}

function submitForm() {
  const form = screen.getByTestId('input-email').closest('form')!;
  fireEvent.submit(form);
}

// ─── Testes ──────────────────────────────────────────────────────────────────

describe('RegisterPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegister.mockResolvedValue({ id: 'uid-123', email: 'test@example.com' });
    mockInitWorker.mockResolvedValue({});
  });

  // ─── Conteúdo rico do checkbox LGPD ─────────────────────────────────────

  describe('labelContent do checkbox LGPD', () => {
    it('renderiza labelContent com titulo, subtitulo e corpo', () => {
      render(<RegisterPage />);
      const labelContent = screen.getByTestId('checkbox-labelcontent-lgpdOptIn');
      expect(labelContent).toBeTruthy();
      // O mock de t() retorna a chave, entao verificamos as chaves i18n
      expect(labelContent.textContent).toContain('register.lgpdOptIn');
      expect(labelContent.textContent).toContain('register.lgpdSubtitle');
      expect(labelContent.textContent).toContain('register.lgpdTermsLinkText');
    });

    it('nao renderiza label simples (usa labelContent)', () => {
      render(<RegisterPage />);
      expect(screen.queryByTestId('checkbox-label-lgpdOptIn')).toBeNull();
    });
  });

  // ─── Validação do checkbox LGPD ──────────────────────────────────────────

  describe('validacao do checkbox LGPD', () => {
    it('mostra erro no checkbox quando submete sem marcar LGPD (todos campos preenchidos)', async () => {
      render(<RegisterPage />);
      fillForm({ lgpd: false });
      submitForm();

      await waitFor(() => {
        expect(screen.getByTestId('checkbox-error-lgpdOptIn')).toBeTruthy();
        expect(screen.getByTestId('checkbox-error-lgpdOptIn').textContent).toBe('register.lgpdRequired');
      });
    });

    it('nao mostra banner generico quando unico erro e o checkbox LGPD', async () => {
      render(<RegisterPage />);
      fillForm({ lgpd: false });
      submitForm();

      await waitFor(() => {
        expect(screen.getByTestId('checkbox-error-lgpdOptIn')).toBeTruthy();
      });

      // Banner generico nao deve existir
      const banner = document.querySelector('.bg-red-50');
      expect(banner).toBeNull();
    });

    it('mostra tanto banner generico quanto erro no checkbox quando ha multiplos erros', async () => {
      render(<RegisterPage />);
      // Email vazio + LGPD desmarcado
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
      fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'password123' } });
      submitForm();

      await waitFor(() => {
        // Banner generico (email obrigatorio)
        const banner = document.querySelector('.bg-red-50');
        expect(banner).toBeTruthy();
        // Erro no checkbox
        expect(screen.getByTestId('checkbox-error-lgpdOptIn')).toBeTruthy();
      });
    });

    it('limpa erro do checkbox quando usuario marca o checkbox', async () => {
      render(<RegisterPage />);
      fillForm({ lgpd: false });
      submitForm();

      await waitFor(() => {
        expect(screen.getByTestId('checkbox-error-lgpdOptIn')).toBeTruthy();
      });

      // Marca o checkbox
      fireEvent.click(screen.getByTestId('checkbox-input-lgpdOptIn'));

      // Erro deve sumir
      expect(screen.queryByTestId('checkbox-error-lgpdOptIn')).toBeNull();
    });

    it('nao chama register quando checkbox LGPD nao esta marcado', async () => {
      render(<RegisterPage />);
      fillForm({ lgpd: false });
      submitForm();

      await waitFor(() => {
        expect(screen.getByTestId('checkbox-error-lgpdOptIn')).toBeTruthy();
      });

      expect(mockRegister).not.toHaveBeenCalled();
    });
  });

  // ─── Fluxo de sucesso ────────────────────────────────────────────────────

  describe('fluxo de sucesso com checkbox marcado', () => {
    it('chama register e initWorker com lgpdOptIn=true quando form e valido', async () => {
      render(<RegisterPage />);
      fillForm();
      submitForm();

      await waitFor(() => {
        expect(mockRegister).toHaveBeenCalledWith(
          expect.objectContaining({ lgpdOptIn: true })
        );
      });

      await waitFor(() => {
        expect(mockInitWorker).toHaveBeenCalledWith(
          expect.objectContaining({ lgpdOptIn: true, country: 'AR' })
        );
      });
    });

    it('navega para / apos registro com sucesso', async () => {
      render(<RegisterPage />);
      fillForm();
      submitForm();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });

    it('navega para / mesmo se initWorker falhar (non-blocking)', async () => {
      mockInitWorker.mockRejectedValue(new Error('Network error'));
      render(<RegisterPage />);
      fillForm();
      submitForm();

      await waitFor(() => {
        expect(mockNavigate).toHaveBeenCalledWith('/');
      });
    });
  });

  // ─── Erros de validação (não-LGPD) ────────────────────────────────────────

  describe('erros de validacao do formulario', () => {
    it('mostra erro de email obrigatorio quando email vazio', async () => {
      render(<RegisterPage />);
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: 'password123' } });
      fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: 'password123' } });
      fireEvent.click(screen.getByTestId('checkbox-input-lgpdOptIn'));
      submitForm();

      await waitFor(() => {
        const banner = document.querySelector('.bg-red-50');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toBe('login.emailRequired');
      });
    });

    it('mostra erro de senha curta quando senha tem menos de 6 caracteres', async () => {
      render(<RegisterPage />);
      fireEvent.change(screen.getByTestId('input-email'), { target: { value: 'test@test.com' } });
      fireEvent.change(screen.getByTestId('input-password'), { target: { value: '123' } });
      fireEvent.change(screen.getByTestId('input-confirmPassword'), { target: { value: '123' } });
      fireEvent.click(screen.getByTestId('checkbox-input-lgpdOptIn'));
      submitForm();

      await waitFor(() => {
        const banner = document.querySelector('.bg-red-50');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toBe('register.passwordTooShort');
      });
    });
  });

  // ─── Erro do register (Firebase) ──────────────────────────────────────────

  describe('erro no register (Firebase)', () => {
    it('mostra erro traduzido quando register falha', async () => {
      mockRegister.mockRejectedValue(new Error('auth/email-already-in-use'));
      render(<RegisterPage />);
      fillForm();
      submitForm();

      await waitFor(() => {
        const banner = document.querySelector('.bg-red-50');
        expect(banner).toBeTruthy();
        expect(banner!.textContent).toBe('auth/email-already-in-use');
      });
    });
  });
});
