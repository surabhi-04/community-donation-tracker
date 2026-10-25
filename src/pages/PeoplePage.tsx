import { useState, useMemo, useCallback, useEffect } from 'react';
import { useTeam } from '../contexts/TeamContext';
import { useToast } from '../contexts/ToastContext';
import type { Person, PersonStatus, InviterStatus } from '../types';
import {
  normalizeLocationForDisplay,
  isPersonDonor,
  isPersonInviter,
} from '../types';

// ── Badges ──────────────────────────────────────────────────────
function StatusBadge({ status }: { status: PersonStatus }) {
  if (status === 'collected') {
    return (
      <span className="status-badge collected">
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--secondary)' }}>task_alt</span>
        Donation Collected
      </span>
    );
  }
  if (status === 'visited') {
    return (
      <span className="status-badge visited">
        <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--on-tertiary-container)' }}>schedule</span>
        Visited — Follow Up
      </span>
    );
  }
  return (
    <span className="status-badge pending">
      <span style={{ width: 8, height: 8, borderRadius: '50%', background: 'var(--outline-variant)' }} />
      Pending Visit
    </span>
  );
}

function InviterBadge({ inviterStatus }: { inviterStatus?: InviterStatus }) {
  const status = inviterStatus || 'not_invited';
  if (status === 'confirmed') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontSize: 10, fontWeight: 600,
        background: 'var(--secondary-container, #e8f5e9)', color: 'var(--on-secondary-container, #1b5e20)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>how_to_reg</span>
        Confirmed
      </span>
    );
  }
  if (status === 'invited') {
    return (
      <span style={{
        display: 'inline-flex', alignItems: 'center', gap: 3,
        padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontSize: 10, fontWeight: 600,
        background: 'var(--primary-container, #e3f2fd)', color: 'var(--on-primary-container, #0d47a1)',
      }}>
        <span className="material-symbols-outlined" style={{ fontSize: 12 }}>mail</span>
        Invited
      </span>
    );
  }
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 3,
      padding: '0.125rem 0.375rem', borderRadius: '0.25rem', fontSize: 10, fontWeight: 600,
      background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)',
    }}>
      <span className="material-symbols-outlined" style={{ fontSize: 12 }}>schedule_send</span>
      Not Invited
    </span>
  );
}

// ── Role chips ──────────────────────────────────────────────────
function RoleChips({ person }: { person: Person }) {
  const isDonor = isPersonDonor(person);
  const isInviter = isPersonInviter(person);
  return (
    <div style={{ display: 'flex', gap: '0.25rem', flexWrap: 'wrap' }}>
      {isDonor && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '0.0625rem 0.375rem', borderRadius: '0.25rem', fontSize: 10, fontWeight: 600,
          background: 'var(--secondary-fixed, #e8f5e9)', color: 'var(--on-secondary-fixed, #1b5e20)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>volunteer_activism</span>
          Donor
        </span>
      )}
      {isInviter && (
        <span style={{
          display: 'inline-flex', alignItems: 'center', gap: 2,
          padding: '0.0625rem 0.375rem', borderRadius: '0.25rem', fontSize: 10, fontWeight: 600,
          background: 'var(--primary-container, #e3f2fd)', color: 'var(--on-primary-container, #0d47a1)',
        }}>
          <span className="material-symbols-outlined" style={{ fontSize: 11 }}>mail</span>
          Inviter
        </span>
      )}
    </div>
  );
}

// ── Duplicate Warning Component ─────────────────────────────────
export interface DuplicateSuggestion {
  person: Person;
  matchType: 'exact' | 'close';
}

/**
 * Pure helper for duplicate contact matching within active team's people.
 * Performs case-insensitive, whitespace-normalized comparison.
 * Avoids false substring matches (e.g. "Dan" will not match "Danielle").
 */
export function findDuplicatePeople(
  name: string,
  allPeople: Person[],
  excludeId?: string
): DuplicateSuggestion[] {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];

  // Normalize: lowercase and collapse consecutive whitespaces into a single space
  const normalized = trimmed.toLowerCase().replace(/\s+/g, ' ');
  const results: DuplicateSuggestion[] = [];

  for (const p of allPeople) {
    if (excludeId && p.id === excludeId) continue;
    if (!p.fullName) continue;

    const existingNormalized = p.fullName.trim().toLowerCase().replace(/\s+/g, ' ');
    if (!existingNormalized) continue;

    if (existingNormalized === normalized) {
      results.push({ person: p, matchType: 'exact' });
    } else if (normalized.includes(' ') && existingNormalized.includes(' ')) {
      // Transposed words match (e.g. "Ramesh Kumar" vs "Kumar Ramesh")
      const wordsA = normalized.split(' ').filter(Boolean).sort().join(' ');
      const wordsB = existingNormalized.split(' ').filter(Boolean).sort().join(' ');
      if (wordsA === wordsB) {
        results.push({ person: p, matchType: 'close' });
      }
    }
  }

  return results;
}

