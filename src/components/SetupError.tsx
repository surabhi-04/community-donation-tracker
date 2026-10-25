interface SetupErrorProps {
  missingVars: string[];
}

export default function SetupError({ missingVars }: SetupErrorProps) {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      flexDirection: 'column',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '1.5rem',
      background: 'var(--surface)',
      gap: '1.5rem',
    }}>
      <div style={{
        width: 56, height: 56, borderRadius: '50%',
        background: 'var(--error-container)',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--error)' }}>error_outline</span>
      </div>
      <div style={{ textAlign: 'center', maxWidth: '28rem' }}>
        <h1 className="text-headline-md" style={{ color: 'var(--on-surface)', marginBottom: '0.5rem' }}>Firebase Configuration Missing</h1>
        <p className="text-body-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '1.25rem' }}>
          The following environment variables must be set in a <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.4rem', borderRadius: 4 }}>.env.local</code> file:
        </p>
        <div style={{
          background: 'var(--surface-container-low)',
          borderRadius: '0.75rem',
          padding: '1rem',
          textAlign: 'left',
          border: '1.5px solid var(--outline-variant)',
        }}>
          {missingVars.map((v) => (
            <div key={v} style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.375rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--error)' }}>close</span>
              <code className="text-body-sm" style={{ color: 'var(--on-surface)', fontFamily: 'monospace' }}>{v}</code>
            </div>
          ))}
        </div>
      </div>
      <div style={{
        background: 'var(--surface-container-lowest)',
        borderRadius: '0.75rem',
        padding: '1rem',
        maxWidth: '28rem',
        width: '100%',
        boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
      }}>
        <p className="text-label-md" style={{ color: 'var(--on-surface)', marginBottom: '0.5rem' }}>
          <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle', marginRight: 4 }}>description</span>
          Setup Instructions
        </p>
        <ol style={{ paddingLeft: '1.25rem', color: 'var(--on-surface-variant)' }}>
          <li className="text-body-sm" style={{ marginBottom: '0.375rem' }}>Create a <strong>Firebase project</strong> at <a href="https://console.firebase.google.com" target="_blank" rel="noopener noreferrer" style={{ color: 'var(--secondary)' }}>console.firebase.google.com</a></li>
          <li className="text-body-sm" style={{ marginBottom: '0.375rem' }}>Enable <strong>Google Sign-In</strong> in Authentication → Sign-in method</li>
          <li className="text-body-sm" style={{ marginBottom: '0.375rem' }}>Enable <strong>Cloud Firestore</strong> in Firestore Database</li>
          <li className="text-body-sm" style={{ marginBottom: '0.375rem' }}>Copy your Web App config and add it to <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>.env.local</code></li>
          <li className="text-body-sm">Deploy <code style={{ background: 'var(--surface-container)', padding: '0.1rem 0.3rem', borderRadius: 3 }}>firestore.rules</code> using Firebase CLI</li>
        </ol>
      </div>
      <p className="text-label-sm" style={{ color: 'var(--outline)', textAlign: 'center' }}>
        See README.md for complete setup and deployment instructions.
      </p>
    </div>
  );
}
