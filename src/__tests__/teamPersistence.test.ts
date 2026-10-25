import test from 'node:test';
import assert from 'node:assert/strict';

/**
 * Team Persistence & Restoration Unit Tests
 * Testing the core restoration and isolation logic used in TeamContext:
 * 1. Existing owner signing out and back in
 * 2. Existing member signing out and back in
 * 3. A user belonging to multiple teams
 * 4. A genuinely new user with no teams
 * 5. A different Google account signing in on the same browser
 * 6. A membership lookup failing due to permissions or network errors
 */

interface MockFirestore {
  users: Record<string, Record<string, unknown>>;
  teams: Record<string, {
    name: string;
    description?: string;
    ownerId: string;
    members: Record<string, { uid: string; displayName: string; role: 'owner' | 'member' }>;
  }>;
  networkError?: boolean;
}

class MockLocalStorage {
  private store: Record<string, string> = {};
  getItem(key: string): string | null {
    return this.store[key] ?? null;
  }
  setItem(key: string, value: string): void {
    this.store[key] = value;
  }
  removeItem(key: string): void {
    delete this.store[key];
  }
  clear(): void {
    this.store = {};
  }
}

/**
 * Pure simulation of the resolveTeam algorithm in TeamContext.tsx
 */
async function simulateResolveTeam(
  user: { uid: string; displayName?: string } | null,
  db: MockFirestore,
  storage: MockLocalStorage
) {
  if (!user) {
    return {
      activeTeamId: null,
      team: null,
      userTeamIds: [],
      userTeams: [],
      teamLoading: false,
      teamError: null,
    };
  }

  const uid = user.uid;
  const candidateTeamIds: string[] = [];
  let storedActiveTeamId: string | null = null;
  let userDocLookupFailed = false;

  // 1. Read user document on /users/{uid}
  try {
    if (db.networkError) {
      throw new Error('Network unavailable');
    }
    const userDoc = db.users[uid];
    if (userDoc) {
      if (Array.isArray(userDoc.teamIds)) {
        userDoc.teamIds.forEach((tid) => {
          if (typeof tid === 'string' && tid.trim() && !candidateTeamIds.includes(tid.trim())) {
            candidateTeamIds.push(tid.trim());
          }
        });
      }
      if (typeof userDoc.activeTeamId === 'string' && userDoc.activeTeamId.trim()) {
        storedActiveTeamId = userDoc.activeTeamId.trim();
      }
      // Legacy fields
      for (const legacyKey of ['teamId', 'createdTeamId', 'joinedTeamId', 'currentTeamId']) {
        const val = userDoc[legacyKey];
        if (typeof val === 'string' && val.trim() && !candidateTeamIds.includes(val.trim())) {
          candidateTeamIds.push(val.trim());
        }
      }
    }
  } catch (err: unknown) {
    userDocLookupFailed = true;
  }

  // 2. User-scoped LocalStorage fallback
  const localTeamId = storage.getItem(`team_${uid}`) || storage.getItem(`community_tracker_team_${uid}`);
  if (localTeamId && localTeamId.trim() && !candidateTeamIds.includes(localTeamId.trim())) {
    candidateTeamIds.push(localTeamId.trim());
  }
  if (!storedActiveTeamId && localTeamId && localTeamId.trim()) {
    storedActiveTeamId = localTeamId.trim();
  }

  // 3. Fallback discovery (legacy owner search in teams database)
  if (candidateTeamIds.length === 0) {
    for (const [tid, tData] of Object.entries(db.teams)) {
      if (tData.ownerId === uid && !candidateTeamIds.includes(tid)) {
        candidateTeamIds.push(tid);
      }
    }
  }

  // 4. Validate membership for candidate team IDs
  const confirmedMemberships: Array<{ id: string; role: 'owner' | 'member' }> = [];
  let networkFailureDuringValidation = false;

  for (const tid of candidateTeamIds) {
    try {
      if (db.networkError) {
        throw new Error('Network timeout during member lookup');
      }
      const teamDoc = db.teams[tid];
      if (teamDoc && teamDoc.members[uid]) {
        const m = teamDoc.members[uid];
        if (m.uid === uid) {
          confirmedMemberships.push({ id: tid, role: m.role });
        }
      }
    } catch {
      networkFailureDuringValidation = true;
    }
  }

  // 5. Handle Lookup / Network Failures
  if (confirmedMemberships.length === 0) {
    if (candidateTeamIds.length > 0 && networkFailureDuringValidation) {
      return {
        activeTeamId: null,
        team: null,
        userTeamIds: [],
        userTeams: [],
        teamLoading: false,
        teamError: 'Could not verify team membership due to a network connection issue. Please check your connection and try again.',
      };
    }
    if (userDocLookupFailed && candidateTeamIds.length === 0) {
      return {
        activeTeamId: null,
        team: null,
        userTeamIds: [],
        userTeams: [],
        teamLoading: false,
        teamError: 'Could not load user data due to a network connection issue. Please check your connection and try again.',
      };
    }

    // Clean brand-new user with no memberships
    return {
      activeTeamId: null,
      team: null,
      userTeamIds: [],
      userTeams: [],
      teamLoading: false,
      teamError: null,
    };
  }

  // 6. Fetch Team Metadata for all Valid Teams
  const resolvedTeams: Array<{ id: string; name: string; description?: string; role: 'owner' | 'member' }> = [];
  for (const { id: tid, role } of confirmedMemberships) {
    const tData = db.teams[tid];
    if (tData) {
      resolvedTeams.push({
        id: tid,
        name: tData.name,
        description: tData.description,
        role,
      });
    }
  }

  const validIds = resolvedTeams.map((t) => t.id);
  const activeId = storedActiveTeamId && validIds.includes(storedActiveTeamId)
    ? storedActiveTeamId
    : validIds[0];

  // Update storage & user doc index
  storage.setItem(`team_${uid}`, activeId);
  if (!db.users[uid]) db.users[uid] = {};
  db.users[uid].teamIds = validIds;
  db.users[uid].activeTeamId = activeId;

  const activeTeamData = db.teams[activeId];

  return {
    activeTeamId: activeId,
    team: {
      id: activeId,
      name: activeTeamData.name,
      description: activeTeamData.description,
      ownerId: activeTeamData.ownerId,
    },
    userTeamIds: validIds,
    userTeams: resolvedTeams,
    teamLoading: false,
    teamError: null,
  };
}

