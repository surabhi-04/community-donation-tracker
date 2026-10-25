import { useMemo } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { useAuth } from '../contexts/AuthContext';
import { useToast } from '../contexts/ToastContext';
import type { Person } from '../types';
import { normalizeLocationForDisplay, isPersonDonor, isPersonInviter, formatINR } from '../types';

// ── CSV Export ──────────────────────────────────────────────────
function escapeCsv(value: string): string {
  if (/[",\n\r]/.test(value)) {
    return '"' + value.replace(/"/g, '""') + '"';
  }
  return value;
}

function formatTimestamp(ts: { toDate?: () => Date } | null | undefined): string {
  if (!ts) return '';
  try {
    const d = typeof ts.toDate === 'function' ? ts.toDate() : new Date(ts as unknown as string);
    return d.toLocaleString('en-IN', { timeZone: 'Asia/Kolkata' });
  } catch {
    return '';
  }
}

function buildCsv(people: Person[]): string {
  const BOM = '\uFEFF';
  const headers = [
    'Name', 'Phone', 'Location', 'Group',
    'Role', 'Donation Status', 'Donation Collected', 'Amount Donated (INR)',
    'Invitation Status', 'Created By', 'Created At', 'Updated At',
  ];

  let totalAmountSum = 0;

  const rows = people.map((p) => {
    const isDonor = isPersonDonor(p);
    const isInviter = isPersonInviter(p);
    const loc = normalizeLocationForDisplay(p.location);

    const roleLabel = isDonor && isInviter
      ? 'Donor & Inviter'
      : isDonor
      ? 'Donor'
      : 'Inviter Only';

    const donationStatusLabel = isDonor
      ? p.status === 'collected'
        ? 'DONATION COLLECTED'
        : p.status === 'visited'
        ? 'VISITED (FOLLOW-UP)'
        : 'PENDING VISIT'
      : 'N/A (Inviter Only)';

    const donationCollected = isDonor
      ? p.status === 'collected' ? 'Yes' : 'No'
      : 'N/A';

    let amountStr = 'N/A';
    if (isDonor) {
      if (p.status === 'collected') {
        if (typeof p.amount === 'number' && p.amount > 0) {
          amountStr = p.amount.toFixed(2);
          totalAmountSum += p.amount;
        } else {
          amountStr = 'Amount not recorded';
        }
      } else {
        amountStr = '0.00';
      }
    }

    const inviterStatusLabel = isInviter
      ? (p.inviterStatus === 'confirmed'
        ? 'CONFIRMED'
        : p.inviterStatus === 'invited'
        ? 'INVITED'
        : 'NOT INVITED')
      : 'N/A';

    return [
      escapeCsv(p.fullName),
      // Prefix phone with single-quote to preserve leading 0s as text in Excel
      p.phone ? escapeCsv("'" + p.phone) : '',
      escapeCsv(loc), // Blank string if location was empty or fallback sentinel
      escapeCsv(p.group || ''),
      escapeCsv(roleLabel),
      escapeCsv(donationStatusLabel),
      donationCollected,
      escapeCsv(amountStr),
      escapeCsv(inviterStatusLabel),
      escapeCsv(p.createdByName || ''),
      escapeCsv(formatTimestamp(p.createdAt)),
      escapeCsv(formatTimestamp(p.updatedAt)),
    ];
  });

  // Summary Row at the bottom of CSV
  const summaryRow = [
    'TOTAL RECORDED AMOUNT (INR)', '', '', '', '', '', '',
    totalAmountSum.toFixed(2),
    '', '', '', '',
  ];

  return BOM + [headers.join(','), ...rows.map((r) => r.join(',')), summaryRow.join(',')].join('\r\n');
}

function downloadCsv(content: string, filename: string) {
  const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}

// ── Status Badge for Print ─────────────────────────────────────
function PrintStatus({ status }: { status: string }) {
  if (status === 'collected') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 4,
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 700,
        textTransform: 'uppercase', background: '#97f5cc', color: '#002115',
      }}>
        <span style={{ width: 6, height: 6, borderRadius: '50%', background: '#006c4e', flexShrink: 0 }} />
        DONATION COLLECTED
      </span>
    );
  }
  if (status === 'visited') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center',
        padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
        textTransform: 'uppercase', background: '#dce9ff', color: '#0b1c30',
      }}>
        VISITED (FOLLOW-UP)
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center',
      padding: '2px 8px', borderRadius: 4, fontSize: 10, fontWeight: 600,
      textTransform: 'uppercase', background: '#ffdad6', color: '#93000a',
    }}>
      PENDING VISIT
    </span>
  );
}

