import { useMemo } from 'react';
import { useTeam } from '../contexts/TeamContext';
import type { AppPage } from '../App';
import type { Person, LocationStats, GroupStats } from '../types';
import { normalizeLocationForDisplay, isPersonDonor, isPersonInviter, formatINR } from '../types';

interface DashboardPageProps {
  onNavigate: (page: AppPage) => void;
}

function computeStats(people: Person[]) {
  // Requirement: Inviter-only people must not appear in the donor list or counts
  const donors = people.filter(isPersonDonor);
  const total = donors.length;
  const pending = donors.filter((p) => p.status === 'pending').length;
  const visited = donors.filter((p) => p.status === 'visited').length;
  const collected = donors.filter((p) => p.status === 'collected').length;

  // Donation Amount Metrics
  let totalAmountCollected = 0;
  let totalRecordedDonations = 0;
  let collectedWithoutAmount = 0;
  let totalContributionsCount = 0;

  donors.forEach((p) => {
    if (p.status === 'collected') {
      if (typeof p.amount === 'number' && p.amount > 0) {
        totalAmountCollected += p.amount;
        totalRecordedDonations++;
        totalContributionsCount += p.contributions && p.contributions.length > 0 ? p.contributions.length : 1;
      } else {
        collectedWithoutAmount++;
      }
    }
  });

  totalAmountCollected = Math.round(totalAmountCollected * 100) / 100;

  // Invitation metrics (all donors appear in invitation list)
  const inviters = people.filter(isPersonInviter);
  const totalInvitations = inviters.length;
  const confirmedInvitations = inviters.filter((p) => p.inviterStatus === 'confirmed').length;
  const pendingInvitations = inviters.filter((p) => !p.inviterStatus || p.inviterStatus === 'not_invited').length;

  // Group by location (using normalizeLocationForDisplay so fallback sentinel displays as 'No Location')
  const locationMap = new Map<string, LocationStats>();
  donors.forEach((p) => {
    const loc = normalizeLocationForDisplay(p.location) || 'No Location Assigned';
    if (!locationMap.has(loc)) {
      locationMap.set(loc, { location: loc, total: 0, pending: 0, visited: 0, collected: 0, collectedAmount: 0 });
    }
    const ls = locationMap.get(loc)!;
    ls.total++;
    ls[p.status]++;
    if (p.status === 'collected' && typeof p.amount === 'number' && p.amount > 0) {
      ls.collectedAmount += p.amount;
    }
  });

  // Group by Group / Block / Area
  const groupMap = new Map<string, GroupStats>();
  donors.forEach((p) => {
    const grp = p.group?.trim() || 'No Group Assigned';
    if (!groupMap.has(grp)) {
      groupMap.set(grp, { group: grp, total: 0, pending: 0, visited: 0, collected: 0, collectedAmount: 0 });
    }
    const gs = groupMap.get(grp)!;
    gs.total++;
    gs[p.status]++;
    if (p.status === 'collected' && typeof p.amount === 'number' && p.amount > 0) {
      gs.collectedAmount += p.amount;
    }
  });

  return {
    total,
    pending,
    visited,
    collected,
    totalAmountCollected,
    totalRecordedDonations,
    collectedWithoutAmount,
    totalContributionsCount,
    totalInvitations,
    confirmedInvitations,
    pendingInvitations,
    locationStats: Array.from(locationMap.values()).sort((a, b) => b.total - a.total),
    groupStats: Array.from(groupMap.values()).sort((a, b) => b.total - a.total),
  };
}

