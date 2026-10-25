import { useState } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import { db } from '../firebase';
import { doc, getDoc } from 'firebase/firestore';

export default function TeamPage() {
  const { user, signOut } = useAuth();
  const { team, members, leaveTeam, userTeams, activeTeamId, switchTeam } = useTeam();
  const { showToast } = useToast();
  const [inviteCode, setInviteCode] = useState<string | null>(null);
  const [loadingCode, setLoadingCode] = useState(false);
  const [showLeaveConfirm, setShowLeaveConfirm] = useState(false);
  const [copied, setCopied] = useState(false);

  const isOwner = members.find((m) => m.uid === user?.uid)?.role === 'owner';

  const fetchInviteCode = async () => {
    if (!team || !db) return;
    setLoadingCode(true);
    try {
      const snap = await getDoc(doc(db, 'teams', team.id, 'private', 'config'));
      if (snap.exists()) {
        setInviteCode(snap.data().inviteCode);
      } else {
        showToast('Invite code not found. Re-create the team.', 'error');
      }
    } catch {
      showToast('Could not load invite code', 'error');
    } finally {
      setLoadingCode(false);
    }
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      showToast(`${label} copied!`, 'success');
      setTimeout(() => setCopied(false), 2000);
    } catch {
      showToast('Copy failed', 'error');
    }
  };

  if (!team) return null;

  return (
    <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Team Info Card */}
      <div className="hero-card-navy">
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
          <div style={{ width: 48, height: 48, borderRadius: '14px', background: 'rgba(255,255,255,0.12)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: '#93c5fd' }}>shield_person</span>
          </div>
          <div style={{ minWidth: 0 }}>
            <h1 className="text-headline-md hero-title" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{team.name}</h1>
            {team.description && <p className="text-body-sm hero-sub" style={{ marginTop: 2 }}>{team.description}</p>}
          </div>
        </div>
        {/* Team ID */}
        <div className="hero-id-box" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <span className="text-label-sm hero-sub" style={{ textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Team ID</span>
            <span className="text-body-sm" style={{ color: '#ffffff', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', display: 'block' }}>{team.id}</span>
          </div>
          <button
            onClick={() => copyToClipboard(team.id, 'Team ID')}
            style={{ background: 'rgba(255,255,255,0.15)', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', padding: '0.375rem', color: '#ffffff', flexShrink: 0 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>{copied ? 'check' : 'content_copy'}</span>
          </button>
        </div>
      </div>

      {/* Multi-Team Selector Card (when user belongs to > 1 team) */}
      {userTeams.length > 1 && (
        <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>groups</span>
            <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Your Teams ({userTeams.length})</span>
          </div>
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>
            You are a member of multiple teams. Click a team to switch:
          </p>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
            {userTeams.map((t) => {
              const isActive = t.id === activeTeamId;
              return (
                <div
                  key={t.id}
                  onClick={() => !isActive && switchTeam(t.id)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '0.625rem 0.75rem',
                    borderRadius: '0.5rem',
                    background: isActive ? 'var(--accent-blue-bg)' : 'var(--surface-container-low)',
                    border: isActive ? '1.5px solid var(--accent-blue)' : '1px solid var(--outline-variant)',
                    cursor: isActive ? 'default' : 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                      <span className="text-label-md" style={{
                        color: isActive ? '#1e40af' : 'var(--on-surface)',
                        fontWeight: isActive ? 700 : 600,
                      }}>
                        {t.name}
                      </span>
                      {isActive && (
                        <span style={{
                          padding: '0.0625rem 0.375rem',
                          borderRadius: 9999,
                          background: 'var(--accent-blue)',
                          color: '#ffffff',
                          fontSize: 10,
                          fontWeight: 700,
                        }}>
                          ACTIVE
                        </span>
                      )}
                    </div>
                    <span className="text-label-sm" style={{
                      color: isActive ? '#3b5998' : 'var(--on-surface-variant)',
                      fontSize: 12,
                      textTransform: 'capitalize',
                    }}>
                      Role: {t.role}
                    </span>
                  </div>
                  {!isActive && (
                    <button
                      onClick={(e) => { e.stopPropagation(); switchTeam(t.id); }}
                      className="btn btn-secondary"
                      style={{ height: '2rem', fontSize: 12, padding: '0 0.75rem' }}
                    >
                      Switch
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Invite Code (Owner Only) */}
      {isOwner && (
        <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.75rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--secondary)' }}>key</span>
            <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Team Invitation Code</span>
            <span style={{ marginLeft: 'auto', padding: '0.125rem 0.5rem', borderRadius: 9999, background: 'var(--secondary-container)', color: 'var(--on-secondary-container)' }} className="text-label-sm">Owner only</span>
          </div>
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.875rem' }}>
            Share this code with volunteers so they can join your team. Keep it private — only share via trusted channels.
          </p>
          {inviteCode ? (
            <div style={{ background: 'var(--surface-container-low)', borderRadius: '0.5rem', padding: '0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
              <code className="text-headline-sm" style={{ color: 'var(--secondary)', fontFamily: 'monospace', letterSpacing: '0.1em', fontWeight: 700 }}>{inviteCode}</code>
              <button
                onClick={() => copyToClipboard(inviteCode, 'Invite code')}
                style={{ background: 'var(--secondary-fixed)', border: 'none', borderRadius: '0.375rem', cursor: 'pointer', padding: '0.375rem 0.625rem', color: 'var(--on-secondary-fixed)' }}
                className="text-label-sm"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 16, verticalAlign: 'middle' }}>content_copy</span>
              </button>
            </div>
          ) : (
            <button
              className="btn btn-secondary"
              onClick={fetchInviteCode}
              disabled={loadingCode}
              style={{ width: '100%', height: '2.75rem' }}
            >
              {loadingCode
                ? <><div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} /><span>Loading...</span></>
                : <><span className="material-symbols-outlined" style={{ fontSize: 18 }}>visibility</span><span>Reveal Invite Code</span></>
              }
            </button>
          )}
        </div>
      )}

      {/* Members List */}
      <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
          <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>
            Team Members ({members.length})
          </span>
        </div>
        {members.length === 0 ? (
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)' }}>No members found.</p>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {members.map((m) => (
              <div key={m.uid} style={{
                display: 'flex', alignItems: 'center', gap: '0.75rem',
                padding: '0.625rem',
                background: m.uid === user?.uid ? 'var(--surface-container-low)' : 'transparent',
                borderRadius: '0.5rem',
              }}>
                {m.photoURL ? (
                  <img src={m.photoURL} alt={m.displayName} style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>person</span>
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                    <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.displayName}</span>
                    {m.uid === user?.uid && <span className="text-label-sm" style={{ color: 'var(--secondary)' }}>(you)</span>}
                  </div>
                  <span className="text-body-sm" style={{ color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', display: 'block' }}>{m.email}</span>
                </div>
                <span style={{
                  padding: '0.125rem 0.5rem', borderRadius: 9999, flexShrink: 0,
                  background: m.role === 'owner' ? 'var(--accent-blue-bg)' : 'var(--surface-container)',
                  color: m.role === 'owner' ? '#1e40af' : 'var(--on-surface-variant)',
                  border: m.role === 'owner' ? '1px solid var(--accent-blue-border)' : '1px solid transparent',
                  fontWeight: m.role === 'owner' ? 700 : 500,
                }} className="text-label-sm">
                  {m.role}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Your Account */}
      <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700, display: 'block', marginBottom: '0.75rem' }}>Your Account</span>
        {user && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginBottom: '0.875rem' }}>
            {user.photoURL && <img src={user.photoURL} alt={user.displayName || ''} style={{ width: 40, height: 40, borderRadius: '50%', objectFit: 'cover' }} />}
            <div style={{ minWidth: 0 }}>
              <div className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{user.displayName}</div>
              <div className="text-body-sm" style={{ color: 'var(--on-surface-variant)' }}>{user.email}</div>
            </div>
          </div>
        )}
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          {!isOwner && (
            showLeaveConfirm ? (
              <div style={{ flex: 1, background: 'var(--error-container)', borderRadius: '0.625rem', padding: '0.75rem' }}>
                <p className="text-body-sm" style={{ color: 'var(--on-error-container)', fontWeight: 600, marginBottom: '0.5rem' }}>
                  Leave team? You'll need a new invite to rejoin.
                </p>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button onClick={() => setShowLeaveConfirm(false)} className="btn btn-secondary" style={{ flex: 1, height: '2.25rem', fontSize: 13 }}>Cancel</button>
                  <button onClick={leaveTeam} className="btn" style={{ flex: 1, height: '2.25rem', fontSize: 13, background: 'var(--error)', color: 'var(--on-error)' }}>Leave</button>
                </div>
              </div>
            ) : (
              <button className="btn btn-secondary" onClick={() => setShowLeaveConfirm(true)} style={{ flex: 1, height: '2.5rem', fontSize: 13 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>exit_to_app</span>
                Leave Team
              </button>
            )
          )}
          <button className="btn btn-secondary" onClick={signOut} style={{ flex: isOwner ? 2 : 1, height: '2.5rem', fontSize: 13 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>logout</span>
            Sign Out
          </button>
        </div>
      </div>

      {/* About Community Donation Tracker Section */}
      <section
        id="about-section"
        aria-labelledby="about-section-heading"
        style={{
          background: 'var(--surface-container-lowest)',
          borderRadius: '0.75rem',
          padding: '1.25rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          border: '1px solid var(--outline-variant)',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', flexWrap: 'wrap', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: 'var(--primary)' }}>info</span>
            <h2 id="about-section-heading" className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700, margin: 0, fontSize: 16 }}>
              About Community Donation Tracker
            </h2>
          </div>
          <span style={{
            fontSize: '11px',
            fontWeight: 600,
            padding: '0.125rem 0.5rem',
            borderRadius: '9999px',
            background: 'var(--surface-container-high)',
            color: 'var(--on-surface-variant)',
          }}>
            v1.0.0 • Production
          </span>
        </div>

        <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', lineHeight: 1.6, marginBottom: '1rem' }}>
          A modern, responsive field coordination platform designed for community organizers and field volunteer teams. Manage door-to-door donation drives, track outreach contacts in real time, record contributions in Indian Rupees (INR), and organize field operations by groups and locations.
        </p>

        <div style={{
          display: 'flex',
          flexWrap: 'wrap',
          gap: '0.75rem',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingTop: '0.75rem',
          borderTop: '1px solid var(--outline-variant)',
        }}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.125rem' }}>
            <span className="text-label-sm" style={{ color: 'var(--on-surface)', fontWeight: 600 }}>
              Live Production Deployment
            </span>
            <span className="text-body-sm" style={{ color: 'var(--outline)', fontSize: '12px' }}>
              community-donation-tracker.vercel.app
            </span>
          </div>

          <a
            href="https://community-donation-tracker.vercel.app"
            target="_blank"
            rel="noopener noreferrer"
            aria-label="Open Community Donation Tracker Live Demo in a new tab"
            className="btn btn-primary"
            style={{
              textDecoration: 'none',
              display: 'inline-flex',
              alignItems: 'center',
              gap: '0.5rem',
              height: '2.5rem',
              padding: '0 1rem',
              fontSize: '13px',
              fontWeight: 600,
              borderRadius: '0.5rem',
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>open_in_new</span>
            <span>Live Demo</span>
          </a>
        </div>
      </section>
    </div>
  );
}
