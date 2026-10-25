import test from 'node:test';
import assert from 'node:assert/strict';

interface Person {
  id: string;
  fullName: string;
  phone?: string;
  location?: string;
  group?: string;
  status: 'pending' | 'visited' | 'collected';
  isDonor?: boolean;
  isInviter?: boolean;
}

interface Group {
  id: string;
  name: string;
  description?: string;
}

class GroupsManager {
  groups: Group[] = [];
  people: Person[] = [];

  constructor(initialGroups: Group[] = [], initialPeople: Person[] = []) {
    this.groups = [...initialGroups];
    this.people = [...initialPeople];
  }

  getEffectiveGroups(): Group[] {
    const map = new Map<string, Group>();
    this.groups.forEach((g) => {
      const key = g.name.trim().toLowerCase();
      if (key && !map.has(key)) {
        map.set(key, g);
      }
    });

    // Inferred from existing people
    this.people.forEach((p) => {
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
  }

  createGroup(name: string, description?: string): Group {
    const trimmed = name.trim();
    if (!trimmed) {
      throw new Error('Group name cannot be blank.');
    }
    if (trimmed.length > 80) {
      throw new Error('Group name cannot exceed 80 characters.');
    }

    const isDuplicate = this.groups.some(
      (g) => g.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error(`A group named "${trimmed}" already exists in this team.`);
    }

    const newGroup: Group = {
      id: `grp-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      name: trimmed,
      description: description?.trim() || '',
    };
    this.groups.push(newGroup);
    return newGroup;
  }

  renameGroup(groupId: string, newName: string): void {
    const trimmed = newName.trim();
    if (!trimmed) throw new Error('Group name cannot be blank.');
    if (trimmed.length > 80) throw new Error('Group name cannot exceed 80 characters.');

    const target = this.getEffectiveGroups().find((g) => g.id === groupId);
    if (!target) throw new Error('Group not found.');

    const oldName = target.name.trim();
    if (oldName.toLowerCase() === trimmed.toLowerCase() && oldName === trimmed) {
      return;
    }

    const isDuplicate = this.groups.some(
      (g) => g.id !== groupId && g.name.trim().toLowerCase() === trimmed.toLowerCase()
    );
    if (isDuplicate) {
      throw new Error(`Another group named "${trimmed}" already exists in this team.`);
    }

    // Update group object if formal
    const formalIdx = this.groups.findIndex((g) => g.id === groupId);
    if (formalIdx >= 0) {
      this.groups[formalIdx].name = trimmed;
    } else {
      // If was legacy, promote to formal
      this.groups.push({ id: groupId, name: trimmed });
    }

    // Update all assigned people
    this.people.forEach((p) => {
      if (p.group?.trim().toLowerCase() === oldName.toLowerCase()) {
        p.group = trimmed;
      }
    });
  }

  deleteGroup(groupId: string): void {
    const target = this.getEffectiveGroups().find((g) => g.id === groupId);
    if (!target) return;
    const groupName = target.name.trim();

    // Remove from formal groups
    this.groups = this.groups.filter((g) => g.id !== groupId);

    // Unassign people — NEVER delete people!
    this.people.forEach((p) => {
      if (p.group?.trim().toLowerCase() === groupName.toLowerCase()) {
        p.group = '';
      }
    });
  }

  assignPersonToGroup(personId: string, groupName: string | null): void {
    const person = this.people.find((p) => p.id === personId);
    if (!person) throw new Error('Person not found.');
    person.group = groupName ? groupName.trim() : '';
  }

  getGroupPeople(groupName: string): Person[] {
    const target = groupName.trim().toLowerCase();
    return this.people.filter((p) => p.group?.trim().toLowerCase() === target);
  }

  getGroupStats(groupName: string) {
    const assigned = this.getGroupPeople(groupName);
    const donors = assigned.filter((p) => p.isDonor !== false);
    return {
      total: assigned.length,
      donors: donors.length,
      collected: donors.filter((p) => p.status === 'collected').length,
      visited: donors.filter((p) => p.status === 'visited').length,
      pending: donors.filter((p) => p.status === 'pending').length,
    };
  }

  reconcileGroups(): number {
    const unpersisted = this.getEffectiveGroups().filter((g) => g.id.startsWith('legacy-'));
    let count = 0;
    unpersisted.forEach((g) => {
      this.createGroup(g.name);
      count++;
    });
    return count;
  }
}

// ─────────────────────────────────────────────────────────────────
// Tests
// ─────────────────────────────────────────────────────────────────

test('Scenario 1: Empty state when no groups exist', () => {
  const manager = new GroupsManager();
  assert.equal(manager.getEffectiveGroups().length, 0, 'Should have 0 groups');
});

test('Scenario 2: Create Group with valid name', () => {
  const manager = new GroupsManager();
  const grp = manager.createGroup('Block A', 'Residential area');
  assert.equal(grp.name, 'Block A');
  assert.equal(grp.description, 'Residential area');
  assert.equal(manager.getEffectiveGroups().length, 1);
});

test('Scenario 3: Blank group name is rejected', () => {
  const manager = new GroupsManager();
  assert.throws(() => manager.createGroup('   '), /Group name cannot be blank/);
  assert.throws(() => manager.createGroup(''), /Group name cannot be blank/);
});

test('Scenario 4: Case-insensitive duplicate name is rejected', () => {
  const manager = new GroupsManager();
  manager.createGroup('Friends');
  assert.throws(() => manager.createGroup('friends'), /already exists/);
  assert.throws(() => manager.createGroup('   FRIENDS   '), /already exists/);
});

test('Scenario 5: Reconcile and preserve existing people group assignments', () => {
  const existingPeople: Person[] = [
    { id: 'p1', fullName: 'John Doe', group: 'Youth Wing', status: 'pending' },
    { id: 'p2', fullName: 'Jane Smith', group: 'Youth Wing', status: 'collected' },
    { id: 'p3', fullName: 'Bob NoGroup', status: 'pending' },
  ];

  const manager = new GroupsManager([], existingPeople);
  const effective = manager.getEffectiveGroups();

  assert.equal(effective.length, 1);
  assert.equal(effective[0].name, 'Youth Wing');
  assert.ok(effective[0].id.startsWith('legacy-'), 'Marked as inferred/legacy');

  // Reconcile creates formal document
  const importedCount = manager.reconcileGroups();
  assert.equal(importedCount, 1);
  assert.equal(manager.groups.length, 1);
  assert.equal(manager.groups[0].name, 'Youth Wing');
});

test('Scenario 6: Assign existing person to group without creating duplicate', () => {
  const people: Person[] = [
    { id: 'p1', fullName: 'Ramesh Patel', group: '', status: 'pending' },
  ];
  const manager = new GroupsManager([], people);
  manager.createGroup('Block B');

  manager.assignPersonToGroup('p1', 'Block B');
  assert.equal(people.length, 1, 'No duplicate record created');
  assert.equal(people[0].group, 'Block B');

  const blockBPeople = manager.getGroupPeople('Block B');
  assert.equal(blockBPeople.length, 1);
  assert.equal(blockBPeople[0].fullName, 'Ramesh Patel');
});

test('Scenario 7: Group stats calculation', () => {
  const people: Person[] = [
    { id: 'p1', fullName: 'A', group: 'Block A', status: 'pending', isDonor: true },
    { id: 'p2', fullName: 'B', group: 'Block A', status: 'visited', isDonor: true },
    { id: 'p3', fullName: 'C', group: 'Block A', status: 'collected', isDonor: true },
    { id: 'p4', fullName: 'D', group: 'Block A', status: 'pending', isDonor: false, isInviter: true },
    { id: 'p5', fullName: 'E', group: 'Block B', status: 'pending', isDonor: true },
  ];
  const manager = new GroupsManager([], people);
  manager.createGroup('Block A');
  manager.createGroup('Block B');

  const statsA = manager.getGroupStats('Block A');
  assert.equal(statsA.total, 4);
  assert.equal(statsA.donors, 3);
  assert.equal(statsA.collected, 1);
  assert.equal(statsA.visited, 1);
  assert.equal(statsA.pending, 1);

  const statsB = manager.getGroupStats('Block B');
  assert.equal(statsB.total, 1);
  assert.equal(statsB.donors, 1);
});

test('Scenario 8: Rename group updates group and all assigned contacts', () => {
  const people: Person[] = [
    { id: 'p1', fullName: 'Alice', group: 'Old Block', status: 'pending' },
    { id: 'p2', fullName: 'Charlie', group: 'Other Group', status: 'pending' },
  ];
  const manager = new GroupsManager([], people);
  const grp = manager.createGroup('Old Block');

  manager.renameGroup(grp.id, 'New Block');

  assert.equal(grp.name, 'New Block');
  assert.equal(people[0].group, 'New Block', 'Assigned contact group was updated to New Block');
  assert.equal(people[1].group, 'Other Group', 'Unrelated contact group was not modified');
});

test('Scenario 9: Safe group deletion unassigns people and NEVER deletes people', () => {
  const people: Person[] = [
    { id: 'p1', fullName: 'Dave', group: 'Temporary Group', status: 'pending' },
    { id: 'p2', fullName: 'Eve', group: 'Temporary Group', status: 'collected' },
  ];
  const manager = new GroupsManager([], people);
  const grp = manager.createGroup('Temporary Group');

  manager.deleteGroup(grp.id);

  assert.equal(manager.groups.length, 0, 'Group document removed');
  assert.equal(people.length, 2, 'Contacts were NEVER deleted');
  assert.equal(people[0].group, '', 'Dave is now unassigned');
  assert.equal(people[1].group, '', 'Eve is now unassigned');
  assert.equal(people[0].fullName, 'Dave');
  assert.equal(people[1].fullName, 'Eve');
});