// ── Test Suite ────────────────────────────────────────────────────────

test('Scenario 1: Existing owner signing out and back in', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {
      'owner-123': {
        teamIds: ['team-alpha'],
        activeTeamId: 'team-alpha',
      },
    },
    teams: {
      'team-alpha': {
        name: 'Alpha Volunteers',
        ownerId: 'owner-123',
        members: {
          'owner-123': { uid: 'owner-123', displayName: 'Alice Owner', role: 'owner' },
        },
      },
    },
  };

  const ownerUser = { uid: 'owner-123', displayName: 'Alice Owner' };

  // Initial sign in
  const session1 = await simulateResolveTeam(ownerUser, db, storage);
  assert.equal(session1.activeTeamId, 'team-alpha');
  assert.equal(session1.team?.name, 'Alpha Volunteers');
  assert.equal(session1.userTeams[0].role, 'owner');
  assert.equal(session1.teamError, null);
  assert.equal(session1.teamLoading, false);

  // Sign out
  const signedOut = await simulateResolveTeam(null, db, storage);
  assert.equal(signedOut.activeTeamId, null);
  assert.equal(signedOut.team, null);
  assert.equal(signedOut.userTeams.length, 0);

  // Sign back in
  const session2 = await simulateResolveTeam(ownerUser, db, storage);
  assert.equal(session2.activeTeamId, 'team-alpha');
  assert.equal(session2.team?.name, 'Alpha Volunteers');
  assert.equal(session2.userTeams[0].role, 'owner');
  assert.equal(session2.teamError, null);
  assert.equal(session2.teamLoading, false);
});

