import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import { z } from 'zod';
import { useAdminAuth } from '@presentation/hooks/useAdminAuth';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { Typography } from '@presentation/components/atoms';
import { FormField, PasswordInput } from '@presentation/components/molecules';
import { Button } from '@presentation/components/atoms/Button';
import { AuthNavbar } from '@presentation/components/organisms/AuthNavbar';

const passwordSchema = z.object({
  newPassword: z
    .string()
    .min(8, 'admin.changePassword.minLength')
    .regex(/[A-Z]/, 'admin.changePassword.needsUppercase')
    .regex(/[0-9]/, 'admin.changePassword.needsNumber'),
  confirmPassword: z.string(),
}).refine((data) => data.newPassword === data.confirmPassword, {
  message: 'admin.changePassword.mismatch',
  path: ['confirmPassword'],
});

export function AdminChangePasswordPage() {
  const { t } = useTranslation();
  const navigate = useNavigate();
  const { fetchProfile } = useAdminAuth();
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const result = passwordSchema.safeParse({ newPassword, confirmPassword });
    if (!result.success) {
      setError(t(result.error.errors[0].message));
      return;
    }

    setIsLoading(true);
    try {
      await AdminApiService.changePassword(newPassword);
      await fetchProfile(); // Refresh profile (mustChangePassword now false)
      navigate('/admin');
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.changePassword.error', 'Error al cambiar contraseña'));
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col px-4 sm:px-10 md:px-16 lg:px-20 xl:px-[120px] pt-8 pb-20 gap-8">
      <AuthNavbar className="px-4" />

      <div className="flex flex-col items-center justify-center flex-1 w-full max-w-[440px] mx-auto">
        <div className="flex flex-col gap-2 mb-8 text-center">
          <Typography variant="h1" weight="semibold" color="primary">
            {t('admin.changePassword.title', 'Cambiar contraseña')}
          </Typography>
          <Typography variant="body" color="primary">
            {t('admin.changePassword.description', 'Debe cambiar su contraseña temporal antes de continuar.')}
          </Typography>
        </div>

        <form className="flex flex-col gap-5 w-full" onSubmit={handleSubmit}>
          {error && (
            <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
              <Typography variant="body" color="primary">{error}</Typography>
            </div>
          )}

          <div className="flex flex-col gap-3">
            <FormField label={t('admin.changePassword.newPassword', 'Nueva contraseña')} htmlFor="new-password">
              <PasswordInput
                id="new-password"
                placeholder={t('admin.changePassword.newPasswordPlaceholder', 'Mínimo 8 caracteres')}
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
              />
            </FormField>

            <FormField label={t('admin.changePassword.confirmPassword', 'Confirmar contraseña')} htmlFor="confirm-password">
              <PasswordInput
                id="confirm-password"
                placeholder={t('admin.changePassword.confirmPlaceholder', 'Repita su nueva contraseña')}
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
              />
            </FormField>
          </div>

          <ul className="list-disc pl-4 space-y-1">
            <li><Typography variant="caption" color="secondary">{t('admin.changePassword.ruleMin', 'Mínimo 8 caracteres')}</Typography></li>
            <li><Typography variant="caption" color="secondary">{t('admin.changePassword.ruleUpper', 'Al menos 1 letra mayúscula')}</Typography></li>
            <li><Typography variant="caption" color="secondary">{t('admin.changePassword.ruleNumber', 'Al menos 1 número')}</Typography></li>
          </ul>

          <Button
            type="submit"
            variant="primary"
            size="lg"
            fullWidth
            isLoading={isLoading}
          >
            {t('admin.changePassword.submit', 'Cambiar contraseña')}
          </Button>
        </form>
      </div>
    </div>
  );
}