function DuplicateWarning({
  suggestions,
  confirmedDifferent,
  onConfirmDifferent,
  onSelectExisting,
}: {
  suggestions: DuplicateSuggestion[];
  confirmedDifferent: boolean;
  onConfirmDifferent: (confirmed: boolean) => void;
  onSelectExisting: (person: Person) => void;
}) {
  if (suggestions.length === 0) return null;
  const exactMatch = suggestions.find((s) => s.matchType === 'exact');

  return (
    <div style={{
      background: 'var(--warning-bg)',
      borderRadius: '0.625rem',
      padding: '0.875rem',
      marginTop: '0.5rem',
      border: '1.5px solid var(--warning-border)',
      boxShadow: '0 1px 3px rgba(217, 119, 6, 0.08)',
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.375rem' }}>
        <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--warning)' }}>warning</span>
        <span className="text-label-md" style={{ color: 'var(--warning-text)', fontWeight: 700 }}>
          {exactMatch ? 'A person with this exact name already exists in this team' : 'Similar contact name found in this team'}
        </span>
      </div>
      <p className="text-body-sm" style={{ color: 'var(--warning-text)', marginBottom: '0.625rem' }}>
        Avoid duplicate entries by reusing the existing contact record:
      </p>

      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem', marginBottom: '0.625rem' }}>
        {suggestions.map((s) => {
          const loc = normalizeLocationForDisplay(s.person.location);
          return (
            <div
              key={s.person.id}
              style={{
                padding: '0.5rem 0.75rem',
                borderRadius: '0.5rem',
                background: 'var(--surface-container-lowest)',
                border: '1px solid var(--warning-border)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: '0.5rem',
              }}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
                  <span style={{ fontWeight: 700, color: 'var(--on-surface)' }}>{s.person.fullName}</span>
                  {s.matchType === 'exact' ? (
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--warning)', color: '#ffffff', fontWeight: 700,
                    }}>
                      Exact Match
                    </span>
                  ) : (
                    <span style={{
                      fontSize: 10, padding: '2px 6px', borderRadius: 4,
                      background: 'var(--surface-container-high)', color: 'var(--on-surface-variant)', fontWeight: 600,
                    }}>
                      Similar Name
                    </span>
                  )}
                </div>
                <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                  {s.person.phone ? `📞 ${s.person.phone}` : 'No phone'}
                  {loc ? ` · 📍 ${loc}` : ''}
                  {s.person.group ? ` · 🏷️ ${s.person.group}` : ''}
                  {` · ${s.person.status}`}
                </div>
              </div>
              <button
                type="button"
                className="btn btn-secondary"
                onClick={() => onSelectExisting(s.person)}
                style={{ height: '2rem', padding: '0 0.625rem', fontSize: 12, flexShrink: 0 }}
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>open_in_new</span>
                Reuse Record
              </button>
            </div>
          );
        })}
      </div>

      <label style={{
        display: 'flex',
        alignItems: 'flex-start',
        gap: '0.5rem',
        cursor: 'pointer',
        fontSize: 13,
        color: 'var(--warning-text)',
        fontWeight: 600,
        paddingTop: '0.25rem',
      }}>
        <input
          type="checkbox"
          checked={confirmedDifferent}
          onChange={(e) => onConfirmDifferent(e.target.checked)}
          style={{ width: 16, height: 16, marginTop: 2, accentColor: 'var(--warning)' }}
        />
        <span>I confirm this is a genuinely different person with the same name.</span>
      </label>
    </div>
  );
}

// ── Person Form (Add / Edit) ────────────────────────────────────
export interface PersonFormProps {
  initial?: Partial<Person>;
  onSave: (data: {
    fullName: string;
    phone?: string;
    location?: string;
    group?: string;
    status: PersonStatus;
    isDonor?: boolean;
    isInviter?: boolean;
    inviterStatus?: InviterStatus;
  }) => Promise<void>;
  onClose: () => void;
  locations: string[];
  groups: string[];
  allPeople: Person[];
  onEditExisting?: (person: Person) => void;
}

