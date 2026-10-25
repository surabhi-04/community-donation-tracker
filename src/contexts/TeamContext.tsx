import { createContext, useContext, useEffect, useState, useCallback, useRef, useMemo } from 'react';
import type { ReactNode } from 'react';
import {
  collection,
  collectionGroup,
  doc,
  onSnapshot,
  setDoc,
  serverTimestamp,
  query,
  orderBy,
  deleteDoc,
  updateDoc,
  getDoc,
  getDocs,
  where,
  Timestamp,
} from 'firebase/firestore';
import type { Team, TeamMember, Person, PersonStatus, InviterStatus, MemberRole, UserTeamInfo, Group, Contribution } from '../types';
import { normalizeLocationForStorage } from '../types';
import { db, firebaseConfigured } from '../firebase';
import { useAuth } from './AuthContext';

// ── Invite code generator ────────────────────────────────────────
// 48 bits of random hex (12 hex chars). Only called by createTeam —
// this is the single source of truth for generating the code.
function generateInviteCode(): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, '0'))
    .join('')
    .toUpperCase();
}

function getStoredGroups(tId: string): Group[] {
  try {
    const raw = localStorage.getItem(`cdt_groups_${tId}`);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function setStoredGroups(tId: string, grps: Group[]): void {
  try {
    localStorage.setItem(`cdt_groups_${tId}`, JSON.stringify(grps));
  } catch {
    // ignore
  }
}

interface TeamContextType {
  team: Team | null;
  members: TeamMember[];
  people: Person[];
  groups: Group[];
  loading: boolean;
  teamLoading: boolean;
  peopleLoading: boolean;
  groupsLoading: boolean;
  error: string | null;
  teamError: string | null;
  userTeamIds: string[];
  userTeams: UserTeamInfo[];
  activeTeamId: string | null;
  retryTeamRestore: () => void;
  switchTeam: (teamId: string) => Promise<void>;
  createTeam: (name: string, description?: string) => Promise<string>;
  joinTeam: (teamId: string, inviteCode: string) => Promise<void>;
  restoreTeamWithId: (teamId: string) => Promise<boolean>;
  leaveTeam: () => Promise<void>;
  addPerson: (data: Omit<Person, 'id' | 'createdByUid' | 'createdByName' | 'createdAt' | 'updatedAt'>) => Promise<void>;
  updatePerson: (id: string, data: Partial<Pick<Person, 'fullName' | 'phone' | 'location' | 'group' | 'status' | 'isDonor' | 'isInviter' | 'inviterStatus' | 'amount' | 'contributions'>>) => Promise<void>;
  deletePerson: (id: string) => Promise<void>;
  updatePersonStatus: (id: string, status: PersonStatus) => Promise<void>;
  updatePersonInviterStatus: (id: string, inviterStatus: InviterStatus) => Promise<void>;
  recordDonation: (personId: string, amount: number, note?: string) => Promise<void>;
  editDonationAmount: (personId: string, newAmount: number, note?: string) => Promise<void>;
  convertInviterToDonor: (personId: string, initialAmount?: number, note?: string) => Promise<void>;
  createGroup: (name: string, description?: string) => Promise<string>;
  renameGroup: (groupId: string, newName: string) => Promise<void>;
  deleteGroup: (groupId: string) => Promise<void>;
  assignPersonToGroup: (personId: string, groupName: string | null) => Promise<void>;
  reconcileGroups: () => Promise<number>;
}

const TeamContext = createContext<TeamContextType | null>(null);

export function TeamProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [team, setTeam] = useState<Team | null>(null);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [people, setPeople] = useState<Person[]>([]);
  const [firestoreGroups, setFirestoreGroups] = useState<Group[]>([]);
  const [loading, setLoading] = useState(false);
  const [teamLoading, setTeamLoading] = useState(true);
  const [peopleLoading, setPeopleLoading] = useState(false);
  const [groupsLoading, setGroupsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [teamError, setTeamError] = useState<string | null>(null);
  const [teamId, setTeamId] = useState<string | null>(null);
  const [userTeamIds, setUserTeamIds] = useState<string[]>([]);
  const [userTeams, setUserTeams] = useState<UserTeamInfo[]>([]);

  // Execution ID and UID tracker to cancel in-flight restores upon account switch or retry
  const restoreExecutionId = useRef(0);
  const restoringForUid = useRef<string | null>(null);
  const [retryCount, setRetryCount] = useState(0);

  // ── Restore team membership from Firestore on authentication ────
  // RULES CONFORMANCE:
  // - users/{uid} rule allows read/write for auth.uid == uid.
  // - Preserves any existing RepoRefine user fields by strictly using { merge: true }.
  // - Handles both owners and members across single or multiple teams.
  // - Never misinterprets network/lookup errors as an absence of team memberships.
  const resolveTeam = useCallback(async () => {
    if (!user || !db || !firebaseConfigured) {
      setTeamLoading(false);
      return;
    }

    const currentExecutionId = ++restoreExecutionId.current;
    const uid = user.uid;
    restoringForUid.current = uid;
    setTeamLoading(true);
    setTeamError(null);

    const isCurrent = () =>
      currentExecutionId === restoreExecutionId.current &&
      restoringForUid.current === uid;

    try {
      const firestore = db;
      if (!firestore) {
        if (isCurrent()) setTeamLoading(false);
        return;
      }

      const candidateTeamIds: string[] = [];
      let storedActiveTeamId: string | null = null;
      let userDocLookupFailed = false;

      // ── 1. Read user document on /users/{uid} ───────────────────
      const userDocRef = doc(firestore, 'users', uid);
      try {
        const userSnap = await getDoc(userDocRef);
        if (!isCurrent()) return;
        if (userSnap.exists()) {
          const userData = userSnap.data();
          if (Array.isArray(userData.teamIds)) {
            userData.teamIds.forEach((tid: unknown) => {
              if (typeof tid === 'string' && tid.trim() && !candidateTeamIds.includes(tid.trim())) {
                candidateTeamIds.push(tid.trim());
              }
            });
          } else if (typeof userData.teamIds === 'string' && userData.teamIds.trim()) {
            if (!candidateTeamIds.includes(userData.teamIds.trim())) {
              candidateTeamIds.push(userData.teamIds.trim());
            }
          }
          if (typeof userData.activeTeamId === 'string' && userData.activeTeamId.trim()) {
            storedActiveTeamId = userData.activeTeamId.trim();
          }

          // Legacy fields on user doc
          const legacyKeys = ['teamId', 'createdTeamId', 'joinedTeamId', 'currentTeamId'];
          for (const key of legacyKeys) {
            const val = userData[key];
            if (typeof val === 'string' && val.trim() && !candidateTeamIds.includes(val.trim())) {
              candidateTeamIds.push(val.trim());
            }
          }
          if (Array.isArray(userData.teams)) {
            userData.teams.forEach((t: unknown) => {
              if (typeof t === 'string' && t.trim() && !candidateTeamIds.includes(t.trim())) {
                candidateTeamIds.push(t.trim());
              }
            });
          } else if (userData.teams && typeof userData.teams === 'object') {
            Object.keys(userData.teams).forEach((k) => {
              if (k.trim() && !candidateTeamIds.includes(k.trim())) {
                candidateTeamIds.push(k.trim());
              }
            });
          }
        }
      } catch (err: unknown) {
        console.warn('Could not read user doc:', err);
        userDocLookupFailed = true;
      }

      if (!isCurrent()) return;

      // ── 2. User-scoped LocalStorage fallback ────────────────────
      const localTeamId = localStorage.getItem(`team_${uid}`) || localStorage.getItem(`community_tracker_team_${uid}`);
      if (localTeamId && localTeamId.trim() && !candidateTeamIds.includes(localTeamId.trim())) {
        candidateTeamIds.push(localTeamId.trim());
      }
      if (!storedActiveTeamId && localTeamId && localTeamId.trim()) {
        storedActiveTeamId = localTeamId.trim();
      }

      // ── 3. Reports subcollection fallback (RepoRefine / reports) ─
      if (candidateTeamIds.length === 0) {
        try {
          const reportsSnap = await getDocs(collection(firestore, 'users', uid, 'reports'));
          if (!isCurrent()) return;
          reportsSnap.docs.forEach((d) => {
            const rData = d.data();
            if (typeof rData.teamId === 'string' && rData.teamId.trim() && !candidateTeamIds.includes(rData.teamId.trim())) {
              candidateTeamIds.push(rData.teamId.trim());
            }
          });
        } catch {
          // Subcollection or query not present, ignore
        }
      }

      if (!isCurrent()) return;

      // ── 4. Fallback queries (where permitted by rules) ───────────
      if (candidateTeamIds.length === 0) {
        try {
          const ownedQ = query(collection(firestore, 'teams'), where('ownerId', '==', uid));
          const ownedSnap = await getDocs(ownedQ);
          if (!isCurrent()) return;
          ownedSnap.docs.forEach((d) => {
            if (!candidateTeamIds.includes(d.id)) {
              candidateTeamIds.push(d.id);
            }
          });
        } catch {
          // May be restricted by rules
        }

        try {
          const memberGroupQ = query(collectionGroup(firestore, 'members'), where('uid', '==', uid));
          const memberGroupSnap = await getDocs(memberGroupQ);
          if (!isCurrent()) return;
          memberGroupSnap.docs.forEach((d) => {
            const parentTeam = d.ref.parent.parent;
            if (parentTeam && !candidateTeamIds.includes(parentTeam.id)) {
              candidateTeamIds.push(parentTeam.id);
            }
          });
        } catch {
          // May be restricted by rules
        }
      }

      if (!isCurrent()) return;

      // ── 5. Validate membership for candidate team IDs ────────────
      const confirmedMemberships: Array<{ id: string; role: MemberRole }> = [];
      let networkFailureDuringValidation = false;

      for (const tid of candidateTeamIds) {
        try {
          const memberRef = doc(firestore, 'teams', tid, 'members', uid);
          const memberSnap = await getDoc(memberRef);
          if (!isCurrent()) return;
          if (memberSnap.exists()) {
            const mData = memberSnap.data();
            if (mData.uid === uid || memberSnap.id === uid) {
              const role = (mData.role as MemberRole) || 'member';
              confirmedMemberships.push({ id: tid, role });
            }
          }
        } catch (err: unknown) {
          const errCode = (err as { code?: string })?.code;
          if (errCode === 'permission-denied') {
            // User is legitimately not a member or team deleted — skip
          } else {
            networkFailureDuringValidation = true;
          }
        }
      }

      if (!isCurrent()) return;

      // ── 6. Handle Lookup / Network Failures ───────────────────────
      // Requirement 8: Never silently interpret a permission, network, or query error
      // as proof that the user has no team.
      if (confirmedMemberships.length === 0) {
        if (candidateTeamIds.length > 0 && networkFailureDuringValidation) {
          setTeamError('Could not verify team membership due to a network connection issue. Please check your connection and try again.');
          setTeamLoading(false);
          return;
        }
        if (userDocLookupFailed && candidateTeamIds.length === 0) {
          setTeamError('Could not load user data due to a network connection issue. Please check your connection and try again.');
          setTeamLoading(false);
          return;
        }

        // Clean brand-new user: no teams found and no lookup failures
        setUserTeams([]);
        setUserTeamIds([]);
        setTeamId(null);
        setTeam(null);
        setTeamLoading(false);
        return;
      }

      // ── 7. Fetch Team Metadata for all Valid Teams ───────────────
      const resolvedTeams: UserTeamInfo[] = [];
      for (const { id: tid, role } of confirmedMemberships) {
        try {
          const teamSnap = await getDoc(doc(firestore, 'teams', tid));
          if (!isCurrent()) return;
          if (teamSnap.exists()) {
            const tData = teamSnap.data();
            resolvedTeams.push({
              id: tid,
              name: tData.name || 'Untitled Team',
              description: tData.description || '',
              role,
            });
          }
        } catch {
          resolvedTeams.push({
            id: tid,
            name: tid,
            role,
          });
        }
      }

      if (!isCurrent()) return;

      if (resolvedTeams.length === 0) {
        // Teams were deleted
        setUserTeams([]);
        setUserTeamIds([]);
        setTeamId(null);
        setTeam(null);
        setTeamLoading(false);
        return;
      }

      const validIds = resolvedTeams.map((t) => t.id);
      setUserTeams(resolvedTeams);
      setUserTeamIds(validIds);

      // ── 8. Decide Active Team ────────────────────────────────────
      const activeId =
        storedActiveTeamId && validIds.includes(storedActiveTeamId)
          ? storedActiveTeamId
          : validIds[0];

      // Scoped local storage
      localStorage.setItem(`team_${uid}`, activeId);

      // Self-healing update on /users/{uid} with { merge: true }
      try {
        await setDoc(userDocRef, {
          teamIds: validIds,
          activeTeamId: activeId,
          updatedAt: serverTimestamp(),
        }, { merge: true });
      } catch (err) {
        console.warn('Non-critical: Failed to update user doc index:', err);
      }

      if (!isCurrent()) return;

      // Set active teamId. Note: teamLoading stays true until snapshot delivers the team!
      setTeamId(activeId);
    } catch (err: unknown) {
      if (!isCurrent()) return;
      console.error('Team restore failed:', err);
      setTeamError('Failed to load your team. Check your connection and try again.');
      setTeamLoading(false);
    }
  }, [user]);

  // Run team restore on user change
  useEffect(() => {
    if (!user) {
      restoreExecutionId.current++;
      restoringForUid.current = null;
      setTeamId(null);
      setTeam(null);
      setUserTeams([]);
      setUserTeamIds([]);
      setMembers([]);
      setPeople([]);
      setTeamLoading(false);
      setTeamError(null);
      return;
    }
    resolveTeam();
  }, [user, resolveTeam, retryCount]);

  // Retry function exposed to UI
  const retryTeamRestore = useCallback(() => {
    setRetryCount((prev) => prev + 1);
  }, []);

  // Switch to a different team
  const switchTeam = useCallback(async (tid: string) => {
    if (!user || !db) return;
    setTeamLoading(true);
    setTeamError(null);
    setTeamId(tid);
    localStorage.setItem(`team_${user.uid}`, tid);
    try {
      await setDoc(doc(db, 'users', user.uid), {
        activeTeamId: tid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('Could not persist activeTeamId switch:', err);
    }
  }, [user]);

  // ── Subscribe to active team document ───────────────────────────
  useEffect(() => {
    if (!teamId || !db || !firebaseConfigured) {
      setTeam(null);
      setLoading(false);
      return;
    }

    setLoading(true);
    const unsub = onSnapshot(
      doc(db, 'teams', teamId),
      (snap) => {
        if (snap.exists()) {
          setTeam({ id: snap.id, ...snap.data() } as Team);
          setTeamError(null);
        } else {
          setTeam(null);
          setTeamId(null);
          if (user) {
            localStorage.removeItem(`team_${user.uid}`);
          }
        }
        setLoading(false);
        setTeamLoading(false); // Finished loading team doc!
      },
      (err) => {
        console.error('Team doc listener error:', err);
        if (err.code === 'permission-denied') {
          setTeamError('Access denied. You may not be a member of this team.');
        } else {
          setTeamError('Failed to load team data. Check your connection and try again.');
        }
        setLoading(false);
        setTeamLoading(false);
      }
    );
    return unsub;
  }, [teamId, user]);

  // ── Subscribe to members subcollection ──────────────────────────
  useEffect(() => {
    if (!teamId || !db || !firebaseConfigured) { setMembers([]); return; }
    const unsub = onSnapshot(
      collection(db, 'teams', teamId, 'members'),
      (snap) => setMembers(snap.docs.map((d) => ({ uid: d.id, ...d.data() } as TeamMember))),
      () => setMembers([])
    );
    return unsub;
  }, [teamId]);

  // ── Subscribe to people subcollection ───────────────────────────
  useEffect(() => {
    if (!teamId || !db || !firebaseConfigured) { setPeople([]); return; }
    setPeopleLoading(true);
    const q = query(collection(db, 'teams', teamId, 'people'), orderBy('createdAt', 'desc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        setPeople(snap.docs.map((d) => ({ id: d.id, ...d.data() } as Person)));
        setPeopleLoading(false);
      },
      (err) => {
        if (err.code !== 'permission-denied') setError(err.message);
        setPeopleLoading(false);
      }
    );
    return unsub;
  }, [teamId]);

  // ── Subscribe to groups subcollection ────────────────────────────
  useEffect(() => {
    if (!teamId || !db || !firebaseConfigured) {
      setFirestoreGroups([]);
      return;
    }
    setGroupsLoading(true);
    const q = query(collection(db, 'teams', teamId, 'groups'), orderBy('name', 'asc'));
    const unsub = onSnapshot(
      q,
      (snap) => {
        const list = snap.docs.map((d) => ({ id: d.id, ...d.data() } as Group));
        setFirestoreGroups(list);
        setStoredGroups(teamId, list);
        setGroupsLoading(false);
      },
      () => {
        // Fallback to local storage if Firestore rules not yet deployed or network down
        const local = getStoredGroups(teamId);
        setFirestoreGroups(local);
        setGroupsLoading(false);
      }
    );
    return unsub;
  }, [teamId]);

  // Combined groups list: Firestore docs + local storage + existing people.group values
  const groups = useMemo(() => {
    if (!teamId) return [];
    const map = new Map<string, Group>();

    // 1. Groups from Firestore subcollection
    firestoreGroups.forEach((g) => {
      const key = g.name.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, g);
      }
    });

    // 2. Groups from local storage fallback
    const local = getStoredGroups(teamId);
    local.forEach((g) => {
      const key = g.name.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, g);
      }
    });

    // 3. Reconcile/include group names assigned to existing people
    people.forEach((p) => {
      const gName = p.group?.trim();
      if (!gName) return;
      const key = gName.toLowerCase();
      if (!map.has(key)) {
        map.set(key, {
          id: `legacy-${encodeURIComponent(key)}`,
          name: gName,
          description: 'Inferred from contacts',
        });
      }
    });

    return Array.from(map.values()).sort((a, b) => a.name.localeCompare(b.name));
  }, [teamId, firestoreGroups, people]);

  // ── createTeam ──────────────────────────────────────────────────
  // Safe against partial failures. Write order:
  // 1. teams/{teamId}
  // 2. teams/{teamId}/private/config
  // 3. teams/{teamId}/members/{uid} (owner)
  // 4. users/{uid} index (safe merge preserving RepoRefine fields)
  const createTeam = useCallback(async (name: string, description?: string): Promise<string> => {
    if (!user || !db) throw new Error('Not authenticated');
    setError(null);

    const teamRef = doc(collection(db, 'teams'));
    const inviteCode = generateInviteCode();

    // Step 1: Create team document
    await setDoc(teamRef, {
      name: name.trim(),
      description: description?.trim() || '',
      ownerId: user.uid,
      createdAt: serverTimestamp(),
    });

    try {
      // Step 2: Store invite code in private subcollection
      await setDoc(doc(db, 'teams', teamRef.id, 'private', 'config'), {
        inviteCode,
      });

      // Step 3: Bootstrap the owner's member document
      await setDoc(doc(db, 'teams', teamRef.id, 'members', user.uid), {
        uid: user.uid,
        displayName: user.displayName || 'Unknown',
        email: user.email || '',
        photoURL: user.photoURL || '',
        role: 'owner',
        joinedAt: serverTimestamp(),
      });
    } catch (setupErr) {
      console.error('Failed to complete team configuration:', setupErr);
      try { await deleteDoc(teamRef); } catch { /* ignore */ }
      throw new Error('Failed to complete team configuration. Please try again.');
    }

    // Step 4: Persist membership index on users/{uid} with { merge: true }
    const newTeamIds = Array.from(new Set([...userTeamIds, teamRef.id]));
    const newTeamInfo: UserTeamInfo = {
      id: teamRef.id,
      name: name.trim(),
      description: description?.trim() || '',
      role: 'owner',
    };

    try {
      await setDoc(doc(db, 'users', user.uid), {
        teamIds: newTeamIds,
        activeTeamId: teamRef.id,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('Could not update user doc index, continuing with local state:', err);
    }

    localStorage.setItem(`team_${user.uid}`, teamRef.id);
    setUserTeams((prev) => [...prev.filter((t) => t.id !== teamRef.id), newTeamInfo]);
    setUserTeamIds(newTeamIds);
    setTeamLoading(true);
    setTeamId(teamRef.id);
    return teamRef.id;
  }, [user, userTeamIds]);

  // ── joinTeam ────────────────────────────────────────────────────
  const joinTeam = useCallback(async (tid: string, code: string): Promise<void> => {
    if (!user || !db) throw new Error('Not authenticated');
    setError(null);

    const normalizedCode = code.toUpperCase().trim();
    if (!normalizedCode) throw new Error('Invitation code is required');

    try {
      // Step 1: Write member document with _joinCode for server-side rule verification
      await setDoc(doc(db, 'teams', tid, 'members', user.uid), {
        uid: user.uid,
        displayName: user.displayName || 'Unknown',
        email: user.email || '',
        photoURL: user.photoURL || '',
        role: 'member',
        joinedAt: serverTimestamp(),
        _joinCode: normalizedCode,
      });
    } catch (err: unknown) {
      const errCode = (err as { code?: string }).code;
      if (errCode === 'permission-denied') {
        throw new Error('Team not found or invalid invitation code. Please check both values and try again.');
      }
      throw err;
    }

    // Step 2: Fetch team metadata
    let teamName = tid;
    let teamDesc = '';
    try {
      const teamSnap = await getDoc(doc(db, 'teams', tid));
      if (teamSnap.exists()) {
        teamName = teamSnap.data().name || tid;
        teamDesc = teamSnap.data().description || '';
      }
    } catch {
      // Fallback to ID
    }

    // Step 3: Persist membership index on users/{uid} with { merge: true }
    const newTeamIds = Array.from(new Set([...userTeamIds, tid]));
    const newTeamInfo: UserTeamInfo = {
      id: tid,
      name: teamName,
      description: teamDesc,
      role: 'member',
    };

    try {
      await setDoc(doc(db, 'users', user.uid), {
        teamIds: newTeamIds,
        activeTeamId: tid,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('Could not update user doc index after join:', err);
    }

    localStorage.setItem(`team_${user.uid}`, tid);
    setUserTeams((prev) => [...prev.filter((t) => t.id !== tid), newTeamInfo]);
    setUserTeamIds(newTeamIds);
    setTeamLoading(true);
    setTeamId(tid);
  }, [user, userTeamIds]);

  // ── restoreTeamWithId ───────────────────────────────────────────
  // Instant recovery for legacy users or existing members who know their Team ID:
  // Verifies that doc('teams', tid, 'members', user.uid) already exists in Firestore.
  // If confirmed, immediately restores the team and updates the user index without
  // needing an invite code.
  const restoreTeamWithId = useCallback(async (tid: string): Promise<boolean> => {
    if (!user || !db) throw new Error('Not authenticated');
    const normalizedId = tid.trim();
    if (!normalizedId) return false;

    setTeamError(null);
    const memberRef = doc(db, 'teams', normalizedId, 'members', user.uid);
    let memberSnap;
    try {
      memberSnap = await getDoc(memberRef);
    } catch (err: unknown) {
      const errCode = (err as { code?: string })?.code;
      if (errCode === 'permission-denied') return false;
      throw err;
    }

    if (!memberSnap.exists()) return false;

    const role = (memberSnap.data().role as MemberRole) || 'member';
    let teamName = normalizedId;
    let teamDesc = '';
    try {
      const teamSnap = await getDoc(doc(db, 'teams', normalizedId));
      if (teamSnap.exists()) {
        teamName = teamSnap.data().name || normalizedId;
        teamDesc = teamSnap.data().description || '';
      }
    } catch {
      // Fallback
    }

    const newTeamIds = Array.from(new Set([...userTeamIds, normalizedId]));
    const newTeamInfo: UserTeamInfo = {
      id: normalizedId,
      name: teamName,
      description: teamDesc,
      role,
    };

    try {
      await setDoc(doc(db, 'users', user.uid), {
        teamIds: newTeamIds,
        activeTeamId: normalizedId,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch (err) {
      console.warn('Could not update user doc index on restore:', err);
    }

    localStorage.setItem(`team_${user.uid}`, normalizedId);
    setUserTeams((prev) => [...prev.filter((t) => t.id !== normalizedId), newTeamInfo]);
    setUserTeamIds(newTeamIds);
    setTeamLoading(true);
    setTeamId(normalizedId);
    return true;
  }, [user, userTeamIds]);

  // ── leaveTeam ───────────────────────────────────────────────────
  const leaveTeam = useCallback(async () => {
    if (!user || !db || !teamId) return;

    try {
      await deleteDoc(doc(db, 'teams', teamId, 'members', user.uid));
    } catch {
      // May fail if already removed — continue cleanup
    }

    const newTeamIds = userTeamIds.filter((id) => id !== teamId);
    const newTeams = userTeams.filter((t) => t.id !== teamId);
    const nextActive = newTeamIds.length > 0 ? newTeamIds[0] : null;

    try {
      await setDoc(doc(db, 'users', user.uid), {
        teamIds: newTeamIds,
        activeTeamId: nextActive,
        updatedAt: serverTimestamp(),
      }, { merge: true });
    } catch {
      // Non-critical
    }

    setUserTeams(newTeams);
    setUserTeamIds(newTeamIds);
    localStorage.removeItem(`team_${user.uid}`);
    if (nextActive) {
      localStorage.setItem(`team_${user.uid}`, nextActive);
      setTeamId(nextActive);
      setTeamLoading(true);
    } else {
      setTeamId(null);
      setTeam(null);
      setMembers([]);
      setPeople([]);
      setTeamLoading(false);
    }
  }, [user, teamId, userTeamIds, userTeams]);

  // ── People CRUD ─────────────────────────────────────────────────
  const addPerson = useCallback(async (data: Omit<Person, 'id' | 'createdByUid' | 'createdByName' | 'createdAt' | 'updatedAt'>) => {
    if (!user || !db || !teamId) throw new Error('Not in a team');
    const ref = doc(collection(db, 'teams', teamId, 'people'));

    const isDonor = data.isDonor !== false;
    const isInviter = data.isInviter === true;

    const docData: Record<string, unknown> = {
      fullName: data.fullName.trim(),
      location: normalizeLocationForStorage(data.location),
      status: data.status || 'pending',
      isDonor,
      isInviter,
      inviterStatus: data.inviterStatus || 'not_invited',
      createdByUid: user.uid,
      createdByName: user.displayName || 'Unknown',
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    };

    if (data.phone?.trim()) docData.phone = data.phone.trim();
    if (data.group?.trim()) docData.group = data.group.trim();
    if (typeof data.amount === 'number' && data.amount > 0) {
      docData.amount = data.amount;
      const initialContrib: Contribution = {
        id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`,
        amount: data.amount,
        recordedAt: Timestamp.now(),
        recordedByUid: user.uid,
        recordedByName: user.displayName || 'Unknown',
        note: 'Initial contribution',
      };
      docData.contributions = data.contributions && data.contributions.length > 0 ? data.contributions : [initialContrib];
    }

    await setDoc(ref, docData);
  }, [user, teamId]);

  const updatePerson = useCallback(async (
    id: string,
    data: Partial<Pick<Person, 'fullName' | 'phone' | 'location' | 'group' | 'status' | 'isDonor' | 'isInviter' | 'inviterStatus' | 'amount' | 'contributions'>>
  ) => {
    if (!db || !teamId) throw new Error('Not in a team');
    const updateData: Record<string, unknown> = {
      ...data,
      updatedAt: serverTimestamp(),
    };

    if ('location' in data) {
      updateData.location = normalizeLocationForStorage(data.location);
    }
    if ('fullName' in data && data.fullName) {
      updateData.fullName = data.fullName.trim();
    }
    if ('phone' in data) {
      updateData.phone = data.phone?.trim() || '';
    }
    if ('group' in data) {
      updateData.group = data.group?.trim() || '';
    }
    if ('amount' in data) {
      if (typeof data.amount === 'number' && data.amount > 0) {
        updateData.amount = data.amount;
      }
    }
    if ('contributions' in data && Array.isArray(data.contributions)) {
      updateData.contributions = data.contributions;
    }
    if ('isDonor' in data) {
      if (data.isDonor === true) {
        updateData.isDonor = true;
        if (data.isInviter !== undefined) {
          updateData.isInviter = data.isInviter;
        }
      } else if (data.isDonor === false) {
        updateData.isDonor = false;
        updateData.isInviter = true;
      }
    }

    await updateDoc(doc(db, 'teams', teamId, 'people', id), updateData);
  }, [teamId]);

  const deletePerson = useCallback(async (id: string) => {
    if (!db || !teamId) throw new Error('Not in a team');
    await deleteDoc(doc(db, 'teams', teamId, 'people', id));
  }, [teamId]);

  const updatePersonStatus = useCallback(async (id: string, status: PersonStatus) => {
    if (!db || !teamId) throw new Error('Not in a team');
    await updateDoc(doc(db, 'teams', teamId, 'people', id), {
      status,
      updatedAt: serverTimestamp(),
    });
  }, [teamId]);

  const updatePersonInviterStatus = useCallback(async (id: string, inviterStatus: InviterStatus) => {
    if (!db || !teamId) throw new Error('Not in a team');
    await updateDoc(doc(db, 'teams', teamId, 'people', id), {
      inviterStatus,
      updatedAt: serverTimestamp(),
    });
  }, [teamId]);

  // ── Record Donation (with contribution tracking and repeat donation support) ──
  const recordDonation = useCallback(async (personId: string, amount: number, note?: string) => {
    if (!user || !db || !teamId) throw new Error('Not authenticated or no active team');
    if (typeof amount !== 'number' || isNaN(amount) || amount <= 0) {
      throw new Error('Donation amount must be greater than ₹0');
    }

    const targetPerson = people.find((p) => p.id === personId);
    if (!targetPerson) throw new Error('Person record not found');

    const rounded = Math.round(amount * 100) / 100;
    const newContrib: Contribution = {
      id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
      amount: rounded,
      recordedAt: Timestamp.now(),
      recordedByUid: user.uid,
      recordedByName: user.displayName || 'Volunteer',
      note: note?.trim() || undefined,
    };

    let prevContribs: Contribution[] = Array.isArray(targetPerson.contributions) ? [...targetPerson.contributions] : [];
    if (prevContribs.length === 0 && typeof targetPerson.amount === 'number' && targetPerson.amount > 0) {
      prevContribs = [{
        id: `c_legacy_${personId}`,
        amount: targetPerson.amount,
        recordedAt: targetPerson.createdAt || Timestamp.now(),
        recordedByUid: targetPerson.createdByUid || user.uid,
        recordedByName: targetPerson.createdByName || 'Recorded earlier',
        note: 'Previous contribution',
      }];
    }

    const updatedContribs = [...prevContribs, newContrib];
    const totalAmount = Math.round(updatedContribs.reduce((sum, c) => sum + (c.amount || 0), 0) * 100) / 100;

    await updateDoc(doc(db, 'teams', teamId, 'people', personId), {
      status: 'collected',
      isDonor: true,
      amount: totalAmount,
      contributions: updatedContribs,
      updatedAt: serverTimestamp(),
    });
  }, [user, teamId, people]);

  // ── Edit Donation Amount ──────────────────────────────────────────
  const editDonationAmount = useCallback(async (personId: string, newAmount: number, note?: string) => {
    if (!user || !db || !teamId) throw new Error('Not authenticated or no active team');
    if (typeof newAmount !== 'number' || isNaN(newAmount) || newAmount <= 0) {
      throw new Error('Donation amount must be greater than ₹0');
    }

    const targetPerson = people.find((p) => p.id === personId);
    if (!targetPerson) throw new Error('Person record not found');

    const rounded = Math.round(newAmount * 100) / 100;
    const updatedContribs: Contribution[] = [
      {
        id: `c_edit_${Date.now()}`,
        amount: rounded,
        recordedAt: Timestamp.now(),
        recordedByUid: user.uid,
        recordedByName: user.displayName || 'Volunteer',
        note: note?.trim() || 'Amount updated',
      },
    ];

    await updateDoc(doc(db, 'teams', teamId, 'people', personId), {
      amount: rounded,
      status: 'collected',
      contributions: updatedContribs,
      updatedAt: serverTimestamp(),
    });
  }, [user, teamId, people]);

  // ── Convert Invitation-only Person to Donor ───────────────────────
  const convertInviterToDonor = useCallback(async (personId: string, initialAmount?: number, note?: string) => {
    if (!user || !db || !teamId) throw new Error('Not authenticated or no active team');
    const targetPerson = people.find((p) => p.id === personId);
    if (!targetPerson) throw new Error('Person record not found');

    const updatePayload: Record<string, unknown> = {
      isDonor: true,
      isInviter: true, // Preserve inviter role!
      updatedAt: serverTimestamp(),
    };

    if (typeof initialAmount === 'number' && initialAmount > 0) {
      const rounded = Math.round(initialAmount * 100) / 100;
      const newContrib: Contribution = {
        id: `c_${Date.now()}_${Math.random().toString(36).substring(2, 8)}`,
        amount: rounded,
        recordedAt: Timestamp.now(),
        recordedByUid: user.uid,
        recordedByName: user.displayName || 'Volunteer',
        note: note?.trim() || 'First contribution',
      };
      updatePayload.status = 'collected';
      updatePayload.amount = rounded;
      updatePayload.contributions = [newContrib];
    } else {
      // Marked as donor without immediate collection -> starts as pending visit
      updatePayload.status = 'pending';
    }

    await updateDoc(doc(db, 'teams', teamId, 'people', personId), updatePayload);
  }, [user, teamId, people]);

  // ── Groups CRUD ─────────────────────────────────────────────────
  const createGroup = useCallback(async (name: string, description?: string): Promise<string> => {
    if (!user || !teamId) throw new Error('Not authenticated or no active team');
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Group name cannot be blank.');
    }
    if (trimmed.length > 80) {
      throw new Error('Group name cannot exceed 80 characters.');
    }

    // Case-insensitive duplicate check within active team's formal groups
    const isDuplicate = groups.some(
      (g: Group) => !g.id.startsWith('legacy-') && g.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error(`A group named "${trimmed}" already exists in this team.`);
    }

    const newId = (db && collection(db, 'teams', teamId, 'groups'))
      ? doc(collection(db, 'teams', teamId, 'groups')).id
      : `grp-${Date.now()}`;

    const newGroup: Group = {
      id: newId,
      name: trimmed,
      description: description?.trim() || '',
      createdByUid: user.uid,
      createdByName: user.displayName || 'Unknown',
    };

    const currentLocal = getStoredGroups(teamId);
    setStoredGroups(teamId, [...currentLocal.filter((g: Group) => g.id !== newId), newGroup]);
    setFirestoreGroups((prev) => [...prev.filter((g: Group) => g.id !== newId), newGroup]);

    if (db) {
      try {
        await setDoc(doc(db, 'teams', teamId, 'groups', newId), {
          ...newGroup,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Firestore group write notice (team storage active):', err);
      }
    }

    return newId;
  }, [user, teamId, groups]);

  const renameGroup = useCallback(async (groupId: string, newName: string): Promise<void> => {
    if (!user || !teamId) throw new Error('Not in a team');
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Group name cannot be blank.');
    if (trimmed.length > 80) throw new Error('Group name cannot exceed 80 characters.');

    const targetGroup = groups.find((g: Group) => g.id === groupId);
    if (!targetGroup) throw new Error('Group not found.');

    const oldName = targetGroup.name.trim();
    if (oldName.toLowerCase() === trimmed.toLowerCase() && oldName === trimmed) {
      return;
    }

    const isDuplicate = groups.some(
      (g: Group) => g.id !== groupId && g.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error(`Another group named "${trimmed}" already exists in this team.`);
    }

    const updatedGroup: Group = { ...targetGroup, name: trimmed };
    const currentLocal = getStoredGroups(teamId);
    setStoredGroups(teamId, currentLocal.map((g: Group) => (g.id === groupId ? updatedGroup : g)));
    setFirestoreGroups((prev) => prev.map((g: Group) => (g.id === groupId ? updatedGroup : g)));

    if (db && !groupId.startsWith('legacy-')) {
      try {
        await updateDoc(doc(db, 'teams', teamId, 'groups', groupId), {
          name: trimmed,
          updatedAt: serverTimestamp(),
        });
      } catch (err) {
        console.warn('Firestore rename group notice:', err);
      }
    }

    // Update all assigned people in this team so their assignments stay synchronized
    const affectedPeople = people.filter(
      (p) => p.group?.trim().toLowerCase() === oldName.toLowerCase()
    );
    await Promise.all(
      affectedPeople.map((p) => updatePerson(p.id, { group: trimmed }))
    );
  }, [user, teamId, groups, people, updatePerson]);

  const deleteGroup = useCallback(async (groupId: string): Promise<void> => {
    if (!user || !teamId) throw new Error('Not in a team');
    const targetGroup = groups.find((g: Group) => g.id === groupId);
    if (!targetGroup) return;

    const groupName = targetGroup.name.trim();

    const currentLocal = getStoredGroups(teamId);
    setStoredGroups(teamId, currentLocal.filter((g: Group) => g.id !== groupId));
    setFirestoreGroups((prev) => prev.filter((g: Group) => g.id !== groupId));

    if (db && !groupId.startsWith('legacy-')) {
      try {
        await deleteDoc(doc(db, 'teams', teamId, 'groups', groupId));
      } catch (err) {
        console.warn('Firestore delete group notice:', err);
      }
    }

    // Safe handling: NEVER delete people! Only unassign group membership
    const assignedPeople = people.filter(
      (p) => p.group?.trim().toLowerCase() === groupName.toLowerCase()
    );
    await Promise.all(
      assignedPeople.map((p) => updatePerson(p.id, { group: '' }))
    );
  }, [user, teamId, groups, people, updatePerson]);

  const assignPersonToGroup = useCallback(async (personId: string, groupName: string | null): Promise<void> => {
    await updatePerson(personId, { group: groupName ? groupName.trim() : '' });
  }, [updatePerson]);

  const reconcileGroups = useCallback(async (): Promise<number> => {
    if (!teamId) return 0;
    const legacyGroups = groups.filter((g: Group) => g.id.startsWith('legacy-'));
    let imported = 0;
    for (const g of legacyGroups) {
      try {
        await createGroup(g.name);
        imported++;
      } catch {
        // Already exists
      }
    }
    return imported;
  }, [teamId, groups, createGroup]);

  return (
    <TeamContext.Provider value={{
      team, members, people, groups, loading, teamLoading, peopleLoading, groupsLoading, error, teamError,
      userTeamIds, userTeams, activeTeamId: teamId, retryTeamRestore, switchTeam,
      createTeam, joinTeam, restoreTeamWithId, leaveTeam,
      addPerson, updatePerson, deletePerson, updatePersonStatus, updatePersonInviterStatus,
      recordDonation, editDonationAmount, convertInviterToDonor,
      createGroup, renameGroup, deleteGroup, assignPersonToGroup, reconcileGroups,
    }}>
      {children}
    </TeamContext.Provider>
  );
}

export function useTeam(): TeamContextType {
  const ctx = useContext(TeamContext);
  if (!ctx) throw new Error('useTeam must be used within TeamProvider');
  return ctx;
}
