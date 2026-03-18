import { useAuth } from '@presentation/contexts/useAuth';

export function Header() {
  const { user, logout } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  return (
    <header className="header">
      <div className="header-content">
        <h1>Enlite</h1>
        {user && (
          <div className="user-menu">
            <span>{user.name}</span>
            <button onClick={handleLogout}>Logout</button>
          </div>
        )}
      </div>
    </header>
  );
}
