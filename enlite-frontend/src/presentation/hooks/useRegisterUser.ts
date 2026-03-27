import { useState, useCallback } from 'react';
import { Container } from '@infrastructure/di/Container';
import { User } from '@domain/entities/User';
import { RegisterUserInput } from '@application/use-cases/RegisterUserUseCase';

interface UseRegisterUserReturn {
  register: (input: RegisterUserInput) => Promise<User>;
  isLoading: boolean;
  error: Error | null;
}

export function useRegisterUser(): UseRegisterUserReturn {
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<Error | null>(null);

  const register = useCallback(async (input: RegisterUserInput): Promise<User> => {
    setIsLoading(true);
    setError(null);

    try {
      const container = Container.getInstance();
      const useCase = container.getRegisterUserUseCase();
      
      const result = await useCase.execute(input);
      
      if (result.isFailure()) {
        throw result.getError();
      }

      const output = result.getValue();
      return output.user;
    } catch (err) {
      const error = err instanceof Error ? err : new Error('Registration failed');
      setError(error);
      throw error;
    } finally {
      setIsLoading(false);
    }
  }, []);

  return {
    register,
    isLoading,
    error,
  };
}
