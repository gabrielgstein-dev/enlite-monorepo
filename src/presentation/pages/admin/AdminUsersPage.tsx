import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { AdminUser } from '@domain/entities/AdminUser';
import { Typography, Label } from '@presentation/components/atoms';
import { Button } from '@presentation/components/atoms/Button';

export function AdminUsersPage() {
  const { t } = useTranslation();
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Create modal
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [createForm, setCreateForm] = useState({ email: '', displayName: '', department: '' });
  const [creating, setCreating] = useState(false);

  // Confirm delete
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);

  const loadAdmins = useCallback(async () => {
    setIsLoading(true);
    try {
      const data = await AdminApiService.listAdmins();
      setAdmins(data.admins);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAdmins();
  }, [loadAdmins]);

  const handleCreate = async () => {
    if (!createForm.email || !createForm.displayName) return;
    setCreating(true);
    try {
      await AdminApiService.createAdmin({
        email: createForm.email,
        displayName: createForm.displayName,
        department: createForm.department || undefined,
      });
      setShowCreateModal(false);
      setCreateForm({ email: '', displayName: '', department: '' });
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error creating admin');
    } finally {
      setCreating(false);
    }
  };

  const handleDelete = async (admin: AdminUser) => {
    try {
      await AdminApiService.deleteAdmin(admin.firebaseUid);
      setDeleteTarget(null);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error deleting admin');
    }
  };

  const handleResetPassword = async (admin: AdminUser) => {
    try {
      await AdminApiService.resetPassword(admin.firebaseUid);
      alert(t('admin.users.resetSent', 'Email de restablecimiento enviado'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Error resetting password');
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Typography variant="h1" weight="semibold" color="primary">
          {t('admin.users.title', 'Usuarios Administradores')}
        </Typography>
        <Button variant="primary" onClick={() => setShowCreateModal(true)}>
          {t('admin.users.create', '+ Nuevo Admin')}
        </Button>
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg">
          <Typography variant="body" color="primary">
            {error}
          </Typography>
          <button className="ml-2 underline" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {isLoading ? (
        <div className="flex justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary" />
        </div>
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3"><Typography variant="caption" weight="medium" color="secondary">{t('admin.users.name', 'Nombre')}</Typography></th>
                <th className="text-left px-6 py-3"><Typography variant="caption" weight="medium" color="secondary">{t('admin.users.email', 'Email')}</Typography></th>
                <th className="text-left px-6 py-3"><Typography variant="caption" weight="medium" color="secondary">{t('admin.users.department', 'Departamento')}</Typography></th>
                <th className="text-left px-6 py-3"><Typography variant="caption" weight="medium" color="secondary">{t('admin.users.lastLogin', 'Último login')}</Typography></th>
                <th className="text-right px-6 py-3"><Typography variant="caption" weight="medium" color="secondary">{t('admin.users.actions', 'Acciones')}</Typography></th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((admin) => (
                <tr key={admin.firebaseUid} className="hover:bg-gray-50">
                  <td className="px-6 py-4"><Typography variant="body" weight="medium" color="primary">{admin.displayName || '—'}</Typography></td>
                  <td className="px-6 py-4"><Typography variant="body" color="secondary">{admin.email}</Typography></td>
                  <td className="px-6 py-4"><Typography variant="body" color="secondary">{admin.department || '—'}</Typography></td>
                  <td className="px-6 py-4"><Typography variant="body" color="secondary">
                    {admin.lastLoginAt ? new Date(admin.lastLoginAt).toLocaleDateString() : '—'}
                  </Typography></td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      className="text-blue-600 hover:underline text-sm"
                      onClick={() => handleResetPassword(admin)}
                    >
                      <Typography variant="caption" color="primary">{t('admin.users.reset', 'Reset')}</Typography>
                    </button>
                    <button
                      className="text-red-600 hover:underline text-sm"
                      onClick={() => setDeleteTarget(admin)}
                    >
                      <Typography variant="caption" color="primary">{t('admin.users.delete', 'Eliminar')}</Typography>
                    </button>
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <Typography variant="body" color="secondary">{t('admin.users.empty', 'No hay administradores')}</Typography>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {/* Create Modal */}
      {showCreateModal && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-md shadow-lg">
            <Typography variant="h2" weight="semibold" color="primary" className="mb-4">
              {t('admin.users.createTitle', 'Nuevo Administrador')}
            </Typography>
            <div className="space-y-3">
              <div>
                <Label htmlFor="email">{t('admin.users.email', 'Email')}</Label>
                <input
                  type="email"
                  id="email"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={createForm.email}
                  onChange={(e) => setCreateForm({ ...createForm, email: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="displayName">{t('admin.users.name', 'Nombre')}</Label>
                <input
                  type="text"
                  id="displayName"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={createForm.displayName}
                  onChange={(e) => setCreateForm({ ...createForm, displayName: e.target.value })}
                />
              </div>
              <div>
                <Label htmlFor="department">{t('admin.users.department', 'Departamento')}</Label>
                <input
                  type="text"
                  id="department"
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-primary focus:border-primary"
                  value={createForm.department}
                  onChange={(e) => setCreateForm({ ...createForm, department: e.target.value })}
                />
              </div>
            </div>
            <div className="flex justify-end gap-3 mt-6">
              <button
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setShowCreateModal(false)}
              >
                {t('admin.users.cancel', 'Cancelar')}
              </button>
              <Button variant="primary" onClick={handleCreate} isLoading={creating}>
                {t('admin.users.createButton', 'Crear')}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation */}
      {deleteTarget && (
        <div className="fixed inset-0 bg-black/40 flex items-center justify-center z-50">
          <div className="bg-white rounded-xl p-6 w-full max-w-sm shadow-lg">
            <Typography variant="h2" weight="semibold" color="primary" className="mb-2">
              {t('admin.users.confirmDelete', '¿Eliminar administrador?')}
            </Typography>
            <Typography variant="body" color="secondary" className="mb-6">
              {t('admin.users.confirmDeleteDesc', 'Esta acción eliminará permanentemente a')} <strong>{deleteTarget.email}</strong>
            </Typography>
            <div className="flex justify-end gap-3">
              <button
                className="px-4 py-2 text-sm text-gray-600 hover:text-gray-900"
                onClick={() => setDeleteTarget(null)}
              >
                {t('admin.users.cancel', 'Cancelar')}
              </button>
              <button
                className="px-4 py-2 text-sm bg-red-600 text-white rounded-lg hover:bg-red-700"
                onClick={() => handleDelete(deleteTarget)}
              >
                {t('admin.users.deleteConfirm', 'Eliminar')}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
