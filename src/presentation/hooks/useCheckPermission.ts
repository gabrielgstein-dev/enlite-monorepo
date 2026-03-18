import { useState, useCallback } from 'react';
import { ResourceAction } from '@domain/entities/Resource';
import { Container } from '@infrastructure/di/Container';

export function useCheckPermission() {
  const [isChecking, setIsChecking] = useState(false);

  const checkPermission = useCallback(async (action: ResourceAction): Promise<boolean> => {
    setIsChecking(true);
    const container = Container.getInstance();
    const useCase = container.getCheckPermissionUseCase();
    const result = await useCase.execute(action);
    setIsChecking(false);
    
    return result.isSuccess() ? result.getValue() : false;
  }, []);

  return { checkPermission, isChecking };
}
