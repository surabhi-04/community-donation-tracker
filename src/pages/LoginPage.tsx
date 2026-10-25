import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';

export default function LoginPage() {
  const { signInWithGoogle, loading, error } = useAuth();
  const [signing, setSigning] = useState(false);

  const handleSignIn = async () => {
    setSigning(true);
    await signInWithGoogle();
    setSigning(false);
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '2rem 1.5rem',
    }}>
      {/* Hero */}
      <div style={{
        width: 72, height: 72, borderRadius: '20px',
        background: 'var(--primary)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        marginBottom: '1.5rem',
        boxShadow: '0 8px 24px rgba(0,0,0,0.15)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 40, color: '#ffffff' }}>volunteer_activism</span>
      </div>

      <h1 className="text-headline-lg-m" style={{ color: 'var(--on-surface)', textAlign: 'center', marginBottom: '0.5rem', letterSpacing: '-0.02em' }}>
        Community Donation Tracker
      </h1>
      <p className="text-body-md" style={{ color: 'var(--on-surface-variant)', textAlign: 'center', maxWidth: '24rem', lineHeight: '1.6', marginBottom: '2.5rem' }}>
        Field-ready tool for volunteer coordinators — manage door-to-door drives with real-time team sync.
      </p>

      {/* Feature highlights */}
      <div style={{
        display: 'flex', flexDirection: 'column', gap: '0.75rem',
        maxWidth: '22rem', width: '100%', marginBottom: '2.5rem',
      }}>
        {[
          { icon: 'group', text: 'Shared team workspace with real-time sync' },
          { icon: 'person_search', text: 'Track visits and donations by person' },
          { icon: 'location_on', text: 'Location-wise progress overview' },
          { icon: 'table_view', text: 'Export to CSV and print A4 reports' },
        ].map((f) => (
          <div key={f.icon} style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
            <div style={{
              width: 36, height: 36, borderRadius: '10px',
              background: 'var(--secondary-container)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              flexShrink: 0,
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-secondary-container)' }}>{f.icon}</span>
            </div>
            <span className="text-body-md" style={{ color: 'var(--on-surface)' }}>{f.text}</span>
          </div>
        ))}
      </div>

      {/* Sign In Button */}
      <div style={{ width: '100%', maxWidth: '22rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
        {error && (
          <div style={{
            background: 'var(--error-container)', borderRadius: '0.5rem',
            padding: '0.75rem 1rem', display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--error)', flexShrink: 0 }}>error_outline</span>
            <span className="text-body-sm" style={{ color: 'var(--on-error-container)' }}>{error}</span>
          </div>
        )}

        <button
          className="btn btn-primary"
          onClick={handleSignIn}
          disabled={signing || loading}
          style={{ width: '100%', height: '3.25rem', fontSize: '16px', borderRadius: '0.75rem' }}
        >
          {signing ? (
            <>
              <div className="spinner" style={{ width: 20, height: 20, borderWidth: 2 }} />
              <span>Signing in...</span>
            </>
          ) : (
            <>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none">
                <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" fill="#FBBC05"/>
                <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
              </svg>
              <span>Sign in with Google</span>
            </>
          )}
        </button>
      </div>

      <p className="text-label-sm" style={{ color: 'var(--outline)', textAlign: 'center', marginTop: '1.5rem', maxWidth: '20rem' }}>
        Sign in with your Google account to join or create a volunteer team.
      </p>
    </div>
  );
}