// ── Reports Page ────────────────────────────────────────────────
export default function ReportsPage() {
  const { team, people, peopleLoading } = useTeam();
  const { user } = useAuth();
  const { showToast } = useToast();

  const stats = useMemo(() => {
    const donors    = people.filter(isPersonDonor);
    const total     = donors.length;
    const collected = donors.filter((p) => p.status === 'collected').length;
    const visited   = donors.filter((p) => p.status === 'visited').length;
    const pending   = donors.filter((p) => p.status === 'pending').length;
    const visitedPct   = total > 0 ? ((collected + visited) / total * 100).toFixed(1) : '0';
    const collectedPct = total > 0 ? (collected / total * 100).toFixed(1) : '0';
    const pendingPct   = total > 0 ? (pending / total * 100).toFixed(1) : '0';

    const inviters = people.filter(isPersonInviter);
    const totalInvitations = inviters.length;
    const confirmedInvitations = inviters.filter((p) => p.inviterStatus === 'confirmed').length;
    const invitedPending = inviters.filter((p) => p.inviterStatus === 'invited').length;

    const totalAmount = donors
      .filter((p) => p.status === 'collected' && typeof p.amount === 'number' && p.amount > 0)
      .reduce((sum, p) => sum + (p.amount || 0), 0);

    return {
      total, collected, visited, pending, visitedPct, collectedPct, pendingPct,
      totalAmount,
      totalInvitations, confirmedInvitations, invitedPending,
    };
  }, [people]);

  const locationStats = useMemo(() => {
    const map = new Map<string, { total: number; collected: number; visited: number; pending: number }>();
    people.filter(isPersonDonor).forEach((p) => {
      const loc = normalizeLocationForDisplay(p.location) || 'No Location Assigned';
      if (!map.has(loc)) map.set(loc, { total: 0, collected: 0, visited: 0, pending: 0 });
      const s = map.get(loc)!;
      s.total++;
      s[p.status]++;
    });
    return Array.from(map.entries())
      .map(([location, s]) => ({ location, ...s }))
      .sort((a, b) => b.total - a.total);
  }, [people]);

  const reportDate = new Date().toLocaleString('en-IN', {
    timeZone: 'Asia/Kolkata',
    day: '2-digit', month: 'short', year: 'numeric',
    hour: '2-digit', minute: '2-digit',
  });

  const handleCsvExport = () => {
    if (people.length === 0) { showToast('No data to export', 'info'); return; }
    const slug = (team?.name || 'team').toLowerCase().replace(/\s+/g, '_');
    const date = new Date().toISOString().slice(0, 10);
    const csv  = buildCsv(people);
    downloadCsv(csv, `${slug}_report_${date}.csv`);
    showToast('CSV downloaded successfully!', 'success');
  };

  const handlePrint = () => window.print();

  return (
    <>
      {/* ── Screen View ── */}
      <div className="no-print" style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>

        {/* Header Card */}
        <section style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ minWidth: 0 }}>
              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6, marginBottom: 4 }} className="text-label-sm">
                <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--secondary)' }} />
                <span style={{ color: 'var(--secondary)', textTransform: 'uppercase', letterSpacing: '0.07em', fontWeight: 700 }}>Audit &amp; Export Ready</span>
              </span>
              <h1 className="text-headline-sm" style={{ color: 'var(--on-surface)', letterSpacing: '-0.01em' }}>Campaign &amp; Field Report</h1>
              <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 15, color: 'var(--outline)' }}>schedule</span>
                Generated: {reportDate} IST
              </p>
            </div>
            <span style={{
              padding: '0.25rem 0.625rem', borderRadius: '0.375rem',
              background: 'var(--surface-container)', color: 'var(--on-surface-variant)',
            }} className="text-label-sm">{team?.name?.slice(0, 14) || 'Team'}</span>
          </div>

          {/* Export Buttons */}
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
            <button
              className="btn btn-primary"
              onClick={handlePrint}
              style={{ height: '3rem', fontSize: 14, borderRadius: '0.625rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20 }}>print</span>
              Print / PDF (A4)
            </button>
            <button
              className="btn btn-secondary"
              onClick={handleCsvExport}
              disabled={people.length === 0}
              style={{ height: '3rem', fontSize: 14, borderRadius: '0.625rem' }}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--secondary)' }}>table_view</span>
              Export CSV
            </button>
          </div>
        </section>

        {/* Total Collection Hero Card */}
        <section style={{
          background: 'linear-gradient(135deg, #00513B 0%, #006C4E 100%)',
          color: '#ffffff',
          borderRadius: '0.75rem',
          padding: '1rem 1.25rem',
          boxShadow: '0 2px 8px rgba(0, 108, 78, 0.2)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div>
            <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: 'rgba(255,255,255,0.85)' }}>
              Total Collections (INR)
            </span>
            <div style={{ fontSize: '1.75rem', fontWeight: 800, marginTop: 2, fontVariantNumeric: 'tabular-nums' }}>
              {formatINR(stats.totalAmount, { showZero: true })}
            </div>
          </div>
          <div style={{ textAlign: 'right', fontSize: 12, color: 'rgba(255,255,255,0.9)' }}>
            <div><strong>{stats.collected}</strong> collections verified</div>
            <div><strong>{stats.total}</strong> total donor contacts</div>
          </div>
        </section>

        {/* Metric Bento */}
        {peopleLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2rem' }}><div className="spinner" /></div>
        ) : (
          <>
            <section style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.625rem' }}>
              {[
                { label: 'Donors', val: stats.total, pct: '100', icon: 'volunteer_activism', sub: 'Total Donors', color: 'var(--primary)' },
                { label: 'Visited', val: stats.visited + stats.collected, pct: stats.visitedPct, icon: 'how_to_reg', sub: 'Field Verified', color: 'var(--secondary)' },
                { label: 'Collections', val: stats.collected, pct: stats.collectedPct, icon: 'task_alt', sub: 'Donations Collected', color: 'var(--secondary)' },
                { label: 'Pending Visits', val: stats.pending, pct: stats.pendingPct, icon: 'pending_actions', sub: 'Awaiting Field Visit', color: 'var(--error)' },
              ].map((m) => (
                <div key={m.label} style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)', display: 'flex', flexDirection: 'column', justifyContent: 'space-between' }}>
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                    <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>{m.label}</span>
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: m.color }}>{m.icon}</span>
                  </div>
                  <div style={{ marginTop: '0.5rem' }}>
                    <div style={{ display: 'flex', alignItems: 'baseline', gap: 6 }}>
                      <span className="text-headline-lg-m" style={{ color: 'var(--on-surface)', fontVariantNumeric: 'tabular-nums', fontWeight: 700 }}>{m.val}</span>
                      <span className="text-label-sm" style={{ color: m.color, fontWeight: 600 }}>{m.pct}%</span>
                    </div>
                    <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>{m.sub}</p>
                  </div>
                  <div style={{ height: '0.375rem', background: 'var(--surface-container-highest)', borderRadius: 9999, overflow: 'hidden', marginTop: '0.5rem' }}>
                    <div style={{ background: m.color, width: `${Math.min(100, parseFloat(m.pct))}%`, height: '100%', borderRadius: 9999, transition: 'width 0.5s' }} />
                  </div>
                </div>
              ))}
            </section>

            {/* Invitation Statistics Overview */}
            <section style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '0.875rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                  <div style={{ width: 28, height: 28, borderRadius: '0.375rem', background: 'var(--primary-container)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-primary-container)' }}>mail</span>
                  </div>
                  <div>
                    <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Invitations &amp; Guests</span>
                    <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>
                      {stats.confirmedInvitations} Confirmed / {stats.totalInvitations} Invited Contacts
                    </p>
                  </div>
                </div>
              </div>
            </section>

            {/* Location Summary Preview */}
            {locationStats.length > 0 && (
              <section style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                  <span style={{ display: 'flex', alignItems: 'center', gap: 6 }} className="text-label-md">
                    <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>location_on</span>
                    <span style={{ color: 'var(--on-surface)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>Zone Summary</span>
                  </span>
                  <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)' }}>{locationStats.length} active zones</span>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: '0.5rem' }}>
                  {locationStats.map((ls) => (
                    <div key={ls.location} style={{ background: 'var(--surface-container-low)', borderRadius: '0.625rem', padding: '0.625rem', textAlign: 'center' }}>
                      <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ls.location}</p>
                      <p className="text-headline-sm" style={{ color: 'var(--on-surface)', fontWeight: 700, fontVariantNumeric: 'tabular-nums', marginTop: 2 }}>{ls.total}</p>
                      <span className="text-label-sm" style={{ color: 'var(--secondary)', fontWeight: 600 }}>{ls.collected} Collected</span>
                    </div>
                  ))}
                </div>
              </section>
            )}

            {/* Sample Table Preview */}
            {people.length > 0 && (
              <section style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.75rem' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--on-surface-variant)' }}>description</span>
                  <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    Ledger Preview (first {Math.min(5, people.length)} of {people.length})
                  </span>
                </div>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', minWidth: 520 }}>
                    <thead>
                      <tr style={{ background: 'var(--surface-container)' }}>
                        {['Name', 'Phone', 'Location', 'Group', 'Role', 'Status'].map((h) => (
                          <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontSize: 11, fontWeight: 600, color: 'var(--on-surface)', textTransform: 'uppercase', letterSpacing: '0.05em', whiteSpace: 'nowrap' }}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {people.slice(0, 5).map((p, i) => {
                        const loc = normalizeLocationForDisplay(p.location);
                        const isDonor = isPersonDonor(p);
                        return (
                          <tr key={p.id} style={{ background: i % 2 === 0 ? 'var(--surface-container-lowest)' : 'rgba(229,238,255,0.3)' }}>
                            <td style={{ padding: '10px', fontWeight: 600, color: 'var(--on-surface)', textDecoration: p.status === 'collected' ? 'line-through' : 'none', textDecorationColor: 'var(--secondary)' }}>
                              {p.fullName}
                              {p.status === 'collected' && <span style={{ marginLeft: 4, fontSize: 11, color: 'var(--secondary)', fontWeight: 700 }}>✓</span>}
                            </td>
                            <td style={{ padding: '10px', fontFamily: 'monospace', fontSize: 12, color: 'var(--on-surface-variant)' }}>{p.phone || '—'}</td>
                            <td style={{ padding: '10px', color: 'var(--on-surface)', fontSize: 13 }}>{loc || '—'}</td>
                            <td style={{ padding: '10px', color: 'var(--on-surface)', fontSize: 12 }}>{p.group || '—'}</td>
                            <td style={{ padding: '10px', fontSize: 11, fontWeight: 600 }}>
                              {isDonor ? 'Donor' : 'Inviter Only'}
                            </td>
                            <td style={{ padding: '10px' }}>
                              {isDonor ? <PrintStatus status={p.status} /> : <span style={{ fontSize: 11, color: 'var(--on-surface-variant)' }}>{p.inviterStatus || 'Not Invited'}</span>}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
                {people.length > 5 && (
                  <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.625rem', textAlign: 'center' }}>
                    + {people.length - 5} more records included in CSV export and print
                  </p>
                )}
              </section>
            )}

            {/* Empty State */}
            {people.length === 0 && (
              <div style={{
                display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
                padding: '2.5rem 1rem', background: 'var(--surface-container-lowest)',
                borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
              }}>
                <span className="material-symbols-outlined" style={{ fontSize: 40, color: 'var(--outline)', marginBottom: '0.75rem' }}>description</span>
                <h4 className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>No data to report</h4>
                <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
                  Add people in the People tab to generate reports.
                </p>
              </div>
            )}
          </>
        )}
      </div>

      {/* ── Print-only A4 Layout ── */}
      <div style={{ display: 'none' }} className="print-page" id="printArea">
        <PrintReport people={people} team={team} reportDate={reportDate} locationStats={locationStats} stats={stats} user={user} />
      </div>

      <style>{`
        @media print {
          #printArea { display: block !important; padding: 0; }
          .no-print { display: none !important; }
        }
      `}</style>
    </>
  );
}

