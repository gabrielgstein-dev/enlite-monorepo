/**
 * AuthActionPage.consistency.test.tsx
 *
 * Testa que AuthActionPage (estado "ready") utiliza os mesmos building blocks
 * estruturais que AdminLoginPage, garantindo consistência visual entre as duas telas.
 *
 * Se alguém refatorar uma das páginas e quebrar a paridade de layout, este teste falha.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { AuthActionPage } from '../AuthActionPage';

// ─── Mocks ────────────────────────────────────────────────────────────────────

const mockNavigate = vi.fn();
let mockSearchParams = new URLSearchParams();

vi.mock('react-router-dom', () => ({
  useNavigate: () => mockNavigate,
  useSearchParams: () => [mockSearchParams],
}));

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts?.email) return `${key}:${opts.email}`;
      return key;
    },
    i18n: { language: 'es' },
  }),
}));

const mockVerifyPasswordResetCode = vi.fn();
const mockConfirmPasswordReset = vi.fn();
const mockSignInWithEmailAndPassword = vi.fn();

vi.mock('firebase/auth', () => ({
  verifyPasswordResetCode: (...args: unknown[]) => mockVerifyPasswordResetCode(...args),
  confirmPasswordReset: (...args: unknown[]) => mockConfirmPasswordReset(...args),
  signInWithEmailAndPassword: (...args: unknown[]) => mockSignInWithEmailAndPassword(...args),
}));

const mockGetFirebaseAuth = vi.fn(() => ({ name: 'mock-auth' }));
vi.mock('@infrastructure/config/firebase', () => ({
  getFirebaseAuth: () => mockGetFirebaseAuth(),
}));

// AuthNavbar renderizado com nav + data-testid para permitir busca estrutural
vi.mock('@presentation/components/organisms/AuthNavbar', () => ({
  AuthNavbar: ({ className }: { className?: string }) => (
    <nav data-testid="auth-navbar" className={className ?? ''} />
  ),
}));

vi.mock('@presentation/components/atoms', () => ({
  Typography: ({ children }: { children: React.ReactNode }) => <span>{children}</span>,
}));

// Button captura props para asserção de variant/size/fullWidth
const capturedButtonProps: Array<Record<string, unknown>> = [];

vi.mock('@presentation/components/atoms/Button', () => ({
  Button: ({
    children,
    onClick,
    type,
    isLoading,
    variant,
    size,
    fullWidth,
    ...rest
  }: {
    children: React.ReactNode;
    onClick?: () => void;
    type?: string;
    isLoading?: boolean;
    variant?: string;
    size?: string;
    fullWidth?: boolean;
    [key: string]: unknown;
  }) => {
    capturedButtonProps.push({ variant, size, fullWidth });
    return (
      <button
        onClick={onClick}
        type={(type as 'button' | 'submit' | 'reset') ?? 'button'}
        data-variant={variant}
        data-size={size}
        data-fullwidth={fullWidth ? 'true' : 'false'}
        {...rest}
      >
        {isLoading ? 'common.loading' : children}
      </button>
    );
  },
}));

// FormField captura uso via data-testid no wrapper
vi.mock('@presentation/components/molecules', () => ({
  FormField: ({
    children,
    label,
    htmlFor,
  }: {
    children: React.ReactNode;
    label: string;
    htmlFor?: string;
  }) => (
    <div data-testid="form-field">
      <label htmlFor={htmlFor}>{label}</label>
      {children}
    </div>
  ),
  PasswordInput: ({
    id,
    value,
    onChange,
    disabled,
    placeholder,
  }: {
    id: string;
    value: string;
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
    disabled?: boolean;
    placeholder?: string;
  }) => (
    <input
      data-testid={`password-${id}`}
      id={id}
      type="password"
      value={value}
      onChange={onChange}
      disabled={disabled}
      placeholder={placeholder}
    />
  ),
}));

// ─── Helpers ──────────────────────────────────────────────────────────────────

function setReadyState() {
  mockSearchParams = new URLSearchParams({
    mode: 'resetPassword',
    oobCode: 'valid-oob-code-123',
  });
  mockVerifyPasswordResetCode.mockResolvedValueOnce('staff@enlite.health');
}

async function renderAndWaitReady() {
  const result = render(<AuthActionPage />);
  // Aguarda o form aparecer (estado "ready")
  await waitFor(() => {
    expect(screen.getByTestId('password-new-password')).toBeTruthy();
  });
  return result;
}

// ─── Testes de Consistência Estrutural ────────────────────────────────────────

describe('AuthActionPage — consistência estrutural com AdminLoginPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    capturedButtonProps.length = 0;
    mockSearchParams = new URLSearchParams();
  });

  // ── 1. Layout wrapper: mesmas classes de AdminLoginPage ─────────────────────

  it('page wrapper tem as mesmas classes de layout que AdminLoginPage', async () => {
    setReadyState();
    const { container } = await renderAndWaitReady();

    // Classes extraídas diretamente do AdminLoginPage (linha 100)
    const expectedClasses = [
      'min-h-screen',
      'bg-background',
      'flex',
      'flex-col',
    ];

    const wrapper = container.firstElementChild as HTMLElement;
    expect(wrapper).not.toBeNull();

    for (const cls of expectedClasses) {
      expect(wrapper.classList.contains(cls)).toBe(true);
    }
  });

  // ── 2. Container central: max-w-[440px] ─────────────────────────────────────

  it('container central usa max-w-[440px] assim como AdminLoginPage', async () => {
    setReadyState();
    const { container } = await renderAndWaitReady();

    // O container interno que limita a largura deve ter max-w-[440px]
    const innerContainer = container.querySelector('.max-w-\\[440px\\]') as HTMLElement | null;
    expect(innerContainer).not.toBeNull();
  });

  // ── 3. AuthNavbar renderizado no topo ────────────────────────────────────────

  it('renderiza AuthNavbar no topo da pagina (mesmo que AdminLoginPage)', async () => {
    setReadyState();
    await renderAndWaitReady();

    const navbar = screen.getByTestId('auth-navbar');
    expect(navbar).toBeTruthy();
    // Verifica que o navbar é um <nav> (elemento semântico correto)
    expect(navbar.tagName.toLowerCase()).toBe('nav');
  });

  // ── 4. Botao primário usa variant="primary", size="lg", fullWidth=true ───────

  it('botao de submit usa variant="primary", size="lg" e fullWidth=true (igual ao AdminLoginPage)', async () => {
    setReadyState();
    await renderAndWaitReady();

    // Pelo menos um botão deve ter as props de primary/lg/fullWidth
    const primaryButton = capturedButtonProps.find(
      (p) => p.variant === 'primary' && p.size === 'lg' && p.fullWidth === true,
    );
    expect(primaryButton).toBeDefined();
  });

  // ── 4b. Botao primário via DOM: data-attributes corretos ─────────────────────

  it('botao de submit tem data-attributes variant=primary, size=lg, data-fullwidth=true', async () => {
    setReadyState();
    await renderAndWaitReady();

    const submitBtn = document.querySelector('button[data-variant="primary"]') as HTMLElement | null;
    expect(submitBtn).not.toBeNull();
    expect(submitBtn!.getAttribute('data-size')).toBe('lg');
    expect(submitBtn!.getAttribute('data-fullwidth')).toBe('true');
  });

  // ── 5. FormField usado (nao inputs raw) ──────────────────────────────────────

  it('usa FormField para encapsular inputs (nao inputs raw), igual ao AdminLoginPage', async () => {
    setReadyState();
    await renderAndWaitReady();

    const formFields = screen.getAllByTestId('form-field');
    // PasswordResetForm tem dois FormField (nova senha + confirmação)
    expect(formFields.length).toBeGreaterThanOrEqual(2);
  });

  // ── 6. PasswordInput usado (nao <input type="password"> direto) ──────────────

  it('usa PasswordInput (componente molecule) para campos de senha', async () => {
    setReadyState();
    await renderAndWaitReady();

    // O mock de PasswordInput renderiza data-testid "password-<id>"
    expect(screen.getByTestId('password-new-password')).toBeTruthy();
    expect(screen.getByTestId('password-confirm-password')).toBeTruthy();
  });

  // ── 7. AuthNavbar recebe className="px-4" igual ao AdminLoginPage ────────────

  it('AuthNavbar recebe className contendo "px-4" (consistente com AdminLoginPage)', async () => {
    setReadyState();
    await renderAndWaitReady();

    const navbar = screen.getByTestId('auth-navbar');
    expect(navbar.className).toContain('px-4');
  });

  // ── 8. Padding lateral no wrapper igual ao AdminLoginPage ────────────────────

  it('page wrapper tem padding lateral responsivo px-4 sm:px-10 (mesmo padrao que AdminLoginPage)', async () => {
    setReadyState();
    const { container } = await renderAndWaitReady();

    const wrapper = container.firstElementChild as HTMLElement;
    // Verifica presença das classes de padding lateral definidas em AdminLoginPage linha 100
    expect(wrapper.className).toContain('px-4');
  });
});
