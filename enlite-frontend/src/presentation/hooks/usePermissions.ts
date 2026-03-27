import { useState, useEffect } from 'react';
import { UserPermissions } from '@domain/entities/User';
import { Container } from '@infrastructure/di/Container';

export function usePermissions(resourceType: string) {
  const [permissions, setPermissions] = useState<UserPermissions>({
    canRead: false,
    canWrite: false,
    canDelete: false,
    canManage: false,
  });
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    const loadPermissions = async () => {
      setIsLoading(true);
      const container = Container.getInstance();
      const useCase = container.getUserPermissionsUseCase();
      const result = await useCase.execute(resourceType);
      
      if (result.isSuccess()) {
        setPermissions(result.getValue());
      }
      setIsLoading(false);
    };

    loadPermissions();
  }, [resourceType]);

  return { permissions, isLoading };
}
