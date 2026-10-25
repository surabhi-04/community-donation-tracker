import { useState } from 'react';
import './index.css';
import { AuthProvider, useAuth } from './contexts/AuthContext';
import { TeamProvider, useTeam } from './contexts/TeamContext';
import { ToastProvider } from './contexts/ToastContext';
import { firebaseConfigured, missingEnvVars } from './firebase';

// Pages
import LoginPage from './pages/LoginPage';
import TeamSetupPage from './pages/TeamSetupPage';
import DashboardPage from './pages/DashboardPage';
import PeoplePage from './pages/PeoplePage';
import LocationsPage from './pages/LocationsPage';
import GroupsPage from './pages/GroupsPage';
import TeamPage from './pages/TeamPage';
import ReportsPage from './pages/ReportsPage';

// Components
import BottomNav from './components/BottomNav';
import AppHeader from './components/AppHeader';
import SetupError from './components/SetupError';

export type AppPage = 'dashboard' | 'people' | 'groups' | 'locations' | 'team' | 'reports';

function AppContent() {
  const { user, loading } = useAuth();
  const { team, teamLoading, teamError, retryTeamRestore } = useTeam();
  const [currentPage, setCurrentPage] = useState<AppPage>('dashboard');

  if (!firebaseConfigured) {
    return <SetupError missingVars={missingEnvVars} />;
  }

  // Auth loading
  if (loading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', background: 'var(--surface)' }}>
        <div className="spinner" />
        <p className="text-body-md text-on-surface-variant">Loading...</p>
      </div>
    );
  }

  if (!user) return <LoginPage />;

  // Team membership loading — show spinner while we check Firestore
  // CRITICAL: This prevents the brief flash of TeamSetupPage
  if (teamLoading) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', background: 'var(--surface)' }}>
        <div className="spinner" />
        <p className="text-body-md" style={{ color: 'var(--on-surface-variant)' }}>Restoring your team…</p>
        <p className="text-label-sm" style={{ color: 'var(--outline)', maxWidth: '20rem', textAlign: 'center' }}>
          Checking team membership. This should take just a moment.
        </p>
      </div>
    );
  }

  // Team restore failed — show error with retry
  if (teamError) {
    return (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh', flexDirection: 'column', gap: '1rem', background: 'var(--surface)', padding: '1rem' }}>
        <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--error-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--error)' }}>cloud_off</span>
        </div>
        <h2 className="text-headline-sm" style={{ color: 'var(--on-surface)', textAlign: 'center' }}>
          Could not load your team
        </h2>
        <p className="text-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', maxWidth: '24rem' }}>
          {teamError}
        </p>
        <button
          className="btn btn-primary"
          onClick={retryTeamRestore}
          style={{ height: '2.75rem', padding: '0 1.5rem', marginTop: '0.5rem' }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>refresh</span>
          Try Again
        </button>
      </div>
    );
  }

  if (!team) return <TeamSetupPage />;

  const renderPage = () => {
    switch (currentPage) {
      case 'dashboard': return <DashboardPage onNavigate={setCurrentPage} />;
      case 'people':    return <PeoplePage />;
      case 'groups':    return <GroupsPage onNavigate={setCurrentPage} />;
      case 'locations': return <LocationsPage onNavigate={setCurrentPage} />;
      case 'team':      return <TeamPage />;
      case 'reports':   return <ReportsPage />;
      default:          return <DashboardPage onNavigate={setCurrentPage} />;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh', background: 'var(--surface)' }}>
      <AppHeader currentPage={currentPage} />
      <main style={{ flex: 1, paddingTop: '5rem', paddingBottom: '5.5rem' }}>
        {renderPage()}
      </main>
      <BottomNav currentPage={currentPage} onNavigate={setCurrentPage} />
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <TeamProvider>
        <ToastProvider>
          <AppContent />
        </ToastProvider>
      </TeamProvider>
    </AuthProvider>
  );
}