export default function DashboardPage({ onNavigate }: DashboardPageProps) {
  const { team, people, peopleLoading } = useTeam();
  const stats = useMemo(() => computeStats(people), [people]);

  const collectedPct = stats.total > 0 ? Math.round((stats.collected / stats.total) * 100) : 0;
  const pendingPct   = stats.total > 0 ? Math.round((stats.pending / stats.total) * 100) : 0;

  return (
    <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

      {/* Campaign Banner */}
      <div style={{ background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
              <div style={{ width: 20, height: 20, borderRadius: '50%', background: 'var(--secondary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 13, color: 'var(--on-secondary-container)' }}>volunteer_activism</span>
              </div>
              <span className="text-label-sm" style={{ color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>{team?.name}</span>
            </div>
            <h1 className="text-headline-sm" style={{ color: 'var(--on-surface)', fontWeight: 700, lineHeight: '1.2' }}>
              Community Donation Drive
            </h1>
            {team?.description && (
              <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>{team.description}</p>
            )}
          </div>
        </div>
        {/* Sync Indicator */}
        <div style={{ marginTop: '0.75rem', background: 'rgba(255,255,255,0.7)', borderRadius: '0.5rem', padding: '0.375rem 0.75rem', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ position: 'relative', width: 8, height: 8, flexShrink: 0 }}>
              <span style={{ position: 'absolute', inset: 0, borderRadius: '50%', background: 'var(--secondary)', opacity: 0.7, animation: 'ping 1s infinite' }} />
              <span style={{ position: 'relative', width: 8, height: 8, display: 'inline-block', borderRadius: '50%', background: 'var(--secondary)' }} />
            </span>
            <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Firebase sync active</span>
          </div>
          <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Live</span>
        </div>
      </div>

      {/* Quick Actions */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
        <button
          className="btn btn-primary"
          onClick={() => onNavigate('people')}
          style={{ height: '3rem', borderRadius: '0.625rem', fontSize: 14 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span>
          <span>+ Add Person</span>
        </button>
        <button
          className="btn btn-secondary"
          onClick={() => onNavigate('people')}
          style={{ height: '3rem', borderRadius: '0.625rem', fontSize: 14 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>format_list_bulleted</span>
          <span>Contact List</span>
        </button>
      </div>

      {/* Summary Metric Cards & Financial Overview */}
      {peopleLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div className="spinner" />
        </div>
      ) : (
        <>
          {/* Total Amount Collected Summary Card */}
          <div style={{
            background: 'linear-gradient(135deg, #00513B 0%, #006C4E 100%)',
            color: '#ffffff',
            borderRadius: '0.875rem',
            padding: '1.125rem 1.25rem',
            boxShadow: '0 4px 12px rgba(0, 108, 78, 0.22)',
            display: 'flex',
            flexDirection: 'column',
            gap: '0.625rem',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div style={{
                  width: 32, height: 32, borderRadius: '50%',
                  background: 'rgba(255, 255, 255, 0.2)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ffffff' }}>payments</span>
                </div>
                <span style={{ fontSize: 13, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255, 255, 255, 0.9)' }}>
                  Total Amount Collected
                </span>
              </div>
              <span style={{
                fontSize: 11, fontWeight: 700, padding: '0.2rem 0.5rem', borderRadius: 9999,
                background: 'rgba(255, 255, 255, 0.2)', color: '#ffffff', letterSpacing: '0.04em',
              }}>
                TEAM TOTAL
              </span>
            </div>

            <div style={{ display: 'flex', alignItems: 'baseline', gap: '0.5rem', marginTop: '0.25rem' }}>
              <div style={{ fontSize: '2.25rem', fontWeight: 800, letterSpacing: '-0.02em', lineHeight: 1.1, fontVariantNumeric: 'tabular-nums' }}>
                {formatINR(stats.totalAmountCollected, { showZero: true })}
              </div>
            </div>

            <div style={{
              display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: '0.75rem',
              paddingTop: '0.5rem', borderTop: '1px solid rgba(255, 255, 255, 0.2)',
              fontSize: 12, color: 'rgba(255, 255, 255, 0.9)',
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>receipt_long</span>
                <span><strong>{stats.totalRecordedDonations}</strong> donors with recorded amount</span>
              </div>
              {stats.totalContributionsCount > stats.totalRecordedDonations && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                  <span>•</span>
                  <span><strong>{stats.totalContributionsCount}</strong> total contributions</span>
                </div>
              )}
              {stats.collectedWithoutAmount > 0 && (
                <div style={{
                  display: 'flex', alignItems: 'center', gap: 4,
                  background: 'rgba(255, 235, 59, 0.25)', padding: '0.125rem 0.5rem',
                  borderRadius: 4, color: '#fff9c4', fontWeight: 600,
                }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 15 }}>warning</span>
                  <span>{stats.collectedWithoutAmount} collected without amount</span>
                </div>
              )}
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            {/* Total Donors */}
            <div className="metric-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Total Donors</span>
                <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface-variant)' }}>volunteer_activism</span>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <div className="text-headline-lg-m" style={{ color: 'var(--on-surface)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{stats.total}</div>
                <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>Registered donor contacts</p>
              </div>
            </div>

            {/* Pending Visits */}
            <div className="metric-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Pending</span>
                <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface)' }}>schedule</span>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <div className="text-headline-lg-m" style={{ color: 'var(--on-surface)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{stats.pending}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--outline)' }} />
                  <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>{pendingPct}% remaining</span>
                </div>
              </div>
            </div>

            {/* Visited */}
            <div className="metric-card">
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Visited</span>
                <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container-high)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--on-surface)' }}>pending_actions</span>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <div className="text-headline-lg-m" style={{ color: 'var(--on-surface)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{stats.visited}</div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: 'var(--surface-tint)' }} />
                  <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Needs follow-up</span>
                </div>
              </div>
            </div>

            {/* Collected */}
            <div className="metric-card" style={{ background: 'var(--secondary-fixed)', boxShadow: '0 1px 3px rgba(0,108,78,0.15)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <span className="text-label-sm" style={{ color: 'var(--on-secondary-fixed-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Collected</span>
                <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'rgba(0,108,78,0.18)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--secondary)' }}>verified</span>
                </div>
              </div>
              <div style={{ marginTop: '0.5rem' }}>
                <div className="text-headline-lg-m" style={{ color: 'var(--on-surface)', fontWeight: 700, fontVariantNumeric: 'tabular-nums' }}>{stats.collected}</div>
                <div style={{
                  marginTop: 4, display: 'inline-flex', alignItems: 'center', gap: 4,
                  padding: '0.125rem 0.5rem', borderRadius: '0.25rem',
                  background: 'rgba(0,108,78,0.18)',
                }}>
                  <span className="text-label-sm" style={{ color: 'var(--on-secondary-fixed)', fontWeight: 700 }}>{collectedPct}% collected</span>
                </div>
              </div>
            </div>
          </div>

          {/* Invitation Drive Summary Card */}
          <div style={{
            background: 'var(--accent-blue-bg)',
            border: '1.5px solid var(--accent-blue-border)',
            borderRadius: '0.75rem',
            padding: '0.875rem 1rem',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
              <div style={{ width: 38, height: 38, borderRadius: '0.5rem', background: 'var(--accent-blue)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 20, color: '#ffffff' }}>mail</span>
              </div>
              <div>
                <span className="text-label-sm" style={{ color: 'var(--accent-blue-text)', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 700 }}>Invitations &amp; Guests</span>
                <div style={{ color: 'var(--on-surface)', fontWeight: 700, fontSize: 15 }}>
                  {stats.confirmedInvitations} Confirmed / {stats.totalInvitations} Total
                </div>
              </div>
            </div>
            <button
              onClick={() => onNavigate('people')}
              className="btn btn-secondary"
              style={{
                height: '2.25rem', padding: '0 0.875rem', fontSize: 13,
                borderColor: 'var(--accent-blue-border)', color: 'var(--accent-blue-text)', fontWeight: 600,
              }}
            >
              View List
            </button>
          </div>

          {/* Progress Bar */}
          {stats.total > 0 && (
            <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>analytics</span>
                  <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 600 }}>Campaign Coverage</span>
                </div>
                <span className="text-label-sm" style={{ color: 'var(--secondary)', fontWeight: 600 }}>
                  {stats.collected + stats.visited} / {stats.total} Reached
                </span>
              </div>
              <div className="progress-bar">
                <div className="progress-collected" style={{ width: `${(stats.collected / stats.total) * 100}%`, transition: 'width 0.5s' }} />
                <div className="progress-visited" style={{ width: `${(stats.visited / stats.total) * 100}%`, transition: 'width 0.5s' }} />
                <div className="progress-pending" style={{ flex: 1 }} />
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '0.75rem' }}>
                {[
                  { label: `Collected (${stats.collected})`, color: 'var(--secondary)' },
                  { label: `Follow-up (${stats.visited})`, color: 'var(--surface-tint)' },
                  { label: `Pending (${stats.pending})`, color: 'var(--surface-container-highest)' },
                ].map((item) => (
                  <div key={item.label} style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span style={{ width: 10, height: 10, borderRadius: '50%', background: item.color, flexShrink: 0 }} />
                    <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>{item.label}</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress by Area / Block / Group */}
          {stats.groupStats.length > 0 && stats.groupStats.some(g => g.group !== 'No Group Assigned') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem' }}>
                <div>
                  <h2 className="text-headline-sm" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Progress by Group</h2>
                  <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Breakdown by Area / Block / Group</p>
                </div>
                <button
                  className="text-label-md"
                  style={{ color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                  onClick={() => onNavigate('groups')}
                >
                  <span>Details</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                </button>
              </div>
              {stats.groupStats.slice(0, 3).map((gs) => {
                const rate = gs.total > 0 ? Math.round((gs.collected / gs.total) * 100) : 0;
                return (
                  <div key={gs.group} style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>workspaces</span>
                        <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{gs.group}</span>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="text-label-sm" style={{ color: 'var(--secondary)', fontWeight: 700 }}>
                          {formatINR(gs.collectedAmount, { showZero: true })} • {gs.collected}/{gs.total} ({rate}%)
                        </span>
                      </div>
                    </div>
                    <div className="progress-bar" style={{ height: '0.35rem' }}>
                      <div style={{ background: 'var(--secondary)', width: `${rate}%`, borderRadius: 9999, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Location Breakdown */}
          {stats.locationStats.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 0.25rem' }}>
                <div>
                  <h2 className="text-headline-sm" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Progress by Location</h2>
                  <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Regional status across locations</p>
                </div>
                <button
                  className="text-label-md"
                  style={{ color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 2 }}
                  onClick={() => onNavigate('locations')}
                >
                  <span>Details</span>
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>chevron_right</span>
                </button>
              </div>
              {stats.locationStats.slice(0, 4).map((ls) => {
                const rate = ls.total > 0 ? Math.round((ls.collected / ls.total) * 100) : 0;
                return (
                  <div key={ls.location} style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem', gap: '0.5rem' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                        <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                          <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>location_city</span>
                        </div>
                        <div>
                          <span className="text-headline-sm" style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{ls.location}</span>
                          <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>{ls.total} donor contacts</p>
                        </div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <span className="text-label-sm" style={{ background: 'var(--secondary-fixed)', color: 'var(--on-secondary-fixed)', padding: '3px 8px', borderRadius: 4, fontWeight: 700 }}>
                          {formatINR(ls.collectedAmount, { showZero: true })}
                        </span>
                      </div>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem', background: 'rgba(229,238,255,0.5)', borderRadius: '0.5rem', padding: '0.5rem', textAlign: 'center', marginBottom: '0.625rem' }}>
                      {[
                        { label: 'Pending', val: ls.pending, color: 'var(--on-surface)' },
                        { label: 'Visited', val: ls.visited, color: 'var(--on-surface)' },
                        { label: 'Collected', val: ls.collected, color: 'var(--secondary)' },
                      ].map((m) => (
                        <div key={m.label}>
                          <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block' }}>{m.label}</span>
                          <span className="text-label-md" style={{ fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.val}</span>
                        </div>
                      ))}
                    </div>
                    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                      <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Collection Rate</span>
                      <span className="text-label-sm" style={{ fontWeight: 700, color: 'var(--on-surface)' }}>{rate}%</span>
                    </div>
                    <div className="progress-bar" style={{ height: '0.4rem' }}>
                      <div style={{ background: 'var(--secondary)', width: `${rate}%`, borderRadius: 9999, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Empty State */}
          {stats.total === 0 && !peopleLoading && (
            <div style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
              textAlign: 'center', padding: '2.5rem 1rem',
              background: 'var(--surface-container-lowest)', borderRadius: '0.75rem',
              boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
            }}>
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '1rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--outline)' }}>volunteer_activism</span>
              </div>
              <h3 className="text-headline-sm" style={{ color: 'var(--on-surface)', marginBottom: '0.375rem' }}>No donors registered yet</h3>
              <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', maxWidth: '22rem' }}>
                Start adding people to track your field visits and donation collections.
              </p>
              <button
                className="btn btn-primary"
                style={{ marginTop: '1.25rem', height: '2.75rem', padding: '0 1.25rem' }}
                onClick={() => onNavigate('people')}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
                Add First Person
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