// ── Print Report Component ──────────────────────────────────────
interface PrintReportProps {
  people: Person[];
  team: { name: string; id: string } | null;
  reportDate: string;
  locationStats: { location: string; total: number; collected: number; visited: number; pending: number }[];
  stats: { total: number; collected: number; visited: number; pending: number; collectedPct: string; totalAmount?: number };
  user: { displayName?: string | null; email?: string | null } | null;
}

function PrintReport({ people, team, reportDate, locationStats, stats, user }: PrintReportProps) {
  return (
    <div style={{ fontFamily: 'Inter, Arial, sans-serif', color: '#0b1c30', background: '#fff', padding: '10mm 12mm' }}>
      {/* Header */}
      <div style={{ borderBottom: '2px solid #0b1c30', paddingBottom: '8px', marginBottom: '12px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between' }}>
          <div>
            <div style={{ fontSize: 9, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#45464d', marginBottom: 4 }}>
              Community Donation Tracker
            </div>
            <h1 style={{ fontSize: 18, fontWeight: 700, margin: 0 }}>
              Community Donation &amp; Field Visit Report
            </h1>
            <p style={{ fontSize: 11, color: '#45464d', margin: '4px 0 0' }}>
              Team: <strong>{team?.name}</strong> &nbsp;|&nbsp; Generated: {reportDate} &nbsp;|&nbsp; Cloud Synced ✓
            </p>
          </div>
          <div style={{ textAlign: 'center', padding: '4px 8px', border: '2px solid #006c4e', borderRadius: 4 }}>
            <div style={{ fontSize: 16, color: '#006c4e' }}>✓</div>
            <div style={{ fontSize: 8, fontWeight: 700, textTransform: 'uppercase', color: '#006c4e' }}>Verified</div>
          </div>
        </div>
      </div>

      {/* Stats Row */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(5, 1fr)', gap: '8px', marginBottom: '14px' }}>
        {[
          { label: 'Total Donors', val: stats.total },
          { label: 'Donations Collected', val: stats.collected },
          { label: 'Total Collected (INR)', val: formatINR(stats.totalAmount, { showZero: true }) },
          { label: 'Visited (Follow-up)', val: stats.visited },
          { label: 'Pending Visits', val: stats.pending },
        ].map((s) => (
          <div key={s.label} style={{ border: '1px solid #e2e8f0', borderRadius: 4, padding: '8px', textAlign: 'center' }}>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#0b1c30' }}>{s.val}</div>
            <div style={{ fontSize: 8, color: '#45464d', textTransform: 'uppercase', letterSpacing: '0.05em' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Main Table */}
      <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: '14px', fontSize: 10 }}>
        <thead>
          <tr style={{ background: '#f1f5f9' }}>
            {['#', 'Name', 'Phone', 'Location', 'Group', 'Visited', 'Collected', 'Amount (₹)', 'Status'].map((h) => (
              <th key={h} style={{ border: '1px solid #cbd5e1', padding: '6px 8px', textAlign: 'left', fontWeight: 700, textTransform: 'uppercase', fontSize: 9, letterSpacing: '0.05em' }}>{h}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {people.map((p, i) => {
            const isDonor = isPersonDonor(p);
            const isCollected = p.status === 'collected';
            const isVisited   = p.status === 'visited' || isCollected;
            const loc = normalizeLocationForDisplay(p.location);

            return (
              <tr key={p.id} style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', color: '#64748b', fontSize: 9 }}>{i + 1}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', fontWeight: 600, textDecoration: isCollected ? 'line-through' : 'none', color: isCollected ? '#64748b' : '#0b1c30' }}>
                  {p.fullName}{isCollected ? ' ✓' : ''}
                </td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', fontFamily: 'monospace', fontSize: 9, color: '#45464d' }}>{p.phone || '—'}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px' }}>{loc || '—'}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px' }}>{p.group || '—'}</td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 9 }}>
                  {isDonor ? (isVisited ? '[X] Yes' : '[   ] No') : '—'}
                </td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center', fontFamily: 'monospace', fontWeight: 700, fontSize: 9, color: isCollected ? '#006c4e' : '#0b1c30' }}>
                  {isDonor ? (isCollected ? '[X] Yes' : '[   ] No') : '—'}
                </td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', fontWeight: 700, color: '#006c4e', fontSize: 9 }}>
                  {isDonor && isCollected ? (typeof p.amount === 'number' && p.amount > 0 ? formatINR(p.amount) : 'Not recorded') : '—'}
                </td>
                <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px' }}>
                  {isDonor ? <PrintStatus status={p.status} /> : <span style={{ fontSize: 9 }}>Inviter Only</span>}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {/* Location Summary */}
      {locationStats.length > 0 && (
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontWeight: 700, fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '6px', color: '#0b1c30' }}>Zone &amp; Location Aggregate Summary</div>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 10 }}>
            <thead>
              <tr style={{ background: '#f1f5f9' }}>
                {['Location', 'Donors', 'Pending', 'Visited', 'Collected', 'Rate'].map((h) => (
                  <th key={h} style={{ border: '1px solid #cbd5e1', padding: '5px 8px', fontWeight: 700, textTransform: 'uppercase', fontSize: 9 }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {locationStats.map((ls, i) => {
                const rate = ls.total > 0 ? Math.round((ls.collected / ls.total) * 100) : 0;
                return (
                  <tr key={ls.location} style={{ background: i % 2 === 0 ? '#ffffff' : '#f8fafc' }}>
                    <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', fontWeight: 600 }}>{ls.location}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{ls.total}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center' }}>{ls.pending}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center' }}>{ls.visited}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center', fontWeight: 700, color: '#006c4e' }}>{ls.collected}</td>
                    <td style={{ border: '1px solid #e2e8f0', padding: '5px 8px', textAlign: 'center', fontWeight: 700 }}>{rate}%</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Sign-off */}
      <div style={{ display: 'flex', gap: '40px', marginTop: '20px', marginBottom: '14px' }}>
        {[
          { label: 'Field Coordinator Signature', name: user?.displayName || '_______________________' },
          { label: 'Team Lead Verification', name: 'Community Drive Oversight Council' },
        ].map((s) => (
          <div key={s.label} style={{ flex: 1 }}>
            <div style={{ height: 28, borderBottom: '1px solid #94a3b8', marginBottom: 4, fontStyle: 'italic', fontSize: 12, color: '#0b1c30', display: 'flex', alignItems: 'flex-end' }}>{s.name}</div>
            <div style={{ fontSize: 9, fontWeight: 700, textTransform: 'uppercase', color: '#0b1c30' }}>{s.label}</div>
          </div>
        ))}
      </div>

      {/* Footer */}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 8, color: '#94a3b8', borderTop: '1px solid #e2e8f0', paddingTop: 6 }}>
        <span>Confidential Field Audit Sheet</span>
        <span>Generated via Community Donation Tracker</span>
        <span>Team ID: {team?.id?.slice(0, 12)}...</span>
      </div>
    </div>
  );
}
