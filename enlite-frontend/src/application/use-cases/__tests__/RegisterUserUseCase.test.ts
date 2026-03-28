import { describe, it, expect, vi, beforeEach } from 'vitest';
import { RegisterUserUseCase } from '../RegisterUserUseCase';
import { User } from '@domain/entities/User';
import { IUserRepository } from '@domain/repositories/IUserRepository';

// ─── types ───────────────────────────────────────────────────────────────────
// AuthService is a private interface inside RegisterUserUseCase — we mirror it
// here so the mock satisfies TypeScript strict mode without exporting internals.

interface AuthService {
  signUpWithEmail(email: string, password: string): Promise<{ user: User; idToken: string }>;
  signInWithEmail(email: string, password: string): Promise<{ user: User; idToken: string }>;
}

// ─── helpers ─────────────────────────────────────────────────────────────────

function makeUser(overrides: Partial<User> = {}): User {
  return {
    id: 'firebase-uid-Abc123XYZ789',
    email: 'gabriela.torres@example.com',
    name: 'Gabriela Torres',
    roles: [],
    createdAt: new Date('2024-06-01T10:00:00Z'),
    updatedAt: new Date('2024-06-01T10:00:00Z'),
    ...overrides,
  };
}

function makeAuthService(overrides: Partial<AuthService> = {}): AuthService {
  const noop = (_email: string, _password: string): Promise<{ user: User; idToken: string }> =>
    Promise.reject(new Error('not implemented'));
  return {
    signUpWithEmail: overrides.signUpWithEmail ?? vi.fn(noop),
    signInWithEmail: overrides.signInWithEmail ?? vi.fn(noop),
  };
}

function makeUserRepository(overrides: Partial<IUserRepository> = {}): IUserRepository {
  return {
    createUserWithRole: vi.fn().mockResolvedValue(makeUser()),
    ...overrides,
  };
}

// ─── tests ───────────────────────────────────────────────────────────────────

