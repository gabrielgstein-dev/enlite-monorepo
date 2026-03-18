import { Link } from 'react-router-dom';
import { PermissionGate } from '../auth/PermissionGate';

export function Sidebar() {
  return (
    <aside className="sidebar">
      <nav>
        <ul>
          <li>
            <Link to="/">Dashboard</Link>
          </li>
          <PermissionGate resourceType="workers" action="read">
            <li>
              <Link to="/workers">Workers</Link>
            </li>
          </PermissionGate>
          <PermissionGate resourceType="settings" action="manage">
            <li>
              <Link to="/settings">Settings</Link>
            </li>
          </PermissionGate>
        </ul>
      </nav>
    </aside>
  );
}
