/**
 * AdminUsersPage.test.tsx
 *
 * Unit tests covering:
 * - Renders user list with Rol, Departamento, Último login columns
 * - Shows role <select> for admin viewer, badge-only for non-admin
 * - "Nuevo Usuario" button visible only for admin
 * - handleRoleChange calls updateAdminRole then reloads
 * - InvitationFallbackModal appears after successful create (mode=create)
 * - InvitationFallbackModal appears after reset password (mode=reset)
 * - DeleteAdminUserModal appears and calls deleteAdmin on confirm
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, act } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { AdminUsersPage } from '../AdminUsersPage';
import { EnliteRole } from '@domain/entities/EnliteRole';

// ── Module mocks ─────────────────────────────────────────────────────────────

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, opts?: Record<string, string>) => {
      if (opts?.email) return `Invitación enviada a ${opts.email}`;
      return key;
    },
  }),
}));

vi.mock('@infrastructure/services/FirebaseAuthService', () => ({
  FirebaseAuthService: vi.fn().mockImplementation(() => ({
    getIdToken: vi.fn().mockResolvedValue('mock-token'),
  })),
}));

const mockListAdmins     = vi.fn();
const mockCreateAdmin    = vi.fn();
const mockUpdateAdminRole = vi.fn();
const mockDeleteAdmin    = vi.fn();
const mockResetPassword  = vi.fn();

vi.mock('@infrastructure/http/AdminApiService', () => ({
  AdminApiService: {
    listAdmins:      (...args: any[]) => mockListAdmins(...args),
    createAdmin:     (...args: any[]) => mockCreateAdmin(...args),
    updateAdminRole: (...args: any[]) => mockUpdateAdminRole(...args),
    deleteAdmin:     (...args: any[]) => mockDeleteAdmin(...args),
    resetPassword:   (...args: any[]) => mockResetPassword(...args),
  },
}));

// Mutable so individual tests can override
let mockRole: EnliteRole = EnliteRole.ADMIN;

vi.mock('@presentation/hooks/useAdminAuth', () => ({
  useAdminAuth: () => ({ adminProfile: { role: mockRole } }),
}));

vi.mock('@presentation/components/ui/skeletons', () => ({
  TableSkeleton: () => <div data-testid="skeleton" />,
}));

// ── Fixtures ─────────────────────────────────────────────────────────────────

const MOCK_USERS = [
  {
    id: '1',
    firebaseUid:   'uid-admin-1',
    email:         'admin@enlite.health',
    displayName:   'Admin User',
    role:          EnliteRole.ADMIN,
    department:    'Tech',
    lastLoginAt:   '2026-04-01T10:00:00Z',
    loginCount:    5,
    createdAt:     '2026-01-01T00:00:00Z',
  },
  {
    id: '2',
    firebaseUid:   'uid-recruiter-1',
    email:         'recruiter@enlite.health',
    displayName:   'Recruiter User',
    role:          EnliteRole.RECRUITER,
    department:    'HR',
    lastLoginAt:   null,
    loginCount:    0,
    createdAt:     '2026-02-01T00:00:00Z',
  },
];

// ── Setup ─────────────────────────────────────────────────────────────────────

beforeEach(() => {
  vi.clearAllMocks();
  mockRole = EnliteRole.ADMIN;
  mockListAdmins.mockResolvedValue({ admins: MOCK_USERS, total: 2 });
  mockCreateAdmin.mockResolvedValue({
    ...MOCK_USERS[0],
    email:     'new@enlite.health',
    resetLink: 'https://reset.link/test',
  });
  mockUpdateAdminRole.mockResolvedValue({ ...MOCK_USERS[0], role: EnliteRole.RECRUITER });
  mockDeleteAdmin.mockResolvedValue(undefined);
  mockResetPassword.mockResolvedValue({
    resetLink: 'https://reset.link/reset-test',
    message: 'Email enviado',
  });
});

async function renderAndWait() {
  await act(async () => {
    render(<AdminUsersPage />);
  });
  // Wait for async state updates (isLoading → false)
  await waitFor(() => expect(screen.queryByTestId('skeleton')).not.toBeInTheDocument(), {
    timeout: 5000,
  });
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('AdminUsersPage — column headers', () => {
  it('renders Rol, Departamento and Último login column headers', async () => {
    await renderAndWait();
    // Headers come through Typography which renders text directly in DOM
    expect(document.body.textContent).toContain('admin.users.role');
    expect(document.body.textContent).toContain('admin.users.department');
    expect(document.body.textContent).toContain('admin.users.lastLogin');
  });

  it('renders display names in rows', async () => {
    await renderAndWait();
    expect(document.body.textContent).toContain('Admin User');
    expect(document.body.textContent).toContain('Recruiter User');
  });
});

describe('AdminUsersPage — gating', () => {
  it('shows "Nuevo Usuario" button for admin', async () => {
    await renderAndWait();
    const btn = screen.getByRole('button', { name: 'admin.users.create' });
    expect(btn).toBeInTheDocument();
  });

  it('hides "Nuevo Usuario" button for non-admin', async () => {
    mockRole = EnliteRole.RECRUITER;
    await renderAndWait();
    expect(screen.queryByRole('button', { name: 'admin.users.create' })).not.toBeInTheDocument();
  });

  it('renders role selects for admin viewer', async () => {
    await renderAndWait();
    const selects = screen.getAllByRole('combobox');
    expect(selects.length).toBeGreaterThan(0);
  });

  it('renders no selects for non-admin viewer', async () => {
    mockRole = EnliteRole.RECRUITER;
    await renderAndWait();
    expect(screen.queryByRole('combobox')).not.toBeInTheDocument();
  });
});

describe('AdminUsersPage — role change', () => {
  it('calls updateAdminRole and reloads on select change', async () => {
    const user = userEvent.setup();
    await renderAndWait();

    const selects = screen.getAllByRole('combobox');

    await act(async () => {
      await user.selectOptions(selects[0], EnliteRole.RECRUITER);
    });

    await waitFor(() =>
      expect(mockUpdateAdminRole).toHaveBeenCalledWith('uid-admin-1', EnliteRole.RECRUITER),
    );
    // loadAdmins called once on mount, once after role change
    expect(mockListAdmins.mock.calls.length).toBeGreaterThanOrEqual(2);
  });
});

describe('AdminUsersPage — create flow', () => {
  it('shows InvitationFallbackModal after successful create', async () => {
    const user = userEvent.setup();
    await renderAndWait();

    // Open create modal
    await user.click(screen.getByRole('button', { name: 'admin.users.create' }));
    expect(document.body.textContent).toContain('admin.users.createUserTitle');

    // Fill required fields — IDs are set in CreateAdminUserModal
    const emailInput       = document.getElementById('cu-email') as HTMLInputElement;
    const displayNameInput = document.getElementById('cu-displayName') as HTMLInputElement;
    await user.type(emailInput,       'new@enlite.health');
    await user.type(displayNameInput, 'New User');

    await user.click(screen.getByRole('button', { name: 'admin.users.createButton' }));

    await waitFor(() =>
      expect(document.body.textContent).toContain('admin.users.invitationFallbackTitle'),
    );
    // Reset link is shown
    expect(document.body.textContent).toContain('https://reset.link/test');
  });
});

describe('AdminUsersPage — reset password flow', () => {
  it('shows InvitationFallbackModal in reset mode after clicking reset button', async () => {
    const user = userEvent.setup();
    await renderAndWait();

    const resetButtons = screen.getAllByText('admin.users.reset');
    await user.click(resetButtons[0]);

    await waitFor(() =>
      expect(mockResetPassword).toHaveBeenCalledWith('uid-admin-1'),
    );

    // Fallback modal should open with the reset link
    await waitFor(() =>
      expect(document.body.textContent).toContain('admin.users.resetLinkSentTitle'),
    );
    expect(document.body.textContent).toContain('https://reset.link/reset-test');
  });
});

describe('AdminUsersPage — delete flow', () => {
  it('shows DeleteAdminUserModal and calls deleteAdmin on confirm', async () => {
    const user = userEvent.setup();
    await renderAndWait();

    const deleteButtons = screen.getAllByText('admin.users.delete');
    await user.click(deleteButtons[0]);

    expect(document.body.textContent).toContain('admin.users.confirmDelete');

    await user.click(screen.getByText('admin.users.deleteConfirm'));

    await waitFor(() =>
      expect(mockDeleteAdmin).toHaveBeenCalledWith('uid-admin-1'),
    );
  });
});