export function PersonForm({
  initial,
  onSave,
  onClose,
  locations,
  groups,
  allPeople,
  onEditExisting,
}: PersonFormProps) {
  const currentPersonId = initial?.id;
  const isEditing = Boolean(currentPersonId);
  const [fullName, setFullName] = useState(initial?.fullName ?? '');
  const [phone, setPhone] = useState(initial?.phone ?? '');
  const [location, setLocation] = useState(normalizeLocationForDisplay(initial?.location));
  const [customLocation, setCustomLocation] = useState('');
  const [group, setGroup] = useState(initial?.group ?? '');
  const [customGroup, setCustomGroup] = useState('');
  const [status, setStatus] = useState<PersonStatus>(initial?.status ?? 'pending');

  // Role selections:
  // - Opening Add Person starts with both Donor and Inviter unselected.
  // - When editing an existing person, initialize from that person's actual saved roles.
  const [isDonor, setIsDonor] = useState<boolean>(() => {
    if (isEditing) return isPersonDonor(initial as Person);
    return false;
  });
  const [isInviter, setIsInviter] = useState<boolean>(() => {
    if (isEditing) return !isPersonDonor(initial as Person) && initial?.isInviter === true;
    return false;
  });

  const [inviterStatus, setInviterStatus] = useState<InviterStatus>(initial?.inviterStatus ?? 'not_invited');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<{ fullName?: string; role?: string }>({});
  const [duplicates, setDuplicates] = useState<DuplicateSuggestion[]>([]);
  const [confirmedDifferent, setConfirmedDifferent] = useState(false);

  const allLocations = useMemo(() => {
    const set = new Set(locations.map(normalizeLocationForDisplay).filter(Boolean));
    if (initial?.location) {
      const initLoc = normalizeLocationForDisplay(initial.location);
      if (initLoc) set.add(initLoc);
    }
    return Array.from(set).sort();
  }, [locations, initial]);

  const allGroups = useMemo(() => {
    const set = new Set(groups.filter(Boolean));
    if (initial?.group?.trim()) set.add(initial.group.trim());
    return Array.from(set).sort();
  }, [groups, initial]);

  // Name change handler: clears stale duplicate matches immediately
  const handleNameChange = (val: string) => {
    setFullName(val);
    // Instantly clear stale duplicate matches and confirmation
    setDuplicates([]);
    setConfirmedDifferent(false);
    if (errors.fullName) {
      setErrors((prev) => ({ ...prev, fullName: undefined }));
    }
  };

  // Debounced duplicate detection against active team's people
  // Immediately bypassed when saving is in-flight to prevent snapshot-triggered false duplicates
  useEffect(() => {
    if (isEditing || saving) return;
    const trimmed = fullName.trim();
    if (trimmed.length < 2) {
      setDuplicates([]);
      return;
    }
    const timer = setTimeout(() => {
      if (saving) return;
      const matches = findDuplicatePeople(trimmed, allPeople, currentPersonId);
      setDuplicates(matches.slice(0, 5));
    }, 200);

    return () => clearTimeout(timer);
  }, [fullName, allPeople, isEditing, saving, currentPersonId]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    const trimmedName = fullName.trim();
    const errs: { fullName?: string; role?: string } = {};

    if (!trimmedName) {
      errs.fullName = 'Full name is required';
    }

    if (!isDonor && !isInviter) {
      errs.role = 'Select Donor or Inviter before saving.';
    }

    if (Object.keys(errs).length) {
      setErrors(errs);
      return;
    }

    // Synchronous duplicate verification against current active team people
    if (!isEditing && !confirmedDifferent) {
      const syncMatches = findDuplicatePeople(trimmedName, allPeople, currentPersonId);
      if (syncMatches.length > 0) {
        setDuplicates(syncMatches.slice(0, 5));
        return; // Block accidental duplicate submission until confirmed
      }
    }

    const finalLocation = location === '__custom__' ? customLocation.trim() : location.trim();
    const finalGroup = group === '__custom__' ? customGroup.trim() : group.trim();

    setSaving(true);
    setDuplicates([]); // Clear duplicates so subsequent snapshot updates won't display warning

    try {
      await onSave({
        fullName: trimmedName,
        phone: phone.trim() || undefined,
        location: finalLocation || undefined,
        group: finalGroup || undefined,
        status: isDonor ? status : 'pending',
        isDonor,
        isInviter: isDonor ? false : isInviter,
        inviterStatus: isInviter || isDonor ? inviterStatus : 'not_invited',
      });
      onClose();
    } catch (err) {
      console.error(err);
      setSaving(false);
    }
  };

  const hasDuplicateBlock = duplicates.length > 0 && !confirmedDifferent && !isEditing;

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bottom-sheet" style={{ maxHeight: '92vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.875rem', borderBottom: '1px solid var(--surface-container)', marginBottom: '1rem' }}>
          <div>
            <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              {isEditing ? 'Edit Contact' : 'New Contact'}
            </span>
            <h3 className="text-headline-md" style={{ color: 'var(--on-surface)' }}>
              {isEditing ? initial?.fullName : 'Add Person'}
            </h3>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 22 }}>close</span>
          </button>
        </div>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
          {/* Full Name */}
          <div>
            <label className="form-label" htmlFor="fullName">Full Name *</label>
            <input
              id="fullName"
              className="form-input"
              value={fullName}
              onChange={(e) => handleNameChange(e.target.value)}
              placeholder="e.g. Ramesh Kumar"
              maxLength={100}
              required
            />
            {errors.fullName && <p className="form-error">{errors.fullName}</p>}

            {/* Duplicate detection warnings and reuse option */}
            {!isEditing && duplicates.length > 0 && (
              <DuplicateWarning
                suggestions={duplicates}
                confirmedDifferent={confirmedDifferent}
                onConfirmDifferent={setConfirmedDifferent}
                onSelectExisting={(p) => {
                  onClose();
                  onEditExisting?.(p);
                }}
              />
            )}
          </div>

          {/* Phone Number */}
          <div>
            <label className="form-label" htmlFor="phone">Phone Number (optional)</label>
            <input
              id="phone"
              className="form-input"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+91 98xxx xxxxx"
              maxLength={20}
              type="tel"
            />
          </div>

          {/* Area / Block / Group */}
          <div>
            <label className="form-label" htmlFor="group">Area / Block / Group (optional)</label>
            <select
              id="group"
              className="form-input"
              value={allGroups.includes(group) ? group : group === '__custom__' ? '__custom__' : ''}
              onChange={(e) => setGroup(e.target.value)}
            >
              <option value="">No group</option>
              {allGroups.map((g) => <option key={g} value={g}>{g}</option>)}
              <option value="__custom__">+ Add new group...</option>
            </select>
            {group === '__custom__' && (
              <input
                className="form-input"
                style={{ marginTop: '0.375rem' }}
                value={customGroup}
                onChange={(e) => setCustomGroup(e.target.value)}
                placeholder="e.g. Block A, Sector 4, Youth Wing"
                maxLength={80}
                autoFocus
              />
            )}
          </div>

          {/* Location / Town (Optional) */}
          <div>
            <label className="form-label" htmlFor="location">Location / Town (optional)</label>
            <select
              id="location"
              className="form-input"
              value={allLocations.includes(location) ? location : location === '__custom__' ? '__custom__' : ''}
              onChange={(e) => setLocation(e.target.value)}
            >
              <option value="">No location</option>
              {allLocations.map((l) => <option key={l} value={l}>{l}</option>)}
              <option value="__custom__">+ Add new location...</option>
            </select>
            {location === '__custom__' && (
              <input
                className="form-input"
                style={{ marginTop: '0.375rem' }}
                value={customLocation}
                onChange={(e) => setCustomLocation(e.target.value)}
                placeholder="e.g. Vijayanagar, Ward 12"
                maxLength={80}
                autoFocus
              />
            )}
          </div>

          {/* Role Selection */}
          <div>
            <label className="form-label">Role *</label>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
              <button
                type="button"
                onClick={() => {
                  const next = !isDonor;
                  setIsDonor(next);
                  if (next) setIsInviter(false);
                  setErrors((prev) => ({ ...prev, role: undefined }));
                }}
                className={`segmented-grid-btn ${isDonor ? 'selected-success' : ''}`}
              >
                <span className="material-symbols-outlined btn-icon" style={{ fontSize: 18 }}>volunteer_activism</span>
                <span>Donor</span>
              </button>

              <button
                type="button"
                onClick={() => {
                  const next = !isInviter;
                  setIsInviter(next);
                  if (next) setIsDonor(false);
                  setErrors((prev) => ({ ...prev, role: undefined }));
                }}
                className={`segmented-grid-btn ${isInviter ? 'selected-primary' : ''}`}
              >
                <span className="material-symbols-outlined btn-icon" style={{ fontSize: 18 }}>mail</span>
                <span>Inviter</span>
              </button>
            </div>
            {errors.role && (
              <p className="form-error" style={{ marginTop: '0.375rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                <span>{errors.role}</span>
              </p>
            )}
            {!isDonor && !isInviter && !errors.role && (
              <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
                Select Donor or Inviter before saving.
              </p>
            )}
            {isDonor && (
              <p className="text-label-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem' }}>
                All donors automatically appear in the invitation list.
              </p>
            )}
          </div>

          {/* Donation Status (only if donor) */}
          {isDonor && (
            <div>
              <label className="form-label">Donation Status</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem' }}>
                {(['pending', 'visited', 'collected'] as PersonStatus[]).map((s) => {
                  const isSel = status === s;
                  const selClass = s === 'collected' ? 'selected-success' : s === 'visited' ? 'selected-primary' : 'selected-warning';
                  return (
                    <button
                      key={s}
                      type="button"
                      onClick={() => setStatus(s)}
                      className={`segmented-grid-btn ${isSel ? selClass : ''}`}
                    >
                      {s === 'collected' ? 'Collected' : s === 'visited' ? 'Visited' : 'Pending'}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Invitation Status (only if inviter or donor) */}
          {(isInviter || isDonor) && (
            <div>
              <label className="form-label">Invitation Status</label>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: '0.375rem' }}>
                {([
                  { value: 'not_invited' as InviterStatus, label: 'Not Invited', selClass: 'selected-neutral' },
                  { value: 'invited' as InviterStatus, label: 'Invited', selClass: 'selected-primary' },
                  { value: 'confirmed' as InviterStatus, label: 'Confirmed', selClass: 'selected-success' },
                ]).map((opt) => {
                  const isSel = inviterStatus === opt.value;
                  return (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setInviterStatus(opt.value)}
                      className={`segmented-grid-btn ${isSel ? opt.selClass : ''}`}
                    >
                      {opt.label}
                    </button>
                  );
                })}
              </div>
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: '0.625rem', marginTop: '0.5rem' }}>
            <button type="button" className="btn btn-secondary" onClick={onClose} style={{ flex: 1 }}>
              Cancel
            </button>
            <button
              type="submit"
              className="btn btn-primary"
              disabled={saving || hasDuplicateBlock}
              style={{ flex: 2 }}
            >
              {saving ? (
                <><div className="spinner" style={{ width: 18, height: 18, borderWidth: 2 }} /><span>Saving...</span></>
              ) : hasDuplicateBlock ? (
                'Confirm Duplicate Check'
              ) : (
                initial ? 'Save Changes' : 'Add Person'
              )}
            </button>
          </div>
        </form>
      </div>
    </>
  );
}

// ── Status Drawer ───────────────────────────────────────────────
interface StatusDrawerProps {
  person: Person;
  onApplyStatus: (status: PersonStatus) => Promise<void>;
  onApplyInviterStatus: (status: InviterStatus) => Promise<void>;
  onClose: () => void;
  onDelete: () => void;
}

function StatusDrawer({ person, onApplyStatus, onApplyInviterStatus, onClose, onDelete }: StatusDrawerProps) {
  const [applying, setApplying] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const isDonor = isPersonDonor(person);
  const isInviter = isPersonInviter(person);

  const handleDonationStatus = async (s: PersonStatus) => {
    setApplying(`donor_${s}`);
    await onApplyStatus(s);
    setApplying(null);
    onClose();
  };

  const handleInviterStatus = async (s: InviterStatus) => {
    setApplying(`inviter_${s}`);
    await onApplyInviterStatus(s);
    setApplying(null);
    onClose();
  };

  const handleDelete = async () => {
    setDeleting(true);
    await onDelete();
    setDeleting(false);
    onClose();
  };

  const DONATION_OPTIONS: { status: PersonStatus; label: string; sub: string; icon: string }[] = [
    { status: 'pending', label: 'Pending Visit', sub: 'Not yet visited for this drive', icon: 'hourglass_empty' },
    { status: 'visited', label: 'Visited — Follow Up', sub: 'Spoke with contact; follow-up scheduled', icon: 'schedule' },
    { status: 'collected', label: 'Donation Collected', sub: 'Donation received and verified', icon: 'task_alt' },
  ];

  const INVITATION_OPTIONS: { status: InviterStatus; label: string; sub: string; icon: string }[] = [
    { status: 'not_invited', label: 'Not Invited', sub: 'Invitation not yet sent', icon: 'schedule_send' },
    { status: 'invited', label: 'Invited', sub: 'Invitation sent, awaiting response', icon: 'mail' },
    { status: 'confirmed', label: 'Confirmed', sub: 'Confirmed participation/attendance', icon: 'how_to_reg' },
  ];

  return (
    <>
      <div className="scrim" onClick={onClose} />
      <div className="bottom-sheet" style={{ maxHeight: '90vh', overflowY: 'auto' }}>
        <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
        
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingBottom: '0.75rem', borderBottom: '1px solid var(--surface-container)', marginBottom: '0.75rem' }}>
          <div>
            <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>Quick Status Update</span>
            <h3 className="text-headline-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>{person.fullName}</h3>
            <div style={{ marginTop: 2 }}>
              <RoleChips person={person} />
            </div>
          </div>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.5rem', borderRadius: '50%', color: 'var(--on-surface-variant)' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>close</span>
          </button>
        </div>

        {/* Independent Donation Status */}
        {isDonor && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--secondary)' }}>volunteer_activism</span>
              <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Donation Status</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {DONATION_OPTIONS.map((opt) => {
                const isSelected = person.status === opt.status;
                const isBusy = applying === `donor_${opt.status}`;
                return (
                  <button
                    key={opt.status}
                    onClick={() => handleDonationStatus(opt.status)}
                    disabled={applying !== null || isSelected}
                    className={`status-option-row ${isSelected ? `selected-${opt.status}` : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textAlign: 'left' }}>
                      <span className="material-symbols-outlined row-icon" style={{ fontSize: 20 }}>
                        {opt.icon}
                      </span>
                      <div>
                        <div className="text-label-md row-title">{opt.label}</div>
                        <div className="text-body-sm row-sub">{opt.sub}</div>
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="material-symbols-outlined row-icon" style={{ fontSize: 20 }}>check_circle</span>
                    ) : isBusy ? (
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>chevron_right</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Independent Invitation Status */}
        {isInviter && (
          <div style={{ marginBottom: '1.25rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>mail</span>
              <span className="text-label-md" style={{ color: 'var(--on-surface)', fontWeight: 700 }}>Invitation Status</span>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.375rem' }}>
              {INVITATION_OPTIONS.map((opt) => {
                const currentStatus = person.inviterStatus || 'not_invited';
                const isSelected = currentStatus === opt.status;
                const isBusy = applying === `inviter_${opt.status}`;
                return (
                  <button
                    key={opt.status}
                    onClick={() => handleInviterStatus(opt.status)}
                    disabled={applying !== null || isSelected}
                    className={`status-option-row ${isSelected ? `selected-${opt.status}` : ''}`}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', textAlign: 'left' }}>
                      <span className="material-symbols-outlined row-icon" style={{ fontSize: 20 }}>
                        {opt.icon}
                      </span>
                      <div>
                        <div className="text-label-md row-title">{opt.label}</div>
                        <div className="text-body-sm row-sub">{opt.sub}</div>
                      </div>
                    </div>
                    {isSelected ? (
                      <span className="material-symbols-outlined row-icon" style={{ fontSize: 20 }}>check_circle</span>
                    ) : isBusy ? (
                      <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2 }} />
                    ) : (
                      <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--outline)' }}>chevron_right</span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* Delete Record */}
        {!confirmDelete ? (
          <button
            onClick={() => setConfirmDelete(true)}
            className="btn btn-danger"
            style={{ width: '100%', minHeight: '2.5rem' }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_outline</span>
            Delete Record
          </button>
        ) : (
          <div style={{ padding: '0.75rem', borderRadius: '0.75rem', background: 'var(--error-container)', textAlign: 'center', border: '1px solid var(--error-border)' }}>
            <p className="text-body-sm" style={{ color: 'var(--on-error-container)', marginBottom: '0.75rem', fontWeight: 600 }}>
              Delete "{person.fullName}"? This action cannot be undone.
            </p>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button onClick={() => setConfirmDelete(false)} className="btn btn-secondary" style={{ flex: 1, height: '2.5rem', fontSize: 13 }}>Cancel</button>
              <button onClick={handleDelete} disabled={deleting} className="btn" style={{ flex: 1, height: '2.5rem', fontSize: 13, background: 'var(--error)', color: 'var(--on-error)' }}>
                {deleting ? <div className="spinner" style={{ width: 16, height: 16, borderWidth: 2, borderColor: 'rgba(255,255,255,0.3)', borderTopColor: '#fff' }} /> : 'Delete'}
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}

// ── ContactCard ─────────────────────────────────────────────────
interface ContactCardProps {
  person: Person;
  onEdit: () => void;
  onOpenStatus: () => void;
  onMarkVisited: () => void;
  onMarkCollected: () => void;
  onMarkInvited: () => void;
  onMarkConfirmed: () => void;
  viewMode: 'all' | 'donors' | 'invitations';
}

function ContactCard({
  person,
  onEdit,
  onOpenStatus,
  onMarkVisited,
  onMarkCollected,
  onMarkInvited,
  onMarkConfirmed,
  viewMode,
}: ContactCardProps) {
  const isDonor = isPersonDonor(person);
  const isInviter = isPersonInviter(person);
  const isCollected = person.status === 'collected';
  const isVisited = person.status === 'visited';
  const displayLoc = normalizeLocationForDisplay(person.location);

  return (
    <div className="contact-card">
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', gap: '0.75rem', minWidth: 0 }}>
          {/* Status Checkbox / Action */}
          <button
            onClick={onOpenStatus}
            style={{
              marginTop: 2, width: 24, height: 24, borderRadius: '0.375rem', border: 'none', cursor: 'pointer',
              flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center',
              background: isCollected ? 'var(--secondary)' : isVisited ? 'var(--surface-container-high)' : 'var(--surface-container)',
              transition: 'background 0.15s, transform 0.1s',
            }}
            aria-label="Change status"
          >
            <span
              className="material-symbols-outlined"
              style={{
                fontSize: 18,
                color: isCollected ? 'var(--on-secondary)' : isVisited ? 'var(--on-tertiary-container)' : 'var(--outline)',
              }}
            >
              {isCollected || isVisited ? 'check_box' : 'check_box_outline_blank'}
            </span>
          </button>

          <div style={{ minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem' }}>
              <h3
                className="text-headline-sm"
                style={{
                  color: isCollected ? 'var(--on-surface-variant)' : 'var(--on-surface)',
                  textDecoration: isCollected ? 'line-through' : 'none',
                  textDecorationColor: 'var(--secondary)',
                  textDecorationThickness: 2,
                  overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                }}
              >
                {person.fullName}
              </h3>
              {isCollected && <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--secondary)', flexShrink: 0 }}>verified</span>}
            </div>

            {person.phone && (
              <a
                href={`tel:${person.phone}`}
                style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--on-surface-variant)', textDecoration: 'none', marginTop: 2 }}
                className="text-body-sm"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 14 }}>call</span>
                <span>{person.phone}</span>
              </a>
            )}

            {/* Role chips */}
            <div style={{ marginTop: 4 }}>
              <RoleChips person={person} />
            </div>
          </div>
        </div>

        {/* Status Badges */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'flex-end', gap: 4, flexShrink: 0 }}>
          {isDonor && (
            <button onClick={onOpenStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <StatusBadge status={person.status} />
            </button>
          )}
          {isInviter && (
            <button onClick={onOpenStatus} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: 0 }}>
              <InviterBadge inviterStatus={person.inviterStatus} />
            </button>
          )}
        </div>
      </div>

      {/* Group & Location Badges */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem', marginTop: '0.625rem', color: 'var(--on-surface-variant)', flexWrap: 'wrap' }}>
        {person.group && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', background: 'var(--surface-container)', padding: '2px 8px', borderRadius: 4 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--primary)' }}>workspaces</span>
            <span className="text-body-sm" style={{ fontWeight: 600 }}>{person.group}</span>
          </div>
        )}
        {displayLoc && (
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 14, color: 'var(--outline)' }}>home_pin</span>
            <span className="text-body-sm" style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{displayLoc}</span>
          </div>
        )}
      </div>

      {/* Quick Action Buttons */}
      <div style={{ marginTop: '0.875rem', paddingTop: '0.75rem', borderTop: '1px solid var(--surface-container)', display: 'flex', gap: '0.5rem' }}>
        {/* If viewing in Donors or All mode */}
        {viewMode !== 'invitations' && isDonor && (
          <>
            {person.status === 'pending' && (
              <button className="btn" onClick={onMarkVisited} style={{ flex: 1, height: '2.5rem', fontSize: 13, background: 'var(--surface-container-high)', color: 'var(--on-surface)', borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--on-tertiary-container)' }}>directions_walk</span>
                Visited
              </button>
            )}
            {(person.status === 'pending' || person.status === 'visited') && (
              <button className="btn btn-success" onClick={onMarkCollected} style={{ flex: 2, height: '2.5rem', fontSize: 13, borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>volunteer_activism</span>
                Mark Collected
              </button>
            )}
            {person.status === 'collected' && (
              <button className="btn btn-secondary" onClick={onOpenStatus} style={{ flex: 1, height: '2.5rem', fontSize: 13, borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>check_circle</span>
                Donation Received
              </button>
            )}
          </>
        )}

        {/* If viewing in Invitations mode */}
        {viewMode === 'invitations' && (
          <>
            {(person.inviterStatus === 'not_invited' || !person.inviterStatus) && (
              <button className="btn btn-primary" onClick={onMarkInvited} style={{ flex: 1, height: '2.5rem', fontSize: 13, borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>mail</span>
                Mark Invited
              </button>
            )}
            {person.inviterStatus === 'invited' && (
              <button className="btn btn-success" onClick={onMarkConfirmed} style={{ flex: 1, height: '2.5rem', fontSize: 13, borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>how_to_reg</span>
                Confirm Attending
              </button>
            )}
            {person.inviterStatus === 'confirmed' && (
              <button className="btn btn-secondary" onClick={onOpenStatus} style={{ flex: 1, height: '2.5rem', fontSize: 13, borderRadius: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 16 }}>verified</span>
                Confirmed Guest
              </button>
            )}
          </>
        )}

        {/* Edit Button */}
        <button
          onClick={onEdit}
          style={{ height: '2.5rem', padding: '0 0.75rem', borderRadius: '0.5rem', border: 'none', background: 'var(--surface-container-low)', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4, color: 'var(--on-surface-variant)' }}
          className="text-label-sm"
          title="Edit Details"
        >
          <span className="material-symbols-outlined" style={{ fontSize: 16 }}>edit</span>
        </button>
      </div>
    </div>
  );
}

// ── Main PeoplePage ─────────────────────────────────────────────
export default function PeoplePage() {
  const {
    people,
    groups: teamGroups,
    peopleLoading,
    addPerson,
    updatePerson,
    deletePerson,
    updatePersonStatus,
    updatePersonInviterStatus,
  } = useTeam();
  const { showToast } = useToast();

  const [search, setSearch] = useState('');
  const [viewMode, setViewMode] = useState<'donors' | 'invitations' | 'all'>('donors');
  const [donationFilter, setDonationFilter] = useState<'all' | PersonStatus>('all');
  const [inviterFilter, setInviterFilter] = useState<'all' | InviterStatus>('all');
  const [locationFilter, setLocationFilter] = useState('all');
  const [groupFilter, setGroupFilter] = useState('all');

  const [showAddForm, setShowAddForm] = useState(false);
  const [editPerson, setEditPerson] = useState<Person | null>(null);
  const [statusPerson, setStatusPerson] = useState<Person | null>(null);
  const [showLocationDrawer, setShowLocationDrawer] = useState(false);
  const [showGroupDrawer, setShowGroupDrawer] = useState(false);

  // Distinct locations for filter
  const locations = useMemo(() => Array.from(new Set(
    people.map((p) => normalizeLocationForDisplay(p.location)).filter(Boolean)
  )).sort(), [people]);

  // Distinct groups for filter (merging formal team groups + existing assignments)
  const groups = useMemo(() => {
    const set = new Set<string>();
    teamGroups.forEach((g) => { if (g.name.trim()) set.add(g.name.trim()); });
    people.forEach((p) => { if (p.group?.trim()) set.add(p.group.trim()); });
    return Array.from(set).sort();
  }, [teamGroups, people]);

  // Filtered people
  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return people.filter((p) => {
      // 1. Role viewMode filtering
      // - Donors: only people where isPersonDonor(p) is true. Inviter-only do NOT appear.
      // - Invitations: all donors automatically appear in invitation list, plus inviter-only.
      // - All: all records.
      if (viewMode === 'donors' && !isPersonDonor(p)) return false;
      if (viewMode === 'invitations' && !isPersonInviter(p)) return false;

      // 2. Status filtering depending on active viewMode
      if (viewMode === 'donors') {
        if (donationFilter !== 'all' && p.status !== donationFilter) return false;
      } else if (viewMode === 'invitations') {
        const invStatus = p.inviterStatus || 'not_invited';
        if (inviterFilter !== 'all' && invStatus !== inviterFilter) return false;
      } else {
        if (donationFilter !== 'all' && p.status !== donationFilter) return false;
      }

      // 3. Location filtering
      const pLoc = normalizeLocationForDisplay(p.location);
      if (locationFilter === 'none' && pLoc !== '') return false;
      if (locationFilter !== 'all' && locationFilter !== 'none' && pLoc !== locationFilter) return false;

      // 4. Group filtering
      const pGrp = p.group?.trim() || '';
      if (groupFilter === 'none' && pGrp !== '') return false;
      if (groupFilter !== 'all' && groupFilter !== 'none' && pGrp !== groupFilter) return false;

      // 5. Search query
      if (q && !p.fullName.toLowerCase().includes(q) && !(p.phone || '').toLowerCase().includes(q)) {
        return false;
      }

      return true;
    });
  }, [people, search, viewMode, donationFilter, inviterFilter, locationFilter, groupFilter]);

  // Counts
  const donorCounts = useMemo(() => {
    const donors = people.filter(isPersonDonor);
    return {
      all: donors.length,
      pending: donors.filter((p) => p.status === 'pending').length,
      visited: donors.filter((p) => p.status === 'visited').length,
      collected: donors.filter((p) => p.status === 'collected').length,
    };
  }, [people]);

  const invitationCounts = useMemo(() => {
    const inviters = people.filter(isPersonInviter);
    return {
      all: inviters.length,
      not_invited: inviters.filter((p) => !p.inviterStatus || p.inviterStatus === 'not_invited').length,
      invited: inviters.filter((p) => p.inviterStatus === 'invited').length,
      confirmed: inviters.filter((p) => p.inviterStatus === 'confirmed').length,
    };
  }, [people]);

  const allCounts = useMemo(() => ({
    all: people.length,
    donors: people.filter(isPersonDonor).length,
    invitations: people.filter(isPersonInviter).length,
  }), [people]);

  // Handlers
  const handleAddPerson = useCallback(async (data: {
    fullName: string; phone?: string; location?: string; group?: string;
    status: PersonStatus; isDonor?: boolean; isInviter?: boolean; inviterStatus?: InviterStatus;
  }) => {
    try {
      await addPerson(data);
      showToast(`${data.fullName} added successfully`, 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to add person. Please try again.';
      showToast(msg, 'error');
      throw err;
    }
  }, [addPerson, showToast]);

  const handleUpdatePerson = useCallback(async (data: {
    fullName: string; phone?: string; location?: string; group?: string;
    status: PersonStatus; isDonor?: boolean; isInviter?: boolean; inviterStatus?: InviterStatus;
  }) => {
    if (!editPerson) return;
    try {
      await updatePerson(editPerson.id, data);
      showToast('Record updated', 'success');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Failed to update record. Please try again.';
      showToast(msg, 'error');
      throw err;
    }
  }, [editPerson, updatePerson, showToast]);

  const handleStatusUpdate = useCallback(async (status: PersonStatus) => {
    if (!statusPerson) return;
    await updatePersonStatus(statusPerson.id, status);
    const msg = status === 'collected'
      ? `Donation collected from ${statusPerson.fullName}!`
      : `${statusPerson.fullName} marked as ${status}`;
    showToast(msg, 'success');
  }, [statusPerson, updatePersonStatus, showToast]);

  const handleInviterStatusUpdate = useCallback(async (inviterStatus: InviterStatus) => {
    if (!statusPerson) return;
    await updatePersonInviterStatus(statusPerson.id, inviterStatus);
    showToast(`${statusPerson.fullName} marked as ${inviterStatus.replace('_', ' ')}`, 'success');
  }, [statusPerson, updatePersonInviterStatus, showToast]);

  const handleDelete = useCallback(async () => {
    if (!statusPerson) return;
    await deletePerson(statusPerson.id);
    showToast('Record deleted', 'info');
  }, [statusPerson, deletePerson, showToast]);

  return (
    <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
      
      {/* Search & Add Bar */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        <div style={{ position: 'relative', flex: 1 }}>
          <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 20, color: 'var(--on-surface-variant)' }}>search</span>
          <input
            className="form-input"
            style={{ paddingLeft: '2.5rem' }}
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search name or phone..."
            type="search"
          />
        </div>
        <button
          className="btn btn-primary"
          onClick={() => setShowAddForm(true)}
          style={{ height: '3rem', padding: '0 1rem', flexShrink: 0, borderRadius: '0.625rem', gap: 6 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 20 }}>person_add</span>
          <span>Add</span>
        </button>
      </div>

      {/* Primary Role Tabs */}
      <div className="tab-segmented-container">
        {[
          { key: 'donors' as const, label: 'Donors', icon: 'volunteer_activism', count: allCounts.donors },
          { key: 'invitations' as const, label: 'Invitations', icon: 'mail', count: allCounts.invitations },
          { key: 'all' as const, label: 'All Contacts', icon: 'groups', count: allCounts.all },
        ].map((tab) => {
          const active = viewMode === tab.key;
          return (
            <button
              key={tab.key}
              onClick={() => {
                setViewMode(tab.key);
                setDonationFilter('all');
                setInviterFilter('all');
              }}
              className={`tab-segmented-btn ${active ? 'active' : ''}`}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 16 }}>{tab.icon}</span>
              <span>{tab.label}</span>
              <span style={{
                fontSize: 11, padding: '1px 6px', borderRadius: 9999,
                background: active ? 'var(--secondary-container)' : 'var(--surface-container-high)',
                color: active ? 'var(--on-secondary-container)' : 'var(--on-surface-variant)',
                fontWeight: 700,
              }}>
                {tab.count}
              </span>
            </button>
          );
        })}
      </div>

      {/* Sub-status Filter Pills */}
      {viewMode === 'donors' && (
        <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { key: 'all' as const, label: 'All Donors', count: donorCounts.all },
            { key: 'pending' as const, label: 'Pending', count: donorCounts.pending, dot: 'var(--outline-variant)' },
            { key: 'visited' as const, label: 'Visited', count: donorCounts.visited, dot: 'var(--on-tertiary-container)' },
            { key: 'collected' as const, label: 'Collected', count: donorCounts.collected, dot: 'var(--secondary)' },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-pill ${donationFilter === f.key ? 'active' : ''}`}
              onClick={() => setDonationFilter(f.key)}
            >
              {f.dot && <span style={{ width: 8, height: 8, borderRadius: '50%', background: f.dot, flexShrink: 0 }} />}
              <span>{f.label}</span>
              <span className="pill-count">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {viewMode === 'invitations' && (
        <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { key: 'all' as const, label: 'All Guests', count: invitationCounts.all },
            { key: 'not_invited' as const, label: 'Not Invited', count: invitationCounts.not_invited },
            { key: 'invited' as const, label: 'Invited', count: invitationCounts.invited },
            { key: 'confirmed' as const, label: 'Confirmed', count: invitationCounts.confirmed },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-pill ${inviterFilter === f.key ? 'active' : ''}`}
              onClick={() => setInviterFilter(f.key)}
            >
              <span>{f.label}</span>
              <span className="pill-count">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {viewMode === 'all' && (
        <div style={{ display: 'flex', gap: '0.375rem', overflowX: 'auto', paddingBottom: 2 }}>
          {[
            { key: 'all' as const, label: 'All Contacts', count: people.length },
            { key: 'pending' as const, label: 'Pending', count: donorCounts.pending },
            { key: 'visited' as const, label: 'Visited', count: donorCounts.visited },
            { key: 'collected' as const, label: 'Collected', count: donorCounts.collected },
          ].map((f) => (
            <button
              key={f.key}
              className={`filter-pill ${donationFilter === f.key ? 'active' : ''}`}
              onClick={() => setDonationFilter(f.key)}
            >
              <span>{f.label}</span>
              <span className="pill-count">{f.count}</span>
            </button>
          ))}
        </div>
      )}

      {/* Location & Group Filter Bars */}
      <div style={{ display: 'flex', gap: '0.5rem' }}>
        {/* Group Filter Button */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-container-lowest)', padding: '0.5rem 0.75rem',
          borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--primary)' }}>workspaces</span>
            <span className="text-label-sm" style={{ color: 'var(--on-surface)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {groupFilter === 'all' ? 'All Groups' : groupFilter === 'none' ? 'No Group' : groupFilter}
            </span>
          </div>
          <button
            onClick={() => setShowGroupDrawer(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', padding: '0.25rem' }}
            title="Filter by Group"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
          </button>
        </div>

        {/* Location Filter Button */}
        <div style={{
          flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: 'var(--surface-container-lowest)', padding: '0.5rem 0.75rem',
          borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', minWidth: 0 }}>
            <span className="material-symbols-outlined" style={{ fontSize: 16, color: 'var(--secondary)' }}>location_on</span>
            <span className="text-label-sm" style={{ color: 'var(--on-surface)', fontWeight: 600, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {locationFilter === 'all' ? 'All Locations' : locationFilter === 'none' ? 'No Location' : locationFilter}
            </span>
          </div>
          <button
            onClick={() => setShowLocationDrawer(true)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--on-surface-variant)', padding: '0.25rem' }}
            title="Filter by Location"
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>tune</span>
          </button>
        </div>
      </div>

      {/* People List */}
      {peopleLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : filtered.length === 0 ? (
        <div style={{
          display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
          padding: '2.5rem 1rem', background: 'var(--surface-container-lowest)',
          borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
        }}>
          <div style={{ width: 52, height: 52, borderRadius: '50%', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.875rem' }}>
            <span className="material-symbols-outlined" style={{ fontSize: 26, color: 'var(--outline)' }}>person_search</span>
          </div>
          <h4 className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>
            {people.length === 0 ? 'No contacts yet' : 'No contacts match this filter'}
          </h4>
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem', maxWidth: '20rem' }}>
            {people.length === 0
              ? 'Add your first contact to get started with the campaign.'
              : 'Try clearing search or filters to see all contacts.'}
          </p>
          {people.length > 0 ? (
            <button
              className="btn btn-secondary"
              style={{ marginTop: '1rem', height: '2.5rem', padding: '0 1rem' }}
              onClick={() => {
                setSearch('');
                setDonationFilter('all');
                setInviterFilter('all');
                setLocationFilter('all');
                setGroupFilter('all');
              }}
            >
              Reset Filters
            </button>
          ) : (
            <button
              className="btn btn-primary"
              style={{ marginTop: '1rem', height: '2.5rem', padding: '0 1rem' }}
              onClick={() => setShowAddForm(true)}
            >
              <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
              Add Contact
            </button>
          )}
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
          {filtered.map((person) => (
            <ContactCard
              key={person.id}
              person={person}
              viewMode={viewMode}
              onEdit={() => setEditPerson(person)}
              onOpenStatus={() => setStatusPerson(person)}
              onMarkVisited={async () => {
                await updatePersonStatus(person.id, 'visited');
                showToast(`${person.fullName} marked as Visited`, 'success');
              }}
              onMarkCollected={async () => {
                await updatePersonStatus(person.id, 'collected');
                showToast(`Donation collected from ${person.fullName}!`, 'success');
              }}
              onMarkInvited={async () => {
                await updatePersonInviterStatus(person.id, 'invited');
                showToast(`${person.fullName} marked as Invited`, 'success');
              }}
              onMarkConfirmed={async () => {
                await updatePersonInviterStatus(person.id, 'confirmed');
                showToast(`${person.fullName} confirmed attendance!`, 'success');
              }}
            />
          ))}
        </div>
      )}

      {/* Add / Edit Form Modal */}
      {showAddForm && (
        <PersonForm
          locations={locations}
          groups={groups}
          allPeople={people}
          onSave={handleAddPerson}
          onClose={() => setShowAddForm(false)}
          onEditExisting={(p) => {
            setShowAddForm(false);
            setEditPerson(p);
          }}
        />
      )}

      {editPerson && (
        <PersonForm
          initial={editPerson}
          locations={locations}
          groups={groups}
          allPeople={people}
          onSave={handleUpdatePerson}
          onClose={() => setEditPerson(null)}
        />
      )}

      {/* Quick Status Drawer */}
      {statusPerson && (
        <StatusDrawer
          person={statusPerson}
          onApplyStatus={handleStatusUpdate}
          onApplyInviterStatus={handleInviterStatusUpdate}
          onClose={() => setStatusPerson(null)}
          onDelete={handleDelete}
        />
      )}

      {/* Location Filter Drawer */}
      {showLocationDrawer && (
        <>
          <div className="scrim" onClick={() => setShowLocationDrawer(false)} />
          <div className="bottom-sheet">
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
            <h3 className="text-headline-sm" style={{ color: 'var(--on-surface)', marginBottom: '0.75rem' }}>Filter by Location</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
              <button
                onClick={() => { setLocationFilter('all'); setShowLocationDrawer(false); }}
                className={`drawer-list-btn ${locationFilter === 'all' ? 'active' : ''}`}
              >
                <span>All Locations</span>
                {locationFilter === 'all' && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>check</span>}
              </button>

              <button
                onClick={() => { setLocationFilter('none'); setShowLocationDrawer(false); }}
                className={`drawer-list-btn ${locationFilter === 'none' ? 'active' : ''}`}
              >
                <span>No Location Assigned</span>
                {locationFilter === 'none' && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>check</span>}
              </button>

              {locations.map((loc) => (
                <button
                  key={loc}
                  onClick={() => { setLocationFilter(loc); setShowLocationDrawer(false); }}
                  className={`drawer-list-btn ${locationFilter === loc ? 'active' : ''}`}
                >
                  <span>{loc}</span>
                  {locationFilter === loc && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>check</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}

      {/* Group Filter Drawer */}
      {showGroupDrawer && (
        <>
          <div className="scrim" onClick={() => setShowGroupDrawer(false)} />
          <div className="bottom-sheet">
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
            <h3 className="text-headline-sm" style={{ color: 'var(--on-surface)', marginBottom: '0.75rem' }}>Filter by Group</h3>
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', marginBottom: '0.875rem' }}>
              <button
                onClick={() => { setGroupFilter('all'); setShowGroupDrawer(false); }}
                className={`drawer-list-btn ${groupFilter === 'all' ? 'active' : ''}`}
              >
                <span>All Groups</span>
                {groupFilter === 'all' && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>check</span>}
              </button>

              <button
                onClick={() => { setGroupFilter('none'); setShowGroupDrawer(false); }}
                className={`drawer-list-btn ${groupFilter === 'none' ? 'active' : ''}`}
              >
                <span>No Group Assigned</span>
                {groupFilter === 'none' && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>check</span>}
              </button>

              {groups.map((g) => (
                <button
                  key={g}
                  onClick={() => { setGroupFilter(g); setShowGroupDrawer(false); }}
                  className={`drawer-list-btn ${groupFilter === g ? 'active' : ''}`}
                >
                  <span>{g}</span>
                  {groupFilter === g && <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--accent-blue)' }}>check</span>}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
