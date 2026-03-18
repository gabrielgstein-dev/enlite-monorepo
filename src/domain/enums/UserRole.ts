export enum UserRole {
  WORKER = 'worker',
  ADMIN = 'admin',
  MANAGER = 'manager',
  CLIENT = 'client',
  SUPPORT = 'support',
}

export const roleLabels: Record<UserRole, string> = {
  [UserRole.WORKER]: 'Profissional de Saúde',
  [UserRole.ADMIN]: 'Administrador',
  [UserRole.MANAGER]: 'Gestor',
  [UserRole.CLIENT]: 'Cliente',
  [UserRole.SUPPORT]: 'Suporte',
};

export function isValidRole(role: string): role is UserRole {
  return Object.values(UserRole).includes(role as UserRole);
}