test('Scenario 2: Existing member signing out and back in', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {
      'member-456': {
        teamIds: ['team-alpha'],
        activeTeamId: 'team-alpha',
      },
    },
    teams: {
      'team-alpha': {
        name: 'Alpha Volunteers',
        ownerId: 'owner-123',
        members: {
          'owner-123': { uid: 'owner-123', displayName: 'Alice Owner', role: 'owner' },
          'member-456': { uid: 'member-456', displayName: 'Bob Member', role: 'member' },
        },
      },
    },
  };

  const memberUser = { uid: 'member-456', displayName: 'Bob Member' };

  // Initial sign in
  const session1 = await simulateResolveTeam(memberUser, db, storage);
  assert.equal(session1.activeTeamId, 'team-alpha');
  assert.equal(session1.team?.name, 'Alpha Volunteers');
  assert.equal(session1.userTeams[0].role, 'member');
  assert.equal(session1.teamError, null);

  // Sign out
  const signedOut = await simulateResolveTeam(null, db, storage);
  assert.equal(signedOut.activeTeamId, null);
  assert.equal(signedOut.team, null);

  // Sign back in
  const session2 = await simulateResolveTeam(memberUser, db, storage);
  assert.equal(session2.activeTeamId, 'team-alpha');
  assert.equal(session2.team?.name, 'Alpha Volunteers');
  assert.equal(session2.userTeams[0].role, 'member');
  assert.equal(session2.teamError, null);
});

test('Scenario 3: A user belonging to multiple teams', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {
      'multi-user-789': {
        teamIds: ['team-1', 'team-2'],
        activeTeamId: 'team-2', // User previously had team-2 selected
      },
    },
    teams: {
      'team-1': {
        name: 'First Community',
        ownerId: 'multi-user-789',
        members: {
          'multi-user-789': { uid: 'multi-user-789', displayName: 'Charlie', role: 'owner' },
        },
      },
      'team-2': {
        name: 'Second Relief Group',
        ownerId: 'someone-else',
        members: {
          'someone-else': { uid: 'someone-else', displayName: 'Dana', role: 'owner' },
          'multi-user-789': { uid: 'multi-user-789', displayName: 'Charlie', role: 'member' },
        },
      },
    },
  };

  const user = { uid: 'multi-user-789', displayName: 'Charlie' };
  const res = await simulateResolveTeam(user, db, storage);

  // Both teams discovered
  assert.equal(res.userTeamIds.length, 2);
  assert.equal(res.userTeams.length, 2);
  // Active team restored is the previously selected team-2
  assert.equal(res.activeTeamId, 'team-2');
  assert.equal(res.team?.name, 'Second Relief Group');

  // Verify roles in userTeams
  const team1Info = res.userTeams.find((t) => t.id === 'team-1');
  const team2Info = res.userTeams.find((t) => t.id === 'team-2');
  assert.equal(team1Info?.role, 'owner');
  assert.equal(team2Info?.role, 'member');
});

test('Scenario 4: A genuinely new user with no teams', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {}, // Brand-new user: no user document yet
    teams: {
      'existing-team': {
        name: 'Existing Team',
        ownerId: 'other-user',
        members: {
          'other-user': { uid: 'other-user', displayName: 'Other', role: 'owner' },
        },
      },
    },
  };

  const newUser = { uid: 'brand-new-user-000', displayName: 'New Volunteer' };
  const res = await simulateResolveTeam(newUser, db, storage);

  // Must cleanly return no active team and no error
  assert.equal(res.activeTeamId, null);
  assert.equal(res.team, null);
  assert.equal(res.userTeamIds.length, 0);
  assert.equal(res.userTeams.length, 0);
  assert.equal(res.teamError, null);
  assert.equal(res.teamLoading, false);
});

