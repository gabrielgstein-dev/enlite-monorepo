import { useState, useEffect, useCallback } from 'react';
import { useTranslation } from 'react-i18next';
import { AdminApiService } from '@infrastructure/http/AdminApiService';
import { AdminUser } from '@domain/entities/AdminUser';
import { EnliteRole } from '@domain/entities/EnliteRole';
import { Typography } from '@presentation/components/atoms';
import { Button } from '@presentation/components/atoms/Button';
import { TableSkeleton } from '@presentation/components/ui/skeletons';
import { useAdminAuth } from '@presentation/hooks/useAdminAuth';
import { CreateAdminUserModal, CreateAdminUserForm } from '@presentation/components/admin/CreateAdminUserModal';
import { DeleteAdminUserModal } from '@presentation/components/admin/DeleteAdminUserModal';
import { InvitationFallbackModal } from '@presentation/components/admin/InvitationFallbackModal';

// ── Role badge ─────────────────────────────────────────────────────────────

const ROLE_BADGE_CLASSES: Record<EnliteRole, string> = {
  [EnliteRole.ADMIN]:             'bg-purple-100 text-purple-800',
  [EnliteRole.RECRUITER]:         'bg-blue-100 text-blue-800',
  [EnliteRole.COMMUNITY_MANAGER]: 'bg-green-100 text-green-800',
};

