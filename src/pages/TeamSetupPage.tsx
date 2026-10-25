import { useState } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';

export default function TeamSetupPage() {
  const { user, signOut } = useAuth();
  const { createTeam, joinTeam, restoreTeamWithId } = useTeam();
  const { showToast } = useToast();
  const [tab, setTab] = useState<'create' | 'join'>('create');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  // Create form
  const [teamName, setTeamName] = useState('');
  const [teamDesc, setTeamDesc] = useState('');

  // Join form
  const [joinTeamId, setJoinTeamId] = useState('');
  const [joinCode, setJoinCode] = useState('');

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!teamName.trim()) { setError('Team name is required'); return; }
    setLoading(true);
    setError('');
    try {
      // createTeam() is the single source of truth:
      //   1. Generates the invite code
      //   2. Writes teams/{id}
      //   3. Writes teams/{id}/private/config  (invite code stored here)
      //   4. Writes teams/{id}/members/{uid}   (owner bootstrapped)
      //   5. Writes users/{uid} index with { merge: true }
      await createTeam(teamName.trim(), teamDesc.trim());
      showToast('Team created! Go to the Team tab to reveal your invite code.', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to create team');
    } finally {
      setLoading(false);
    }
  };

  const handleRestoreOnly = async () => {
    const tid = joinTeamId.trim();
    if (!tid) {
      setError('Please enter your Team ID to restore');
      return;
    }
    setLoading(true);
    setError('');
    try {
      const restored = await restoreTeamWithId(tid);
      if (restored) {
        showToast('Team membership restored! Welcome back.', 'success');
      } else {
        setError('No existing membership found for your account in this team. Enter the invitation code below to join.');
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to restore team');
    } finally {
      setLoading(false);
    }
  };

  const handleJoin = async (e: React.FormEvent) => {
    e.preventDefault();
    const tid = joinTeamId.trim();
    const code = joinCode.trim();

    if (!tid) { setError('Team ID is required'); return; }
    setLoading(true);
    setError('');
    try {
      // First, check if the authenticated user is ALREADY an existing member:
      const alreadyMember = await restoreTeamWithId(tid);
      if (alreadyMember) {
        showToast('Team membership restored! Welcome back.', 'success');
        return;
      }

      // If not already a member, invite code is required to join
      if (!code) {
        setError('Invitation code is required to join this team');
        return;
      }

      // joinTeam() validates code via Firestore rule server-side
      await joinTeam(tid, code);
      showToast('Successfully joined the team!', 'success');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Failed to join team');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      background: 'var(--surface)',
      display: 'flex',
      flexDirection: 'column',
    }}>
      {/* Header */}
      <div style={{
        padding: '1.25rem 1rem 0',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          <div style={{ width: 36, height: 36, borderRadius: '10px', background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ffffff' }}>volunteer_activism</span>
          </div>
          <div>
            <div className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>Team Setup</div>
            <div className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Signed in as {user?.displayName}</div>
          </div>
        </div>
        <button
          onClick={signOut}
          style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', padding: '0.5rem', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', gap: 4 }}
          className="text-label-sm"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>logout</span>
          Sign out
        </button>
      </div>

      <div style={{ padding: '1.5rem 1rem', maxWidth: '32rem', width: '100%', margin: '0 auto' }}>
        <h1 className="text-headline-md" style={{ color: 'var(--on-surface)', marginBottom: '0.375rem' }}>Join or Create a Team</h1>
        <p className="text-body-md" style={{ color: 'var(--on-surface-variant)', marginBottom: '1.5rem' }}>
          All data is shared within your team and synced in real-time.
        </p>

        {/* Tab Selector */}
        <div className="tab-segmented-container" style={{ marginBottom: '1.5rem' }}>
          {(['create', 'join'] as const).map((t) => (
            <button
              key={t}
              onClick={() => { setTab(t); setError(''); }}
              className={`tab-segmented-btn ${tab === t ? 'active' : ''}`}
              style={{ fontSize: 14, minHeight: '2.5rem' }}
            >
              {t === 'create' ? '+ Create Team' : '→ Join / Restore Team'}
            </button>
          ))}
        </div>

        {error && (
          <div style={{
            background: 'var(--error-container)', borderRadius: '0.625rem',
            padding: '0.75rem 1rem', marginBottom: '1rem',
            display: 'flex', alignItems: 'center', gap: '0.5rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--error)', flexShrink: 0 }}>error_outline</span>
            <span className="text-body-sm" style={{ color: 'var(--on-error-container)' }}>{error}</span>
          </div>
        )}

        {tab === 'create' ? (
          <form onSubmit={handleCreate} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div>
              <label className="form-label" htmlFor="teamName">Team Name *</label>
              <input
                id="teamName"
                className="form-input"
                value={teamName}
                onChange={(e) => setTeamName(e.target.value)}
                placeholder="e.g. Mysore Grama Seva 2025"
                maxLength={80}
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="teamDesc">Description (optional)</label>
              <input
                id="teamDesc"
                className="form-input"
                value={teamDesc}
                onChange={(e) => setTeamDesc(e.target.value)}
                placeholder="Door-to-door relief drive, Oct 2025"
                maxLength={200}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', height: '3rem', marginTop: '0.5rem' }}
            >
              {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /><span>Creating...</span></> : 'Create Team'}
            </button>
          </form>
        ) : (
          <form onSubmit={handleJoin} style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '0.875rem', display: 'flex', gap: '0.75rem', alignItems: 'flex-start' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--secondary)', flexShrink: 0, marginTop: 2 }}>info</span>
              <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                Ask your team owner for the <strong>Team ID</strong> and <strong>Invitation Code</strong>. If you are already a member, entering the Team ID restores your access.
              </p>
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                <label className="form-label" htmlFor="joinTeamId" style={{ marginBottom: 0 }}>Team ID *</label>
                {joinTeamId.trim() && (
                  <button
                    type="button"
                    onClick={handleRestoreOnly}
                    disabled={loading}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', fontSize: 12, fontWeight: 600 }}
                  >
                    Already a member? Restore
                  </button>
                )}
              </div>
              <input
                id="joinTeamId"
                className="form-input"
                value={joinTeamId}
                onChange={(e) => setJoinTeamId(e.target.value)}
                placeholder="Paste Team ID here"
                required
              />
            </div>
            <div>
              <label className="form-label" htmlFor="joinCode">Invitation Code (for new joiners)</label>
              <input
                id="joinCode"
                className="form-input"
                value={joinCode}
                onChange={(e) => setJoinCode(e.target.value.toUpperCase())}
                placeholder="e.g. 3A7F2B1C8E9D (optional if restoring existing membership)"
                maxLength={20}
              />
            </div>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={loading}
              style={{ width: '100%', height: '3rem', marginTop: '0.5rem' }}
            >
              {loading ? <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /><span>Joining / Restoring...</span></> : 'Join or Restore Team'}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