describe('RegisterUserUseCase', () => {
  let userRepository: IUserRepository;

  beforeEach(() => {
    userRepository = makeUserRepository();
  });

  // ── cenário 1: registro com email novo ──────────────────────────────────

  it('should return success when registering with a new email', async () => {
    const user = makeUser();
    const signUpWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockResolvedValue({ user, idToken: 'id-token-fresh-user' });
    const signInWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>();

    const authService = makeAuthService({ signUpWithEmail, signInWithEmail });
    const useCase = new RegisterUserUseCase(authService, userRepository);

    const result = await useCase.execute({
      email: 'gabriela.torres@example.com',
      password: 'S3nh@Segura!2024',
    });

    expect(result.isSuccess()).toBe(true);
    expect(result.getValue().user.id).toBe('firebase-uid-Abc123XYZ789');
    expect(result.getValue().idToken).toBe('id-token-fresh-user');
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  // ── cenário 2: email já existe no Firebase, senha correta → fallback sign-in ──

  it('should fall back to sign-in when email is already in use and password is correct', async () => {
    const existingUser = makeUser({ id: 'firebase-uid-ExistingUser99' });
    const emailAlreadyInUseError = new Error('Firebase: Error (auth/email-already-in-use).');

    const signUpWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockRejectedValue(emailAlreadyInUseError);
    const signInWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockResolvedValue({ user: existingUser, idToken: 'id-token-existing-user' });

    const authService = makeAuthService({ signUpWithEmail, signInWithEmail });
    const useCase = new RegisterUserUseCase(authService, userRepository);

    const result = await useCase.execute({
      email: 'gabriela.torres@example.com',
      password: 'S3nh@Segura!2024',
    });

    expect(result.isSuccess()).toBe(true);
    expect(result.getValue().user.id).toBe('firebase-uid-ExistingUser99');
    expect(result.getValue().idToken).toBe('id-token-existing-user');
    expect(signInWithEmail).toHaveBeenCalledWith(
      'gabriela.torres@example.com',
      'S3nh@Segura!2024'
    );
  });

  // ── cenário 2b: variante com mensagem EMAIL_EXISTS (Identity Platform) ───

  it('should fall back to sign-in when error message contains EMAIL_EXISTS', async () => {
    const legadoUser = makeUser({ id: 'firebase-uid-Legado77' });
    const emailExistsError = new Error('EMAIL_EXISTS');

    const signUpWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockRejectedValue(emailExistsError);
    const signInWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockResolvedValue({ user: legadoUser, idToken: 'id-token-legado' });

    const authService = makeAuthService({ signUpWithEmail, signInWithEmail });
    const useCase = new RegisterUserUseCase(authService, userRepository);

    const result = await useCase.execute({
      email: 'gabriela.torres@example.com',
      password: 'S3nh@Segura!2024',
    });

    expect(result.isSuccess()).toBe(true);
    expect(result.getValue().user.id).toBe('firebase-uid-Legado77');
  });

  // ── cenário 3: email já existe, senha errada → retorna erro original ─────

  it('should return the original error when email is already in use but password is wrong', async () => {
    const emailAlreadyInUseError = new Error('Firebase: Error (auth/email-already-in-use).');
    const wrongPasswordError = new Error('Firebase: Error (auth/wrong-password).');

    const signUpWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockRejectedValue(emailAlreadyInUseError);
    const signInWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockRejectedValue(wrongPasswordError);

    const authService = makeAuthService({ signUpWithEmail, signInWithEmail });
    const useCase = new RegisterUserUseCase(authService, userRepository);

    const result = await useCase.execute({
      email: 'gabriela.torres@example.com',
      password: 'SenhaErrada!999',
    });

    expect(result.isFailure()).toBe(true);
    expect(result.getError()).toBe(emailAlreadyInUseError);
    expect(result.getError().message).toContain('email-already-in-use');
  });

  // ── cenário 4: erro genérico no signUp → propaga diretamente ─────────────

  it('should propagate generic errors without attempting sign-in', async () => {
    const networkError = new Error('Firebase: Network request failed.');

    const signUpWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockRejectedValue(networkError);
    const signInWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>();

    const authService = makeAuthService({ signUpWithEmail, signInWithEmail });
    const useCase = new RegisterUserUseCase(authService, userRepository);

    const result = await useCase.execute({
      email: 'gabriela.torres@example.com',
      password: 'S3nh@Segura!2024',
    });

    expect(result.isFailure()).toBe(true);
    expect(result.getError()).toBe(networkError);
    expect(signInWithEmail).not.toHaveBeenCalled();
  });

  // ── cenário 5: signUp bem-sucedido com role → cria registro no backend ───

  it('should create user role record when role is provided on successful registration', async () => {
    const user = makeUser({ id: 'firebase-uid-WithRole55' });

    const signUpWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>()
      .mockResolvedValue({ user, idToken: 'id-token-role' });
    const signInWithEmail = vi.fn<[string, string], Promise<{ user: User; idToken: string }>>();

    const createUserWithRole = vi.fn().mockResolvedValue({ ...user, roles: ['worker'] });
    userRepository = makeUserRepository({ createUserWithRole });

    const authService = makeAuthService({ signUpWithEmail, signInWithEmail });
    const useCase = new RegisterUserUseCase(authService, userRepository);

    const result = await useCase.execute({
      email: 'gabriela.torres@example.com',
      password: 'S3nh@Segura!2024',
      role: 'worker',
    });

    expect(result.isSuccess()).toBe(true);
    expect(result.getValue().user.roles).toContain('worker');
    expect(createUserWithRole).toHaveBeenCalledWith(
      expect.objectContaining({
        firebaseUid: 'firebase-uid-WithRole55',
        email: 'gabriela.torres@example.com',
        role: 'worker',
        idToken: 'id-token-role',
      })
    );
  });
});
