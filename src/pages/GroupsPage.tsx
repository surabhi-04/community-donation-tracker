import { useState, useMemo } from 'react';
import type { AppPage } from '../App';
import { useTeam } from '../contexts/TeamContext';
import { useToast } from '../contexts/ToastContext';
import type { Group, Person, PersonStatus, InviterStatus } from '../types';
import { isPersonDonor, isPersonInviter, normalizeLocationForDisplay } from '../types';
import { PersonForm } from './PeoplePage';

interface GroupsPageProps {
  onNavigate?: (page: AppPage) => void;
}

export default function GroupsPage(_props: GroupsPageProps) {
  const {
    team,
    people,
    groups,
    groupsLoading,
    peopleLoading,
    createGroup,
    renameGroup,
    deleteGroup,
    assignPersonToGroup,
    reconcileGroups,
    addPerson,
    updatePersonStatus,
  } = useTeam();
  const { showToast } = useToast();

  // Navigation & Detail state
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);

  // Modals state
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [groupNameInput, setGroupNameInput] = useState('');
  const [groupDescInput, setGroupDescInput] = useState('');
  const [createError, setCreateError] = useState('');
  const [creating, setCreating] = useState(false);

  // Rename modal
  const [editingGroup, setEditingGroup] = useState<Group | null>(null);
  const [renameInput, setRenameInput] = useState('');
  const [renameError, setRenameError] = useState('');
  const [renaming, setRenaming] = useState(false);

  // Delete modal
  const [deletingGroup, setDeletingGroup] = useState<Group | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Add person in group modal
  const [showAddPerson, setShowAddPerson] = useState(false);

  // Assign existing person drawer
  const [showAssignDrawer, setShowAssignDrawer] = useState(false);
  const [assignSearch, setAssignSearch] = useState('');
  const [assigningId, setAssigningId] = useState<string | null>(null);

  // Detail view search & filter
  const [detailSearch, setDetailSearch] = useState('');
  const [detailFilter, setDetailFilter] = useState<'all' | 'donors' | 'invitations'>('all');

  // Reconciling state
  const [reconciling, setReconciling] = useState(false);

  // Currently selected group
  const selectedGroup = useMemo(() => {
    if (!selectedGroupId) return null;
    return groups.find((g) => g.id === selectedGroupId) || null;
  }, [groups, selectedGroupId]);

  // People in currently selected group
  const groupPeople = useMemo(() => {
    if (!selectedGroup) return [];
    const targetName = selectedGroup.name.trim().toLowerCase();
    return people.filter((p) => p.group?.trim().toLowerCase() === targetName);
  }, [selectedGroup, people]);

  // Filtered people within detail view
  const filteredGroupPeople = useMemo(() => {
    const q = detailSearch.trim().toLowerCase();
    return groupPeople.filter((p) => {
      if (detailFilter === 'donors' && !isPersonDonor(p)) return false;
      if (detailFilter === 'invitations' && !isPersonInviter(p)) return false;
      if (q) {
        const matchName = p.fullName.toLowerCase().includes(q);
        const matchPhone = (p.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
  }, [groupPeople, detailSearch, detailFilter]);

  // Group metrics map
  const groupStatsMap = useMemo(() => {
    const map = new Map<string, {
      total: number;
      donors: number;
      invitations: number;
      collected: number;
      visited: number;
      pending: number;
    }>();

    groups.forEach((g) => {
      map.set(g.name.trim().toLowerCase(), {
        total: 0,
        donors: 0,
        invitations: 0,
        collected: 0,
        visited: 0,
        pending: 0,
      });
    });

    people.forEach((p) => {
      const gName = p.group?.trim().toLowerCase();
      if (!gName || !map.has(gName)) return;
      const s = map.get(gName)!;
      s.total++;
      if (isPersonDonor(p)) {
        s.donors++;
        if (p.status === 'collected') s.collected++;
        else if (p.status === 'visited') s.visited++;
        else s.pending++;
      }
      if (isPersonInviter(p)) {
        s.invitations++;
      }
    });

    return map;
  }, [groups, people]);

  // Check for orphaned / legacy groups in contacts
  const legacyGroups = useMemo(() => {
    return groups.filter((g) => g.id.startsWith('legacy-'));
  }, [groups]);

  // Candidate existing people for "Assign Existing"
  const assignablePeople = useMemo(() => {
    if (!selectedGroup) return [];
    const currentName = selectedGroup.name.trim().toLowerCase();
    const q = assignSearch.trim().toLowerCase();
    return people.filter((p) => {
      // Exclude people already in this group
      if (p.group?.trim().toLowerCase() === currentName) return false;
      if (q) {
        const matchName = p.fullName.toLowerCase().includes(q);
        const matchPhone = (p.phone || '').toLowerCase().includes(q);
        if (!matchName && !matchPhone) return false;
      }
      return true;
    });
  }, [selectedGroup, people, assignSearch]);

  // Distinct locations for PersonForm
  const locations = useMemo(() => Array.from(new Set(
    people.map((p) => normalizeLocationForDisplay(p.location)).filter(Boolean)
  )).sort(), [people]);

  // Distinct group names for PersonForm
  const groupNames = useMemo(() => {
    return groups.map((g) => g.name);
  }, [groups]);

  // ── Actions ───────────────────────────────────────────────────────
  const handleOpenCreate = () => {
    setGroupNameInput('');
    setGroupDescInput('');
    setCreateError('');
    setShowCreateModal(true);
  };

  const handleCreateSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const trimmed = groupNameInput.trim();
    if (!trimmed) {
      setCreateError('Group name is required');
      return;
    }
    const exists = groups.some((g) => g.name.trim().toLowerCase() === trimmed.toLowerCase());
    if (exists) {
      setCreateError(`A group named "${trimmed}" already exists in this team.`);
      return;
    }

    setCreating(true);
    setCreateError('');
    try {
      const newId = await createGroup(trimmed, groupDescInput);
      showToast(`Group "${trimmed}" created!`, 'success');
      setShowCreateModal(false);
      setSelectedGroupId(newId);
    } catch (err: any) {
      setCreateError(err?.message || 'Failed to create group');
    } finally {
      setCreating(false);
    }
  };

  const handleOpenRename = (g: Group, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setEditingGroup(g);
    setRenameInput(g.name);
    setRenameError('');
  };

  const handleRenameSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingGroup) return;
    const trimmed = renameInput.trim();
    if (!trimmed) {
      setRenameError('Group name is required');
      return;
    }
    const duplicate = groups.some(
      (g) => g.id !== editingGroup.id && g.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (duplicate) {
      setRenameError(`Another group named "${trimmed}" already exists.`);
      return;
    }

    setRenaming(true);
    setRenameError('');
    try {
      await renameGroup(editingGroup.id, trimmed);
      showToast('Group renamed successfully', 'success');
      setEditingGroup(null);
    } catch (err: any) {
      setRenameError(err?.message || 'Failed to rename group');
    } finally {
      setRenaming(false);
    }
  };

  const handleOpenDelete = (g: Group, e?: React.MouseEvent) => {
    e?.stopPropagation();
    setDeletingGroup(g);
  };

  const handleDeleteConfirm = async () => {
    if (!deletingGroup) return;
    setDeleting(true);
    try {
      await deleteGroup(deletingGroup.id);
      showToast(`Group "${deletingGroup.name}" deleted. Contacts remain unassigned.`, 'info');
      if (selectedGroupId === deletingGroup.id) {
        setSelectedGroupId(null);
      }
      setDeletingGroup(null);
    } catch (err: any) {
      showToast(err?.message || 'Failed to delete group', 'error');
    } finally {
      setDeleting(false);
    }
  };

  const handleAssignPerson = async (person: Person) => {
    if (!selectedGroup) return;
    setAssigningId(person.id);
    try {
      await assignPersonToGroup(person.id, selectedGroup.name);
      showToast(`${person.fullName} assigned to ${selectedGroup.name}`, 'success');
    } catch (err: any) {
      showToast(err?.message || 'Failed to assign person', 'error');
    } finally {
      setAssigningId(null);
    }
  };

  const handleRemovePersonFromGroup = async (person: Person) => {
    try {
      await assignPersonToGroup(person.id, null);
      showToast(`${person.fullName} removed from ${selectedGroup?.name || 'group'}`, 'info');
    } catch (err: any) {
      showToast(err?.message || 'Failed to remove person from group', 'error');
    }
  };

  const handleReconcile = async () => {
    setReconciling(true);
    try {
      const count = await reconcileGroups();
      showToast(`Successfully synced ${count} group(s)!`, 'success');
    } catch {
      showToast('Group synchronization completed', 'info');
    } finally {
      setReconciling(false);
    }
  };

  const handleAddPersonToGroup = async (data: {
    fullName: string;
    phone?: string;
    location?: string;
    group?: string;
    status: PersonStatus;
    isDonor?: boolean;
    isInviter?: boolean;
    inviterStatus?: InviterStatus;
  }) => {
    try {
      await addPerson({
        ...data,
        group: selectedGroup?.name || data.group,
      });
      showToast(`${data.fullName} added to ${selectedGroup?.name || 'group'}!`, 'success');
      setShowAddPerson(false);
    } catch (err: any) {
      showToast(err?.message || 'Failed to add contact', 'error');
      throw err;
    }
  };

  // ─────────────────────────────────────────────────────────────────
  // VIEW: GROUP DETAIL VIEW
  // ─────────────────────────────────────────────────────────────────
  if (selectedGroup) {
    const stats = groupStatsMap.get(selectedGroup.name.trim().toLowerCase()) || {
      total: groupPeople.length,
      donors: groupPeople.filter(isPersonDonor).length,
      invitations: groupPeople.filter(isPersonInviter).length,
      collected: groupPeople.filter((p) => isPersonDonor(p) && p.status === 'collected').length,
      visited: groupPeople.filter((p) => isPersonDonor(p) && p.status === 'visited').length,
      pending: groupPeople.filter((p) => isPersonDonor(p) && p.status === 'pending').length,
    };
    const collectionPct = stats.donors > 0 ? Math.round((stats.collected / stats.donors) * 100) : 0;

    return (
      <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
        {/* Navigation & Header */}
        <div>
          <button
            onClick={() => setSelectedGroupId(null)}
            className="btn btn-secondary"
            style={{
              height: '2rem',
              padding: '0 0.75rem',
              fontSize: 12,
              marginBottom: '0.625rem',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 4,
            }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 16 }}>arrow_back</span>
            <span>All Groups</span>
          </button>

          <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
            <div style={{ minWidth: 0, flex: 1 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap' }}>
                <h1 className="text-headline-lg-m" style={{ color: 'var(--on-surface)', letterSpacing: '-0.01em', wordBreak: 'break-word' }}>
                  {selectedGroup.name}
                </h1>
                {selectedGroup.id.startsWith('legacy-') && (
                  <span style={{
                    fontSize: 11, padding: '2px 8px', borderRadius: 9999,
                    background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                    color: 'var(--warning-text)', fontWeight: 600,
                  }}>
                    Imported
                  </span>
                )}
              </div>
              <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: 2 }}>
                {stats.total} total contact{stats.total !== 1 ? 's' : ''} · {stats.donors} donor{stats.donors !== 1 ? 's' : ''}
                {selectedGroup.description ? ` · ${selectedGroup.description}` : ''}
              </p>
            </div>

            {/* Quick Actions for Group */}
            <div style={{ display: 'flex', gap: '0.375rem', flexShrink: 0 }}>
              <button
                onClick={(e) => handleOpenRename(selectedGroup, e)}
                className="btn btn-secondary"
                style={{ height: '2.25rem', width: '2.25rem', padding: 0 }}
                title="Rename Group"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
              </button>
              <button
                onClick={(e) => handleOpenDelete(selectedGroup, e)}
                className="btn btn-secondary"
                style={{ height: '2.25rem', width: '2.25rem', padding: 0, color: 'var(--error)' }}
                title="Delete Group"
              >
                <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_outline</span>
              </button>
            </div>
          </div>
        </div>

        {/* Group Progress KPI Card */}
        <div style={{ background: 'var(--surface-container-low)', borderRadius: '0.75rem', padding: '1rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.625rem' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
              <div style={{ width: 32, height: 32, borderRadius: '0.5rem', background: 'var(--surface-container-highest)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--primary)' }}>workspaces</span>
              </div>
              <div>
                <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em', display: 'block' }}>Group Progress</span>
                <span className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>{stats.total} Assigned</span>
              </div>
            </div>
            <div style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '0.25rem 0.625rem', borderRadius: 9999,
              background: 'var(--secondary-container)', color: 'var(--on-secondary-container)',
            }}>
              <span className="material-symbols-outlined" style={{ fontSize: 14 }}>trending_up</span>
              <span className="text-label-sm" style={{ fontWeight: 700 }}>{collectionPct}%</span>
            </div>
          </div>

          <div style={{ height: '0.5rem', background: 'var(--surface-container-highest)', borderRadius: 9999, overflow: 'hidden', display: 'flex', marginBottom: '0.75rem' }}>
            <div style={{ background: 'var(--secondary)', width: `${stats.donors > 0 ? (stats.collected / stats.donors) * 100 : 0}%`, transition: 'width 0.5s' }} />
            <div style={{ background: 'var(--surface-tint)', width: `${stats.donors > 0 ? (stats.visited / stats.donors) * 100 : 0}%`, transition: 'width 0.5s' }} />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '0.375rem', textAlign: 'center' }}>
            <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.5rem', padding: '0.375rem 0.25rem' }}>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block', fontSize: 11 }}>Pending</span>
              <span className="text-label-md" style={{ fontWeight: 700, color: 'var(--on-surface)' }}>{stats.pending}</span>
            </div>
            <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.5rem', padding: '0.375rem 0.25rem' }}>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block', fontSize: 11 }}>Visited</span>
              <span className="text-label-md" style={{ fontWeight: 700, color: 'var(--on-surface)' }}>{stats.visited}</span>
            </div>
            <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.5rem', padding: '0.375rem 0.25rem' }}>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block', fontSize: 11 }}>Collected</span>
              <span className="text-label-md" style={{ fontWeight: 700, color: 'var(--secondary)' }}>{stats.collected}</span>
            </div>
            <div style={{ background: 'var(--surface-container-lowest)', borderRadius: '0.5rem', padding: '0.375rem 0.25rem' }}>
              <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', display: 'block', fontSize: 11 }}>Invitations</span>
              <span className="text-label-md" style={{ fontWeight: 700, color: 'var(--primary)' }}>{stats.invitations}</span>
            </div>
          </div>
        </div>

        {/* Action Row: Add Person + Assign Existing */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem' }}>
          <button
            onClick={() => setShowAddPerson(true)}
            className="btn btn-primary"
            style={{ height: '2.5rem', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>person_add</span>
            <span>Add New Person</span>
          </button>
          <button
            onClick={() => setShowAssignDrawer(true)}
            className="btn btn-secondary"
            style={{ height: '2.5rem', fontSize: 13, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 18 }}>assignment_ind</span>
            <span>Assign Existing</span>
          </button>
        </div>

        {/* Filter & Search Bar */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ position: 'relative' }}>
            <span className="material-symbols-outlined" style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', fontSize: 18, color: 'var(--on-surface-variant)' }}>
              search
            </span>
            <input
              type="text"
              className="form-input"
              style={{ paddingLeft: '2.25rem', height: '2.5rem', fontSize: 13 }}
              placeholder={`Search in ${selectedGroup.name}...`}
              value={detailSearch}
              onChange={(e) => setDetailSearch(e.target.value)}
            />
          </div>

          <div style={{ display: 'flex', gap: '0.375rem' }}>
            {(['all', 'donors', 'invitations'] as const).map((mode) => (
              <button
                key={mode}
                onClick={() => setDetailFilter(mode)}
                className={`filter-pill ${detailFilter === mode ? 'active' : ''}`}
                style={{ fontSize: 12, height: '2rem', padding: '0 0.75rem', textTransform: 'capitalize' }}
              >
                {mode === 'all' ? `All (${groupPeople.length})` : mode === 'donors' ? `Donors (${stats.donors})` : `Invitations (${stats.invitations})`}
              </button>
            ))}
          </div>
        </div>

        {/* Group People List */}
        {peopleLoading ? (
          <div style={{ display: 'flex', justifyContent: 'center', padding: '2.5rem' }}>
            <div className="spinner" />
          </div>
        ) : filteredGroupPeople.length === 0 ? (
          <div style={{
            display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center',
            padding: '2.5rem 1rem', background: 'var(--surface-container-lowest)',
            borderRadius: '0.75rem', boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          }}>
            <div style={{ width: 48, height: 48, borderRadius: '50%', background: 'var(--surface-container)', display: 'flex', alignItems: 'center', justifyContent: 'center', marginBottom: '0.75rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24, color: 'var(--outline)' }}>
                {groupPeople.length === 0 ? 'group_off' : 'search_off'}
              </span>
            </div>
            <h4 className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>
              {groupPeople.length === 0 ? 'No contacts in this group yet' : 'No contacts match search'}
            </h4>
            <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginTop: '0.25rem', maxWidth: '20rem' }}>
              {groupPeople.length === 0
                ? 'Add a new contact directly to this group, or assign existing contacts from your team.'
                : 'Try clearing your search query or role filter.'}
            </p>
            {groupPeople.length === 0 ? (
              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '1rem' }}>
                <button
                  className="btn btn-primary"
                  onClick={() => setShowAddPerson(true)}
                  style={{ height: '2.25rem', padding: '0 0.875rem', fontSize: 12 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>person_add</span>
                  <span>Add Person</span>
                </button>
                <button
                  className="btn btn-secondary"
                  onClick={() => setShowAssignDrawer(true)}
                  style={{ height: '2.25rem', padding: '0 0.875rem', fontSize: 12 }}
                >
                  <span className="material-symbols-outlined" style={{ fontSize: 16 }}>assignment_ind</span>
                  <span>Assign Existing</span>
                </button>
              </div>
            ) : (
              <button
                className="btn btn-secondary"
                onClick={() => { setDetailSearch(''); setDetailFilter('all'); }}
                style={{ marginTop: '0.875rem', height: '2.25rem', padding: '0 1rem', fontSize: 12 }}
              >
                Reset Search
              </button>
            )}
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
            {filteredGroupPeople.map((person) => {
              const loc = normalizeLocationForDisplay(person.location);
              const isDonor = isPersonDonor(person);
              const isInviter = isPersonInviter(person);

              return (
                <div
                  key={person.id}
                  style={{
                    background: 'var(--surface-container-lowest)',
                    borderRadius: '0.75rem',
                    padding: '0.875rem',
                    boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '0.5rem',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 15 }}>{person.fullName}</span>
                        {isDonor && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'var(--secondary-container)', color: 'var(--on-secondary-container)', fontWeight: 600,
                          }}>
                            Donor
                          </span>
                        )}
                        {isInviter && !isDonor && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'var(--primary-container)', color: 'var(--on-primary-container)', fontWeight: 600,
                          }}>
                            Inviter
                          </span>
                        )}
                      </div>
                      <div style={{ fontSize: 12, color: 'var(--on-surface-variant)', marginTop: 3 }}>
                        {person.phone ? `📞 ${person.phone}` : 'No phone'}
                        {loc ? ` · 📍 ${loc}` : ''}
                      </div>
                    </div>

                    <button
                      onClick={() => handleRemovePersonFromGroup(person)}
                      className="btn btn-secondary"
                      style={{ height: '1.875rem', padding: '0 0.5rem', fontSize: 11, flexShrink: 0, color: 'var(--on-surface-variant)' }}
                      title="Remove from this group"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 14 }}>close</span>
                      <span>Unassign</span>
                    </button>
                  </div>

                  {/* Status chips and quick toggles */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', paddingTop: '0.375rem', borderTop: '1px solid var(--surface-container)' }}>
                    <div style={{ display: 'flex', gap: '0.375rem', alignItems: 'center' }}>
                      {isDonor && (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 9999, fontWeight: 600,
                          background: person.status === 'collected' ? 'var(--secondary-container)' : person.status === 'visited' ? 'var(--primary-container)' : 'var(--surface-container-high)',
                          color: person.status === 'collected' ? 'var(--on-secondary-container)' : person.status === 'visited' ? 'var(--on-primary-container)' : 'var(--on-surface)',
                        }}>
                          Donation: {person.status}
                        </span>
                      )}
                      {isInviter && (
                        <span style={{
                          fontSize: 11, padding: '2px 8px', borderRadius: 9999, fontWeight: 600,
                          background: person.inviterStatus === 'confirmed' ? 'var(--secondary-container)' : person.inviterStatus === 'invited' ? 'var(--primary-container)' : 'var(--surface-container-high)',
                          color: person.inviterStatus === 'confirmed' ? 'var(--on-secondary-container)' : person.inviterStatus === 'invited' ? 'var(--on-primary-container)' : 'var(--on-surface)',
                        }}>
                          Invited: {person.inviterStatus || 'not_invited'}
                        </span>
                      )}
                    </div>

                    {/* Quick status button */}
                    {isDonor && person.status !== 'collected' && (
                      <button
                        onClick={async () => {
                          const next = person.status === 'pending' ? 'visited' : 'collected';
                          await updatePersonStatus(person.id, next);
                          showToast(`${person.fullName} marked as ${next}`, 'success');
                        }}
                        style={{
                          background: 'none', border: 'none', cursor: 'pointer',
                          fontSize: 11, fontWeight: 700, color: 'var(--secondary)',
                          display: 'flex', alignItems: 'center', gap: 2,
                        }}
                      >
                        <span>Mark {person.status === 'pending' ? 'Visited' : 'Collected'}</span>
                        <span className="material-symbols-outlined" style={{ fontSize: 14 }}>arrow_forward</span>
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}

        {/* Add Person Modal (Preselected Group) */}
        {showAddPerson && (
          <PersonForm
            initial={{ group: selectedGroup.name }}
            locations={locations}
            groups={groupNames}
            allPeople={people}
            onSave={handleAddPersonToGroup}
            onClose={() => setShowAddPerson(false)}
          />
        )}

        {/* Assign Existing Person Drawer */}
        {showAssignDrawer && (
          <>
            <div className="scrim" onClick={() => setShowAssignDrawer(false)} />
            <div className="bottom-sheet" style={{ maxHeight: '85vh', overflowY: 'auto' }}>
              <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />

              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.75rem' }}>
                <div>
                  <h3 className="text-headline-sm" style={{ color: 'var(--on-surface)' }}>Assign Contacts to {selectedGroup.name}</h3>
                  <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
                    Add existing team contacts without creating duplicate records.
                  </p>
                </div>
                <button onClick={() => setShowAssignDrawer(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}>
                  <span className="material-symbols-outlined">close</span>
                </button>
              </div>

              {/* Search candidate contacts */}
              <div style={{ marginBottom: '0.75rem' }}>
                <input
                  type="text"
                  className="form-input"
                  placeholder="Search existing contacts by name or phone..."
                  value={assignSearch}
                  onChange={(e) => setAssignSearch(e.target.value)}
                  style={{ height: '2.5rem', fontSize: 13 }}
                  autoFocus
                />
              </div>

              {assignablePeople.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '2rem 1rem', color: 'var(--on-surface-variant)' }}>
                  <span className="material-symbols-outlined" style={{ fontSize: 32, color: 'var(--outline)', marginBottom: '0.5rem' }}>person_search</span>
                  <p className="text-body-sm">
                    {assignSearch ? 'No matching contacts found' : 'All team contacts are already in this group!'}
                  </p>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                  {assignablePeople.slice(0, 30).map((cand) => (
                    <div
                      key={cand.id}
                      style={{
                        padding: '0.625rem 0.75rem',
                        borderRadius: '0.5rem',
                        background: 'var(--surface-container-lowest)',
                        border: '1px solid var(--outline-variant)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'space-between',
                        gap: '0.5rem',
                      }}
                    >
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 600, color: 'var(--on-surface)', fontSize: 14 }}>{cand.fullName}</div>
                        <div style={{ fontSize: 11, color: 'var(--on-surface-variant)', marginTop: 2 }}>
                          {cand.phone ? `📞 ${cand.phone}` : 'No phone'}
                          {cand.group ? ` · Currently in ${cand.group}` : ' · No group assigned'}
                        </div>
                      </div>
                      <button
                        onClick={() => handleAssignPerson(cand)}
                        disabled={assigningId === cand.id}
                        className="btn btn-secondary"
                        style={{ height: '2rem', padding: '0 0.75rem', fontSize: 12, flexShrink: 0 }}
                      >
                        {assigningId === cand.id ? (
                          <span>Assigning...</span>
                        ) : (
                          <>
                            <span className="material-symbols-outlined" style={{ fontSize: 14 }}>add</span>
                            <span>Assign</span>
                          </>
                        )}
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </>
        )}

        {/* Rename Modal */}
        {editingGroup && (
          <>
            <div className="scrim" onClick={() => setEditingGroup(null)} />
            <div className="bottom-sheet">
              <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
              <h3 className="text-headline-sm" style={{ color: 'var(--on-surface)', marginBottom: '0.75rem' }}>Rename Group</h3>
              <form onSubmit={handleRenameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
                <div>
                  <label className="form-label">New Group Name *</label>
                  <input
                    type="text"
                    className="form-input"
                    value={renameInput}
                    onChange={(e) => setRenameInput(e.target.value)}
                    maxLength={80}
                    autoFocus
                  />
                  {renameError && <p className="form-error" style={{ marginTop: '0.25rem' }}>{renameError}</p>}
                </div>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  <button type="button" className="btn btn-secondary" onClick={() => setEditingGroup(null)} style={{ flex: 1 }}>
                    Cancel
                  </button>
                  <button type="submit" className="btn btn-primary" disabled={renaming} style={{ flex: 1 }}>
                    {renaming ? 'Saving...' : 'Save Name'}
                  </button>
                </div>
              </form>
            </div>
          </>
        )}

        {/* Delete Modal */}
        {deletingGroup && (
          <>
            <div className="scrim" onClick={() => setDeletingGroup(null)} />
            <div className="bottom-sheet">
              <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)', marginBottom: '0.5rem' }}>
                <span className="material-symbols-outlined" style={{ fontSize: 24 }}>warning</span>
                <h3 className="text-headline-sm" style={{ color: 'var(--error)' }}>Delete Group</h3>
              </div>
              <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>
                Are you sure you want to delete <strong>{deletingGroup.name}</strong>?
              </p>
              <div style={{
                background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: 'var(--warning-text)', fontSize: 13,
              }}>
                <strong>Safe delete:</strong> Contacts assigned to this group will <strong>NEVER</strong> be deleted. Their group assignment will simply be cleared to blank.
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setDeletingGroup(null)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button
                  type="button"
                  className="btn"
                  onClick={handleDeleteConfirm}
                  disabled={deleting}
                  style={{ flex: 2, background: 'var(--error)', color: '#ffffff' }}
                >
                  {deleting ? 'Deleting...' : 'Delete Group'}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    );
  }

  // ─────────────────────────────────────────────────────────────────
  // VIEW: GROUPS LANDING VIEW
  // ─────────────────────────────────────────────────────────────────
  return (
    <div style={{ padding: '0.75rem 1rem 1rem', display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
      {/* Landing Header */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '0.5rem' }}>
        <div>
          <h1 className="text-headline-lg-m" style={{ color: 'var(--on-surface)', letterSpacing: '-0.01em' }}>
            Groups &amp; Blocks
          </h1>
          <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)' }}>
            {groups.length} group{groups.length !== 1 ? 's' : ''} in {team?.name || 'team'}
          </p>
        </div>

        <button
          onClick={handleOpenCreate}
          className="btn btn-primary"
          style={{ height: '2.5rem', padding: '0 1rem', fontSize: 13, display: 'flex', alignItems: 'center', gap: 6, flexShrink: 0 }}
        >
          <span className="material-symbols-outlined" style={{ fontSize: 18 }}>add</span>
          <span>Create Group</span>
        </button>
      </div>

      {/* Legacy / Orphaned Group Reconciliation Banner */}
      {legacyGroups.length > 0 && (
        <div style={{
          background: 'var(--warning-bg)',
          border: '1px solid var(--warning-border)',
          borderRadius: '0.75rem',
          padding: '0.875rem 1rem',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: '0.75rem',
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, fontWeight: 700, color: 'var(--warning-text)', fontSize: 13 }}>
              <span className="material-symbols-outlined" style={{ fontSize: 18, color: 'var(--warning)' }}>sync</span>
              <span>Sync Existing Contact Groups</span>
            </div>
            <p style={{ fontSize: 12, color: 'var(--warning-text)', marginTop: 2 }}>
              Found {legacyGroups.length} group{legacyGroups.length !== 1 ? 's' : ''} in your contacts list without formal group records ({legacyGroups.map((g) => g.name).slice(0, 3).join(', ')}{legacyGroups.length > 3 ? '...' : ''}).
            </p>
          </div>
          <button
            onClick={handleReconcile}
            disabled={reconciling}
            className="btn btn-secondary"
            style={{ height: '2rem', padding: '0 0.75rem', fontSize: 12, flexShrink: 0, fontWeight: 700 }}
          >
            {reconciling ? 'Syncing...' : 'Sync Groups'}
          </button>
        </div>
      )}

      {/* Main Content: Empty State vs Cards */}
      {groupsLoading ? (
        <div style={{ display: 'flex', justifyContent: 'center', padding: '3rem' }}>
          <div className="spinner" />
        </div>
      ) : groups.length === 0 ? (
        /* PROPER EMPTY STATE:
           Requirement 1:
           "If the current team has no groups, show a proper empty state: 'No groups created yet',
           a short explanation, and a prominent 'Create Group' button.
           Do not show a people list or group filter as the main content when there are no groups." */
        <div style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          textAlign: 'center',
          padding: '3rem 1.5rem',
          background: 'var(--surface-container-lowest)',
          borderRadius: '0.75rem',
          boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
          marginTop: '0.5rem',
        }}>
          <div style={{
            width: 56,
            height: 56,
            borderRadius: '50%',
            background: 'var(--surface-container)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginBottom: '1rem',
          }}>
            <span className="material-symbols-outlined" style={{ fontSize: 28, color: 'var(--outline)' }}>workspaces</span>
          </div>

          <h3 className="text-headline-md" style={{ color: 'var(--on-surface)', marginBottom: '0.5rem' }}>
            No groups created yet
          </h3>

          <p className="text-body-md" style={{ color: 'var(--on-surface-variant)', maxWidth: '22rem', marginBottom: '1.5rem', lineHeight: '1.5' }}>
            Organize your community into groups such as Block A, Youth Wing, Friends, or Local Residents to track collection progress together.
          </p>

          <button
            onClick={handleOpenCreate}
            className="btn btn-primary"
            style={{ height: '2.75rem', padding: '0 1.5rem', fontSize: 14, display: 'flex', alignItems: 'center', gap: 6 }}
          >
            <span className="material-symbols-outlined" style={{ fontSize: 20 }}>add</span>
            <span>Create Group</span>
          </button>
        </div>
      ) : (
        /* Group Cards / Rows when groups exist */
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.625rem' }}>
          {groups.map((group) => {
            const stats = groupStatsMap.get(group.name.trim().toLowerCase()) || {
              total: 0, donors: 0, invitations: 0, collected: 0, visited: 0, pending: 0,
            };
            const collectionPct = stats.donors > 0 ? Math.round((stats.collected / stats.donors) * 100) : 0;

            return (
              <div
                key={group.id}
                onClick={() => setSelectedGroupId(group.id)}
                style={{
                  background: 'var(--surface-container-lowest)',
                  borderRadius: '0.75rem',
                  padding: '1rem',
                  boxShadow: '0 1px 3px rgba(0,0,0,0.06)',
                  cursor: 'pointer',
                  border: '1px solid transparent',
                  transition: 'border-color 0.15s, box-shadow 0.15s',
                  display: 'flex',
                  flexDirection: 'column',
                  gap: '0.625rem',
                }}
                onMouseEnter={(e) => (e.currentTarget.style.borderColor = 'var(--outline-variant)')}
                onMouseLeave={(e) => (e.currentTarget.style.borderColor = 'transparent')}
              >
                <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: '0.5rem' }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.625rem', minWidth: 0 }}>
                    <div style={{
                      width: 40, height: 40, borderRadius: '0.5rem',
                      background: 'var(--surface-container)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      flexShrink: 0,
                    }}>
                      <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--primary)' }}>workspaces</span>
                    </div>

                    <div style={{ minWidth: 0 }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', flexWrap: 'wrap' }}>
                        <span style={{ fontWeight: 700, color: 'var(--on-surface)', fontSize: 16 }}>{group.name}</span>
                        {group.id.startsWith('legacy-') && (
                          <span style={{
                            fontSize: 10, padding: '2px 6px', borderRadius: 4,
                            background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
                            color: 'var(--warning-text)', fontWeight: 600,
                          }}>
                            Imported
                          </span>
                        )}
                      </div>
                      <span style={{ fontSize: 12, color: 'var(--on-surface-variant)' }}>
                        {stats.total} contact{stats.total !== 1 ? 's' : ''} · {stats.donors} donor{stats.donors !== 1 ? 's' : ''}
                      </span>
                    </div>
                  </div>

                  {/* Actions & Chevron */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: '0.25rem', flexShrink: 0 }}>
                    <button
                      onClick={(e) => handleOpenRename(group, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', color: 'var(--on-surface-variant)', borderRadius: '50%' }}
                      title="Rename"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>edit</span>
                    </button>
                    <button
                      onClick={(e) => handleOpenDelete(group, e)}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.375rem', color: 'var(--on-surface-variant)', borderRadius: '50%' }}
                      title="Delete"
                    >
                      <span className="material-symbols-outlined" style={{ fontSize: 18 }}>delete_outline</span>
                    </button>
                    <span className="material-symbols-outlined" style={{ fontSize: 20, color: 'var(--outline)' }}>chevron_right</span>
                  </div>
                </div>

                {/* Progress Mini Bar */}
                {stats.donors > 0 && (
                  <div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, color: 'var(--on-surface-variant)', marginBottom: 4 }}>
                      <span>Collection Progress</span>
                      <span style={{ fontWeight: 700, color: 'var(--secondary)' }}>{stats.collected}/{stats.donors} ({collectionPct}%)</span>
                    </div>
                    <div className="progress-bar" style={{ height: '0.35rem' }}>
                      <div style={{ background: 'var(--secondary)', width: `${collectionPct}%`, borderRadius: 9999, transition: 'width 0.5s' }} />
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      )}

      {/* Create Group Modal */}
      {showCreateModal && (
        <>
          <div className="scrim" onClick={() => setShowCreateModal(false)} />
          <div className="bottom-sheet">
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />

            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '0.875rem' }}>
              <div>
                <span className="text-label-sm" style={{ color: 'var(--on-surface-variant)', textTransform: 'uppercase', letterSpacing: '0.06em' }}>
                  New Group
                </span>
                <h3 className="text-headline-md" style={{ color: 'var(--on-surface)' }}>
                  Create Group
                </h3>
              </div>
              <button onClick={() => setShowCreateModal(false)} style={{ background: 'none', border: 'none', cursor: 'pointer', padding: '0.25rem' }}>
                <span className="material-symbols-outlined">close</span>
              </button>
            </div>

            <form onSubmit={handleCreateSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label className="form-label" htmlFor="groupName">Group Name *</label>
                <input
                  id="groupName"
                  className="form-input"
                  placeholder="e.g. Block A, Friends, Youth Wing, Local Residents"
                  value={groupNameInput}
                  onChange={(e) => {
                    setGroupNameInput(e.target.value);
                    if (createError) setCreateError('');
                  }}
                  maxLength={80}
                  autoFocus
                  required
                />
                {createError && (
                  <p className="form-error" style={{ marginTop: '0.375rem', display: 'flex', alignItems: 'center', gap: 4 }}>
                    <span className="material-symbols-outlined" style={{ fontSize: 16 }}>error</span>
                    <span>{createError}</span>
                  </p>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="groupDesc">Description (optional)</label>
                <input
                  id="groupDesc"
                  className="form-input"
                  placeholder="e.g. Sector 4 residential volunteer unit"
                  value={groupDescInput}
                  onChange={(e) => setGroupDescInput(e.target.value)}
                  maxLength={120}
                />
              </div>

              <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setShowCreateModal(false)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={creating} style={{ flex: 2 }}>
                  {creating ? 'Creating...' : 'Create Group'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Rename Modal */}
      {editingGroup && (
        <>
          <div className="scrim" onClick={() => setEditingGroup(null)} />
          <div className="bottom-sheet">
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
            <h3 className="text-headline-sm" style={{ color: 'var(--on-surface)', marginBottom: '0.75rem' }}>Rename Group</h3>
            <form onSubmit={handleRenameSubmit} style={{ display: 'flex', flexDirection: 'column', gap: '0.875rem' }}>
              <div>
                <label className="form-label">New Group Name *</label>
                <input
                  type="text"
                  className="form-input"
                  value={renameInput}
                  onChange={(e) => {
                    setRenameInput(e.target.value);
                    if (renameError) setRenameError('');
                  }}
                  maxLength={80}
                  autoFocus
                />
                {renameError && <p className="form-error" style={{ marginTop: '0.25rem' }}>{renameError}</p>}
              </div>
              <div style={{ display: 'flex', gap: '0.5rem' }}>
                <button type="button" className="btn btn-secondary" onClick={() => setEditingGroup(null)} style={{ flex: 1 }}>
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary" disabled={renaming} style={{ flex: 1 }}>
                  {renaming ? 'Saving...' : 'Save Name'}
                </button>
              </div>
            </form>
          </div>
        </>
      )}

      {/* Delete Confirmation Modal */}
      {deletingGroup && (
        <>
          <div className="scrim" onClick={() => setDeletingGroup(null)} />
          <div className="bottom-sheet">
            <div style={{ width: 40, height: 4, borderRadius: 9999, background: 'var(--outline-variant)', margin: '0 auto 1rem' }} />
            <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', color: 'var(--error)', marginBottom: '0.5rem' }}>
              <span className="material-symbols-outlined" style={{ fontSize: 24 }}>warning</span>
              <h3 className="text-headline-sm" style={{ color: 'var(--error)' }}>Delete Group</h3>
            </div>
            <p className="text-body-sm" style={{ color: 'var(--on-surface-variant)', marginBottom: '0.75rem' }}>
              Are you sure you want to delete <strong>{deletingGroup.name}</strong>?
            </p>
            <div style={{
              background: 'var(--warning-bg)', border: '1px solid var(--warning-border)',
              borderRadius: '0.5rem', padding: '0.75rem', marginBottom: '1rem', color: 'var(--warning-text)', fontSize: 13,
            }}>
              <strong>Safe delete:</strong> Contacts assigned to this group will <strong>NEVER</strong> be deleted. Their group assignment will simply be cleared to blank.
            </div>
            <div style={{ display: 'flex', gap: '0.5rem' }}>
              <button type="button" className="btn btn-secondary" onClick={() => setDeletingGroup(null)} style={{ flex: 1 }}>
                Cancel
              </button>
              <button
                type="button"
                className="btn"
                onClick={handleDeleteConfirm}
                disabled={deleting}
                style={{ flex: 2, background: 'var(--error)', color: '#ffffff' }}
              >
                {deleting ? 'Deleting...' : 'Delete Group'}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
