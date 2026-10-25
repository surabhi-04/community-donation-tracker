import { useMemo } from 'react';
import { useTeam } from '../contexts/TeamContext';
import type { AppPage } from '../App';
import type { Person, LocationStats } from '../types';
import { normalizeLocationForDisplay, isPersonDonor, formatINR } from '../types';

interface LocationsPageProps {
  onNavigate: (page: AppPage) => void;
}

function computeLocationStats(people: Person[]): LocationStats[] {
  const donors = people.filter(isPersonDonor);
  const map = new Map<string, LocationStats>();
  donors.forEach((p) => {
    const loc = normalizeLocationForDisplay(p.location) || 'No Location Assigned';
    if (!map.has(loc)) {
      map.set(loc, { location: loc, total: 0, pending: 0, visited: 0, collected: 0, collectedAmount: 0 });
    }
    const s = map.get(loc)!;
    s.total++;
    s[p.status]++;
    if (p.status === 'collected' && typeof p.amount === 'number' && Number.isFinite(p.amount) && p.amount > 0) {
      s.collectedAmount = (s.collectedAmount || 0) + p.amount;
    }
  });
  return Array.from(map.values()).sort((a, b) => b.total - a.total);
}

export default function LocationsPage({ onNavigate }: LocationsPageProps) {
  const { people, peopleLoading } = useTeam();
  const locationStats = useMemo(() => computeLocationStats(people), [people]);

  const donors = useMemo(() => people.filter(isPersonDonor), [people]);
  const totalDonors = donors.length;
  const totalCollected = donors.filter((p) => p.status === 'collected').length;
  const totalVisited = donors.filter((p) => p.status === 'visited').length;
  const totalPending = donors.filter((p) => p.status === 'pending').length;
  const overallPct = totalDonors > 0 ? Math.round((totalCollected / totalDonors) * 100) : 0;

  return (
    <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <div>
          <h1 className="text-headline-lg-m" style={{ color: 'var(--on-surface)', letterSpacing: '-0.01em' }}>Locations &amp; Towns</h1>
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
            {locationStats.length} zone{locationStats.length !== 1 ? 's' : ''} · {totalDonors} registered donors
          </p>
        </div>
      </div>

      {/* Summary KPI */}
      <div style={{ background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>map</span>
            </div>
            <div>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Campaign Coverage</span>
              <span className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>{locationStats.length} Location{locationStats.length !== 1 ? 's' : ''}</span>
            </div>
          </div>
          <div style={{
            display: 'inline-flex', alignItems: 'center', gap: 4,
            padding: '0.25rem 0.75rem', borderRadius: 9999,
            background: 'var(--secondary-container)', color: 'var(--on-secondary-container)',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_up</span>
            <span className="text-label-sm" style={{ fontWeight: 600 }}>{overallPct}% Collected</span>
          </div>
        </div>
        <div style={{ height: '0.625rem', background: 'var(--surface-container-highest)', borderRadius: 9999, overflow: 'hidden', display: 'flex', marginBottom: '0.625rem' }}>
          <div style={{ background: 'var(--secondary)', width: `${totalDonors > 0 ? (totalCollected / totalDonors) * 100 : 0}%`, transition: 'width 0.5s' }} />
          <div style={{ background: 'var(--surface-tint)', width: `${totalDonors > 0 ? (totalVisited / totalDonors) * 100 : 0}%`, transition: 'width 0.5s' }} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.5rem', textAlign: 'center' }}>
          {[
            { label: 'Pending', val: totalPending, color: 'var(--on-surface)' },
            { label: 'Visited', val: totalVisited, color: 'var(--on-surface)' },
            { label: 'Collected', val: totalCollected, color: 'var(--secondary)' },
          ].map((m) => (
            <div key={m.label} style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.5rem', padding: '0.5rem 0.25rem', boxShadow: '0 1px 2px rgba(0,0,0,0.04)' }}>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block' }}>{m.label}</span>
              <span className="text-label-md" style={{ fontWeight: 700, color: m.color, fontVariantNumeric: 'tabular-nums' }}>{m.val}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Zone Cards */}
      {peopleLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}>
          <div className="spinner" />
        </div>
      ) : locationStats.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          padding: '2.5rem 1rem', background: 'var(--surface-container-lowest)',
          borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.875rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--outline)' }}>location_off</span>
          </div>
          <h4 className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>No locations registered</h4>
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
            Add contacts with location info to view regional breakdowns.
          </p>
          <button className="btn btn-primary" style={{ marginTop: '1rem', height: '2.5rem', padding: '0 1rem' }} onClick={() => onNavigate('people')}>
            Go to People
          </button>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {locationStats.map((ls) => {
            const rate = ls.total > 0 ? Math.round((ls.collected / ls.total) * 100) : 0;
            const visitedRate = ls.total > 0 ? (ls.visited / ls.total) * 100 : 0;
            return (
              <div key={ls.location} style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem', marginBottom: '0.75rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                    <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>location_city</span>
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                        <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--secondary)', flexShrink: 0 }} />
                        <h2 className="text-headline-sm" style={{ color: 'var(--on-surface)', fontWeight: 600 }}>{ls.location}</h2>
                      </div>
                      <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>
                        {ls.total} donor{ls.total !== 1 ? 's' : ''} · <strong style={{ color: 'var(--secondary)' }}>{formatINR(ls.collectedAmount)}</strong> collected
                      </span>
                    </div>
                  </div>
                  <button
                    onClick={() => onNavigate('people')}
                    className="text-label-sm"
                    style={{
                      display: 'flex', alignItems: 'center', gap: 4, padding: '0.25rem 0.625rem',
                      borderRadius: '0.5rem', background: 'var(--surface-container-low)',
                      border: 'none', cursor: 'pointer', color: 'var(--on-surface)', fontFamily: 'var(--font-family)', fontWeight: 600,
                    }}
                  >
                    <span>View</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                  </button>
                </div>

                {/* Status Grid */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem', background: 'rgba(229,238,255,0.5)', borderRadius: '0.5rem', padding: '0.5rem', textAlign: 'center', marginBottom: '0.75rem' }}>
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

                {/* Progress */}
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.25rem' }}>
                  <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>Collection Rate</span>
                  <span className="text-label-sm" style={{ fontWeight: 700, color: 'var(--on-surface)' }}>{rate}%</span>
                </div>
                <div style={{ height: '0.4rem', background: 'var(--surface-container)', borderRadius: 9999, overflow: 'hidden', display: 'flex' }}>
                  <div style={{ background: 'var(--secondary)', width: `${rate}%`, borderRadius: 9999, transition: 'width 0.5s' }} />
                  <div style={{ background: 'var(--surface-tint)', width: `${visitedRate}%`, transition: 'width 0.5s' }} />
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
