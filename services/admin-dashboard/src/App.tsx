import { BrowserRouter, Navigate, NavLink, Route, Routes } from 'react-router-dom';
import { AuthProvider, useAuth } from './auth';
import { CommissionsPage } from './pages/CommissionsPage';
import { DashboardPage } from './pages/DashboardPage';
import { KycPage } from './pages/KycPage';
import { LeadsPage } from './pages/LeadsPage';
import { LoginPage } from './pages/LoginPage';
import { PayoutsPage } from './pages/PayoutsPage';
import { RulesPage } from './pages/RulesPage';
import { UsersPage } from './pages/UsersPage';

const NAV = [
  { to: '/', label: 'Overview', end: true },
  { to: '/leads', label: 'Lead queue' },
  { to: '/kyc', label: 'KYC review' },
  { to: '/commissions', label: 'Commissions' },
  { to: '/payouts', label: 'Payouts' },
  { to: '/rules', label: 'Commission rules' },
  { to: '/users', label: 'Affiliates' },
];

function Shell() {
  const { user, ready, logout } = useAuth();
  if (!ready) return <div className="center muted">Loading…</div>;
  if (!user) return <LoginPage />;

  return (
    <div className="layout">
      <aside className="sidebar">
        <div className="brand">
          <span className="brand-mark">R</span> Refera
        </div>
        <nav>
          {NAV.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.end} className={({ isActive }) => (isActive ? 'nav-link active' : 'nav-link')}>
              {n.label}
            </NavLink>
          ))}
        </nav>
        <div className="sidebar-foot">
          <div className="small">{user.email}</div>
          <button className="btn btn-ghost" onClick={logout}>Sign out</button>
        </div>
      </aside>
      <main className="content">
        <Routes>
          <Route path="/" element={<DashboardPage />} />
          <Route path="/leads" element={<LeadsPage />} />
          <Route path="/kyc" element={<KycPage />} />
          <Route path="/commissions" element={<CommissionsPage />} />
          <Route path="/payouts" element={<PayoutsPage />} />
          <Route path="/rules" element={<RulesPage />} />
          <Route path="/users" element={<UsersPage />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Shell />
      </BrowserRouter>
    </AuthProvider>
  );
}