test('Scenario 5: A different Google account signing in on the same browser', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {
      'user-A': {
        teamIds: ['team-A'],
        activeTeamId: 'team-A',
      },
      'user-B': {
        teamIds: ['team-B'],
        activeTeamId: 'team-B',
      },
    },
    teams: {
      'team-A': {
        name: 'Team Alpha Only',
        ownerId: 'user-A',
        members: {
          'user-A': { uid: 'user-A', displayName: 'User A', role: 'owner' },
        },
      },
      'team-B': {
        name: 'Team Beta Only',
        ownerId: 'user-B',
        members: {
          'user-B': { uid: 'user-B', displayName: 'User B', role: 'owner' },
        },
      },
    },
  };

  // 1. User A signs in
  const resA = await simulateResolveTeam({ uid: 'user-A', displayName: 'User A' }, db, storage);
  assert.equal(resA.activeTeamId, 'team-A');
  assert.equal(resA.team?.name, 'Team Alpha Only');
  assert.equal(storage.getItem('team_user-A'), 'team-A');

  // 2. User A signs out
  await simulateResolveTeam(null, db, storage);

  // 3. User B signs in on the same browser
  const resB = await simulateResolveTeam({ uid: 'user-B', displayName: 'User B' }, db, storage);
  assert.equal(resB.activeTeamId, 'team-B');
  assert.equal(resB.team?.name, 'Team Beta Only');
  assert.equal(resB.userTeamIds.includes('team-A'), false);
  assert.equal(storage.getItem('team_user-B'), 'team-B');

  // 4. Brand new user C signs in on same browser
  const resC = await simulateResolveTeam({ uid: 'user-C', displayName: 'User C' }, db, storage);
  assert.equal(resC.activeTeamId, null);
  assert.equal(resC.team, null);
  assert.equal(resC.userTeamIds.length, 0);
  // User C must NOT inherit team-A or team-B
  assert.equal(resC.userTeamIds.includes('team-A'), false);
  assert.equal(resC.userTeamIds.includes('team-B'), false);
});

test('Scenario 6: A membership lookup failing due to permissions or network errors', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {
      'user-with-team': {
        teamIds: ['team-cloud'],
        activeTeamId: 'team-cloud',
      },
    },
    teams: {
      'team-cloud': {
        name: 'Cloud Relief',
        ownerId: 'user-with-team',
        members: {
          'user-with-team': { uid: 'user-with-team', displayName: 'Cloud User', role: 'owner' },
        },
      },
    },
    networkError: true, // Simulating network dropout/server error
  };

  const user = { uid: 'user-with-team', displayName: 'Cloud User' };
  const res = await simulateResolveTeam(user, db, storage);

  // Requirement 8: Never silently interpret a permission, network, or query error
  // as proof that the user has no team.
  assert.notEqual(res.teamError, null);
  assert.equal(res.team, null);
  assert.match(res.teamError!, /network connection issue|Check your connection/);

  // When network recovers, retry succeeds
  db.networkError = false;
  const retryRes = await simulateResolveTeam(user, db, storage);
  assert.equal(retryRes.teamError, null);
  assert.equal(retryRes.activeTeamId, 'team-cloud');
  assert.equal(retryRes.team?.name, 'Cloud Relief');
});

test('Scenario 7 (Bonus): Legacy user recovery without teamIds index', async () => {
  const storage = new MockLocalStorage();
  const db: MockFirestore = {
    users: {
      'legacy-owner': {
        // No teamIds array present in document (pre-index)
        teamId: 'legacy-team-99',
      },
    },
    teams: {
      'legacy-team-99': {
        name: 'Legacy Community Team',
        ownerId: 'legacy-owner',
        members: {
          'legacy-owner': { uid: 'legacy-owner', displayName: 'Legacy Owner', role: 'owner' },
        },
      },
    },
  };

  const user = { uid: 'legacy-owner', displayName: 'Legacy Owner' };
  const res = await simulateResolveTeam(user, db, storage);

  // Must successfully recover the legacy team
  assert.equal(res.activeTeamId, 'legacy-team-99');
  assert.equal(res.team?.name, 'Legacy Community Team');
  assert.equal(res.userTeams[0].role, 'owner');

  // Verify self-healing persisted the new teamIds index to db.users
  assert.deepEqual(db.users['legacy-owner'].teamIds, ['legacy-team-99']);
  assert.equal(db.users['legacy-owner'].activeTeamId, 'legacy-team-99');
});
