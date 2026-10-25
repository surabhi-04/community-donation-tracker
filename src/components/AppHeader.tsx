import { useState, useRef, useEffect } from 'react';
import type { AppPage } from '../App';
import { useTeam } from '../contexts/TeamContext';

interface AppHeaderProps {
  currentPage: AppPage;
}

const PAGE_LABELS: Record<AppPage, string> = {
  dashboard: 'Dashboard',
  people: 'People',
  groups: 'Groups',
  locations: 'Locations',
  team: 'Team',
  reports: 'Reports',
};

export default function AppHeader({ currentPage }: AppHeaderProps) {
  const { team, userTeams, activeTeamId, switchTeam } = useTeam();
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown on outside click
  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setDropdownOpen(false);
      }
    }
    if (dropdownOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [dropdownOpen]);

  const handleSelectTeam = async (tid: string) => {
    setDropdownOpen(false);
    if (tid !== activeTeamId) {
      await switchTeam(tid);
    }
  };

  return (
    <header className="app-header pt-safe" style={{ height: 'auto', position: 'fixed', top: 0, left: 0, right: 0, zIndex: 50 }}>
      <div style={{
        height: '5rem',
        padding: '0 1rem',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        gap: '0.5rem',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0, flex: 1 }}>
          <div style={{
            width: 36, height: 36, borderRadius: '10px',
            background: 'var(--primary)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            flexShrink: 0,
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22, color: '#ffffff' }}>volunteer_activism</span>
          </div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
              <span className="text-headline-sm" style={{ color: 'var(--on-surface)', letterSpacing: '-0.01em' }}>Donation Tracker</span>
              <span style={{ color: 'var(--outline-variant)', fontSize: 14 }}>/</span>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>{PAGE_LABELS[currentPage]}</span>
            </div>
            {team && (
              <div ref={dropdownRef} style={{ position: 'relative', display: 'inline-block', maxWidth: '100%' }}>
                {userTeams.length > 1 ? (
                  <button
                    onClick={() => setDropdownOpen((prev) => !prev)}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '0.375rem',
                      marginTop: 2,
                      background: dropdownOpen ? 'var(--surface-container-high)' : 'var(--surface-container-low)',
                      border: '1px solid var(--outline-variant)',
                      borderRadius: '0.375rem',
                      padding: '0.125rem 0.5rem',
                      cursor: 'pointer',
                      maxWidth: '100%',
                      transition: 'background 0.15s ease',
                    }}
                    title="Switch Team"
                  >
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)', flexShrink: 0, animation: 'pulse 2s infinite' }} />
                    <span className="text-label-sm" style={{ color: 'var(--on-surface)', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 600 }}>
                      {team.name}
                    </span>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-surface-variant)', flexShrink: 0 }}>
                      {dropdownOpen ? 'expand_less' : 'expand_more'}
                    </span>
                  </button>
                ) : (
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginTop: 2 }}>
                    <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--secondary)', flexShrink: 0, animation: 'pulse 2s infinite' }} />
                    <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', letterSpacing: '0.02em', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {team.name}
                    </span>
                  </div>
                )}

                {/* Team Switcher Dropdown */}
                {dropdownOpen && (
                  <div style={{
                    position: 'absolute',
                    top: 'calc(100% + 4px)',
                    left: 0,
                    width: '18rem',
                    maxWidth: '90vw',
                    background: 'var(--surface-container-lowest)',
                    border: '1px solid var(--outline-variant)',
                    borderRadius: '0.75rem',
                    boxShadow: '0 8px 24px rgba(0, 0, 0, 0.15)',
                    padding: '0.5rem',
                    zIndex: 100,
                  }}>
                    <div style={{ padding: '0.375rem 0.5rem 0.5rem', borderBottom: '1px solid var(--outline-variant)', marginBottom: '0.25rem' }}>
                      <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', fontSize: 11, fontWeight: 700 }}>
                        Your Teams ({userTeams.length})
                      </span>
                    </div>
                    <div style={{ display: 'flex', flexDirection: 'column', gap: '0.25rem', maxHeight: '14rem', overflowY: 'auto' }}>
                      {userTeams.map((t) => {
                        const isActive = t.id === activeTeamId;
                        return (
                          <button
                            key={t.id}
                            onClick={() => handleSelectTeam(t.id)}
                            style={{
                              display: 'flex',
                              alignItems: 'center',
                              justifyContent: 'space-between',
                              padding: '0.5rem 0.625rem',
                              borderRadius: '0.5rem',
                              border: isActive ? '1px solid var(--accent-blue-border)' : '1px solid transparent',
                              background: isActive ? 'var(--accent-blue-bg)' : 'transparent',
                              cursor: 'pointer',
                              textAlign: 'left',
                              width: '100%',
                              transition: 'all 0.15s ease',
                            }}
                          >
                            <div style={{ minWidth: 0, flex: 1, paddingRight: '0.5rem' }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                                <span className="text-label-md" style={{
                                  color: isActive ? '#1e40af' : 'var(--on-surface)',
                                  fontWeight: isActive ? 700 : 500,
                                  overflow: 'hidden',
                                  textOverflow: 'ellipsis',
                                  whiteSpace: 'nowrap',
                                }}>
                                  {t.name}
                                </span>
                              </div>
                              <span className="text-label-sm" style={{
                                color: isActive ? '#3b5998' : 'var(--on-surface-variant)',
                                fontSize: 11,
                                textTransform: 'capitalize',
                              }}>
                                {t.role}
                              </span>
                            </div>
                            {isActive && (
                              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)', flexShrink: 0 }}>
                                check
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
