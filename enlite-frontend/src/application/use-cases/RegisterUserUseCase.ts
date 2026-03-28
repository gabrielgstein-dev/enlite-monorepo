import { User } from '@domain/entities/User';
import { IUserRepository } from '@domain/repositories/IUserRepository';
import { Result } from '@domain/value-objects/Result';

export interface RegisterUserInput {
  email: string;
  password: string;
  role?: string;
  whatsapp?: string;
  lgpdOptIn?: boolean;
}

export interface RegisterUserOutput {
  user: User;
  idToken: string;
}

interface AuthService {
  signUpWithEmail(email: string, password: string): Promise<{ user: User; idToken: string }>;
  signInWithEmail(email: string, password: string): Promise<{ user: User; idToken: string }>;
}

export class RegisterUserUseCase {
  constructor(
    private readonly authService: AuthService,
    private readonly userRepository: IUserRepository
  ) {}

  async execute(input: RegisterUserInput): Promise<Result<RegisterUserOutput, Error>> {
    try {
      // Step 1: Create user in Firebase Auth
      const authResult = await this.authService.signUpWithEmail(input.email, input.password);

      // Step 2: If role provided, create user record with role in backend
      if (input.role) {
        try {
          await this.userRepository.createUserWithRole({
            firebaseUid: authResult.user.id,
            email: input.email,
            role: input.role,
            idToken: authResult.idToken,
          });

          // Update user with role for return
          const userWithRole: User = {
            ...authResult.user,
            roles: [input.role],
          };

          return Result.ok({ user: userWithRole, idToken: authResult.idToken });
        } catch (roleError) {
          // Log error but don't fail registration if role assignment fails
          console.error('Failed to assign user role:', roleError);
        }
      }

      return Result.ok(authResult);
    } catch (error) {
      // Fallback: if email already exists, try signing in with same credentials
      const isEmailAlreadyInUse = error instanceof Error && (
        error.message.includes('email-already-in-use') ||
        error.message.includes('EMAIL_EXISTS')
      );
      if (isEmailAlreadyInUse) {
        try {
          const signInResult = await this.authService.signInWithEmail(input.email, input.password);
          return Result.ok(signInResult);
        } catch {
          // sign-in also failed (wrong password) — return original error
          return Result.fail(error instanceof Error ? error : new Error('Registration failed'));
        }
      }
      return Result.fail(error instanceof Error ? error : new Error('Registration failed'));
    }
  }
}