function RoleBadge({ role }: { role: EnliteRole }): JSX.Element {
  const { t } = useTranslation();
  const labelKey = {
    [EnliteRole.ADMIN]:             'admin.users.roleAdmin',
    [EnliteRole.RECRUITER]:         'admin.users.roleRecruiter',
    [EnliteRole.COMMUNITY_MANAGER]: 'admin.users.roleCommunityManager',
  }[role];

  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${ROLE_BADGE_CLASSES[role]}`}>
      {t(labelKey)}
    </span>
  );
}

// ── Inline role selector (admin-only) ──────────────────────────────────────

interface RoleCellProps {
  admin: AdminUser;
  canEdit: boolean;
  onRoleChange: (uid: string, role: EnliteRole) => Promise<void>;
}

function RoleCell({ admin, canEdit, onRoleChange }: RoleCellProps): JSX.Element {
  const { t } = useTranslation();
  const [busy, setBusy] = useState(false);

  if (!canEdit) return <RoleBadge role={admin.role} />;

  const handleChange = async (e: React.ChangeEvent<HTMLSelectElement>) => {
    const next = e.target.value as EnliteRole;
    setBusy(true);
    try {
      await onRoleChange(admin.firebaseUid, next);
    } finally {
      setBusy(false);
    }
  };

  return (
    <select
      className="text-xs border border-gray-300 rounded px-2 py-1 focus:ring-2 focus:ring-primary focus:border-primary disabled:opacity-50"
      value={admin.role}
      onChange={handleChange}
      disabled={busy}
      aria-label={t('admin.users.role')}
    >
      <option value={EnliteRole.ADMIN}>{t('admin.users.roleAdmin')}</option>
      <option value={EnliteRole.RECRUITER}>{t('admin.users.roleRecruiter')}</option>
      <option value={EnliteRole.COMMUNITY_MANAGER}>{t('admin.users.roleCommunityManager')}</option>
    </select>
  );
}

// ── Page ───────────────────────────────────────────────────────────────────

export function AdminUsersPage(): JSX.Element {
  const { t } = useTranslation();
  const { adminProfile } = useAdminAuth();
  const isAdmin = adminProfile?.role === EnliteRole.ADMIN;

  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Modals
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<AdminUser | null>(null);
  const [fallback, setFallback] = useState<{ email: string; resetLink: string; mode: 'create' | 'reset' } | null>(null);

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

  useEffect(() => { loadAdmins(); }, [loadAdmins]);

  const handleCreate = async (form: CreateAdminUserForm) => {
    setCreating(true);
    try {
      const result = await AdminApiService.createAdmin({
        email: form.email,
        displayName: form.displayName,
        role: form.role,
      });
      setShowCreateModal(false);
      await loadAdmins();
      setFallback({
        email: result.email,
        resetLink: result.resetLink ?? '',
        mode: 'create',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    } finally {
      setCreating(false);
    }
  };

  const handleRoleChange = async (firebaseUid: string, role: EnliteRole) => {
    try {
      await AdminApiService.updateAdminRole(firebaseUid, role);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.users.errorUpdateRole'));
    }
  };

  const handleDelete = async (admin: AdminUser) => {
    try {
      await AdminApiService.deleteAdmin(admin.firebaseUid);
      setDeleteTarget(null);
      await loadAdmins();
    } catch (err) {
      setError(err instanceof Error ? err.message : t('common.error'));
    }
  };

  const handleResetPassword = async (admin: AdminUser) => {
    try {
      const result = await AdminApiService.resetPassword(admin.firebaseUid);
      setFallback({
        email: admin.email,
        resetLink: result.resetLink,
        mode: 'reset',
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : t('admin.users.errorResetPassword'));
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <Typography variant="h1" weight="semibold" color="primary">
          {t('admin.users.title')}
        </Typography>
        {isAdmin && (
          <Button variant="primary" onClick={() => setShowCreateModal(true)}>
            {t('admin.users.create')}
          </Button>
        )}
      </div>

      {error && (
        <div className="bg-red-50 border border-red-200 px-4 py-3 rounded-lg flex items-center justify-between">
          <Typography variant="body" color="primary">{error}</Typography>
          <button className="ml-2 text-red-600 hover:text-red-800" onClick={() => setError(null)}>×</button>
        </div>
      )}

      {isLoading ? (
        <TableSkeleton />
      ) : (
        <div className="bg-white rounded-xl shadow-sm overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50 border-b">
              <tr>
                <th className="text-left px-6 py-3">
                  <Typography variant="caption" weight="medium" color="secondary">{t('admin.users.name')}</Typography>
                </th>
                <th className="text-left px-6 py-3">
                  <Typography variant="caption" weight="medium" color="secondary">{t('admin.users.email')}</Typography>
                </th>
                <th className="text-left px-6 py-3">
                  <Typography variant="caption" weight="medium" color="secondary">{t('admin.users.role')}</Typography>
                </th>
                <th className="text-left px-6 py-3">
                  <Typography variant="caption" weight="medium" color="secondary">{t('admin.users.lastLogin')}</Typography>
                </th>
                <th className="text-right px-6 py-3">
                  <Typography variant="caption" weight="medium" color="secondary">{t('admin.users.actions')}</Typography>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {admins.map((admin) => (
                <tr key={admin.firebaseUid} className="hover:bg-gray-50">
                  <td className="px-6 py-4">
                    <Typography variant="body" weight="medium" color="primary">{admin.displayName || '—'}</Typography>
                  </td>
                  <td className="px-6 py-4">
                    <Typography variant="body" color="secondary">{admin.email}</Typography>
                  </td>
                  <td className="px-6 py-4">
                    <RoleCell admin={admin} canEdit={isAdmin} onRoleChange={handleRoleChange} />
                  </td>
                  <td className="px-6 py-4">
                    <Typography variant="body" color="secondary">
                      {admin.lastLoginAt
                        ? new Date(admin.lastLoginAt).toLocaleDateString('es-AR')
                        : '—'}
                    </Typography>
                  </td>
                  <td className="px-6 py-4 text-right space-x-2">
                    <button
                      type="button"
                      className="text-blue-600 hover:underline text-sm"
                      onClick={() => handleResetPassword(admin)}
                    >
                      <Typography variant="caption" color="primary">{t('admin.users.reset')}</Typography>
                    </button>
                    {isAdmin && (
                      <button
                        type="button"
                        className="text-red-600 hover:underline text-sm"
                        onClick={() => setDeleteTarget(admin)}
                      >
                        <Typography variant="caption" color="primary">{t('admin.users.delete')}</Typography>
                      </button>
                    )}
                  </td>
                </tr>
              ))}
              {admins.length === 0 && (
                <tr>
                  <td colSpan={5} className="px-6 py-8 text-center">
                    <Typography variant="body" color="secondary">{t('admin.users.empty')}</Typography>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      )}

      {showCreateModal && (
        <CreateAdminUserModal
          isLoading={creating}
          onSubmit={handleCreate}
          onClose={() => setShowCreateModal(false)}
        />
      )}

      {deleteTarget && (
        <DeleteAdminUserModal
          target={deleteTarget}
          onConfirm={() => handleDelete(deleteTarget)}
          onClose={() => setDeleteTarget(null)}
        />
      )}

      {fallback && (
        <InvitationFallbackModal
          email={fallback.email}
          resetLink={fallback.resetLink}
          mode={fallback.mode}
          onClose={() => setFallback(null)}
        />
      )}
    </div>
  );
}
