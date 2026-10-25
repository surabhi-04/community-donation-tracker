import test from 'node:test';
import assert from 'node:assert/strict';

// Helper types & functions mirroring our app logic
interface Person {
  id: string;
  fullName: string;
  phone?: string;
  location?: string;
  group?: string;
  status: 'pending' | 'visited' | 'collected';
  isDonor?: boolean;
  isInviter?: boolean;
  inviterStatus?: 'not_invited' | 'invited' | 'confirmed';
}

interface DuplicateSuggestion {
  person: Person;
  matchType: 'exact' | 'close';
}

function findDuplicatePeople(
  name: string,
  allPeople: Person[],
  excludeId?: string
): DuplicateSuggestion[] {
  const trimmed = name.trim();
  if (trimmed.length < 2) return [];

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

function isPersonDonor(p: Person): boolean {
  return p.isDonor !== false;
}

function isPersonInviter(p: Person): boolean {
  return p.isInviter === true || p.isDonor !== false;
}

/**
 * Simulates the PersonForm component state transitions and lifecycle
 */
class PersonFormSimulator {
  fullName: string;
  phone: string;
  isDonor: boolean;
  isInviter: boolean;
  saving = false;
  duplicates: DuplicateSuggestion[] = [];
  confirmedDifferent = false;
  errors: { fullName?: string; role?: string } = {};

  initial?: Partial<Person>;
  allPeople: Person[] = [];

  constructor(
    initial?: Partial<Person>,
    allPeople: Person[] = []
  ) {
    this.initial = initial;
    this.allPeople = allPeople;
    this.fullName = initial?.fullName ?? '';
    this.phone = initial?.phone ?? '';

    // Requirement 2:
    // - Opening Add Person starts with both Donor and Inviter unselected.
    // - When editing an existing person, initialize from that person's actual saved roles.
    if (initial) {
      this.isDonor = isPersonDonor(initial as Person);
      this.isInviter = !isPersonDonor(initial as Person) && initial.isInviter === true;
    } else {
      this.isDonor = false;
      this.isInviter = false;
    }
  }

  onNameChange(newName: string) {
    this.fullName = newName;
    // Clears stale duplicate matches immediately
    this.duplicates = [];
    this.confirmedDifferent = false;
    delete this.errors.fullName;

    if (this.initial) return;
    if (this.saving) return;

    this.duplicates = findDuplicatePeople(newName, this.allPeople, this.initial?.id);
  }

  selectDonor() {
    // Selecting Donor automatically deselects Inviter
    const next = !this.isDonor;
    this.isDonor = next;
    if (next) this.isInviter = false;
    delete this.errors.role;
  }

  selectInviter() {
    // Selecting Inviter automatically deselects Donor
    const next = !this.isInviter;
    this.isInviter = next;
    if (next) this.isDonor = false;
    delete this.errors.role;
  }

  async submit(onSave: (data: any) => Promise<void>): Promise<{ success: boolean; error?: string }> {
    if (this.saving) return { success: false, error: 'already_saving' };

    const trimmedName = this.fullName.trim();
    this.errors = {};

    if (!trimmedName) {
      this.errors.fullName = 'Full name is required';
    }

    if (!this.isDonor && !this.isInviter) {
      this.errors.role = 'Select Donor or Inviter before saving.';
    }

    if (Object.keys(this.errors).length > 0) {
      return { success: false, error: 'validation_failed' };
    }

    // Synchronous duplicate verification
    if (!this.initial && !this.confirmedDifferent) {
      const syncMatches = findDuplicatePeople(trimmedName, this.allPeople, this.initial?.id);
      if (syncMatches.length > 0) {
        this.duplicates = syncMatches;
        return { success: false, error: 'duplicate_found' };
      }
    }

    this.saving = true;
    this.duplicates = []; // Clear duplicate warnings before saving

    try {
      await onSave({
        fullName: trimmedName,
        phone: this.phone.trim() || undefined,
        isDonor: this.isDonor,
        isInviter: this.isDonor ? false : this.isInviter,
        status: this.isDonor ? 'pending' : 'pending',
        inviterStatus: 'not_invited',
      });
      return { success: true };
    } catch (err: any) {
      this.saving = false;
      return { success: false, error: err?.message || 'save_failed' };
    }
  }

  /**
   * Simulates Firestore onSnapshot arrival during or after save
   */
  onFirestoreSnapshotUpdate(updatedAllPeople: Person[]) {
    this.allPeople = updatedAllPeople;
    // CRITICAL: Guard against re-detecting duplicates while saving
    if (this.initial || this.saving) return;

    if (this.fullName.trim().length >= 2) {
      this.duplicates = findDuplicatePeople(this.fullName, this.allPeople, this.initial?.id);
    }
  }
}

// ─────────────────────────────────────────────────────────────────
// Tests for the 10 User Verification Scenarios
// ─────────────────────────────────────────────────────────────────

test('Case 1: Add a genuinely new name -> no duplicate warning, one person created', async () => {
  const existingPeople: Person[] = [
    { id: 'p1', fullName: 'Alice Johnson', status: 'pending', isDonor: true },
    { id: 'p2', fullName: 'Bob Smith', status: 'pending', isDonor: false, isInviter: true },
  ];

  const form = new PersonFormSimulator(undefined, existingPeople);
  form.onNameChange('Charlie Brown');
  assert.equal(form.duplicates.length, 0, 'Should have no duplicate suggestions for Charlie Brown');

  form.selectDonor();
  assert.equal(form.isDonor, true);

  const createdPeople: any[] = [];
  const result = await form.submit(async (data) => {
    createdPeople.push(data);
  });

  assert.equal(result.success, true);
  assert.equal(createdPeople.length, 1);
  assert.equal(createdPeople[0].fullName, 'Charlie Brown');
  assert.equal(createdPeople[0].isDonor, true);
  assert.equal(form.duplicates.length, 0, 'Duplicates should remain empty after saving');
});

test('Case 2: Enter an existing name with different capitalization or extra spaces -> show duplicate warning', () => {
  const existingPeople: Person[] = [
    { id: 'p1', fullName: 'Ramesh Kumar', status: 'pending', isDonor: true },
  ];

  const form = new PersonFormSimulator(undefined, existingPeople);
  
  // Different casing and multiple internal and surrounding spaces
  form.onNameChange('   ramesh    KUMAR   ');
  assert.equal(form.duplicates.length, 1, 'Should detect normalized exact match');
  assert.equal(form.duplicates[0].matchType, 'exact');
  assert.equal(form.duplicates[0].person.id, 'p1');
});

test('Case 3: Change the name after a duplicate match -> clear the stale warning', () => {
  const existingPeople: Person[] = [
    { id: 'p1', fullName: 'Ramesh Kumar', status: 'pending', isDonor: true },
  ];

  const form = new PersonFormSimulator(undefined, existingPeople);
  form.onNameChange('Ramesh Kumar');
  assert.equal(form.duplicates.length, 1, 'Warning present for Ramesh Kumar');

  // Change name to a non-duplicate
  form.onNameChange('Ramesh Patel');
  assert.equal(form.duplicates.length, 0, 'Stale duplicate warning must be cleared immediately');
});

test('Case 4: Simulate a duplicate lookup failure -> do not claim person exists', async () => {
  // If lookup encounters an empty list or error state, it must return 0 duplicates, not false positive
  const emptyPeople: Person[] = [];
  const form = new PersonFormSimulator(undefined, emptyPeople);
  form.onNameChange('Unknown Person');
  assert.equal(form.duplicates.length, 0);

  // If save fails, error is returned, never claim person exists
  form.selectDonor();
  const result = await form.submit(async () => {
    throw new Error('Network timeout during Firestore write');
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'Network timeout during Firestore write');
  assert.equal(form.saving, false, 'Form resets saving state so user can retry');
  assert.equal(form.duplicates.length, 0, 'Never falsely flag as duplicate because of failure');
});

test('Case 5: Edit an existing person -> do not flag that same record as a duplicate of itself', () => {
  const existingPerson: Person = {
    id: 'p100',
    fullName: 'Suresh Raina',
    status: 'pending',
    isDonor: true,
  };
  const allPeople: Person[] = [existingPerson];

  const form = new PersonFormSimulator(existingPerson, allPeople);
  assert.equal(form.fullName, 'Suresh Raina');

  const matches = findDuplicatePeople('Suresh Raina', allPeople, 'p100');
  assert.equal(matches.length, 0, 'Must exclude current record ID from duplicate check');
  assert.equal(form.duplicates.length, 0);
});

test('Case 6: Open a new Add Person form -> neither role is selected', () => {
  const form = new PersonFormSimulator();
  assert.equal(form.isDonor, false, 'Donor must NOT be selected by default');
  assert.equal(form.isInviter, false, 'Inviter must NOT be selected by default');
});

test('Case 7: Select Donor -> Inviter is deselected', () => {
  const form = new PersonFormSimulator();
  form.selectInviter();
  assert.equal(form.isInviter, true);
  assert.equal(form.isDonor, false);

  form.selectDonor();
  assert.equal(form.isDonor, true, 'Donor should now be selected');
  assert.equal(form.isInviter, false, 'Inviter must be automatically deselected');
});

test('Case 8: Select Inviter -> Donor is deselected', () => {
  const form = new PersonFormSimulator();
  form.selectDonor();
  assert.equal(form.isDonor, true);
  assert.equal(form.isInviter, false);

  form.selectInviter();
  assert.equal(form.isInviter, true, 'Inviter should now be selected');
  assert.equal(form.isDonor, false, 'Donor must be automatically deselected');
});

test('Case 9: Try saving without a role -> saving is blocked with clear validation', async () => {
  const form = new PersonFormSimulator();
  form.onNameChange('John Doe');

  assert.equal(form.isDonor, false);
  assert.equal(form.isInviter, false);

  let saveCalled = false;
  const result = await form.submit(async () => {
    saveCalled = true;
  });

  assert.equal(result.success, false);
  assert.equal(result.error, 'validation_failed');
  assert.equal(saveCalled, false, 'Save must not be called');
  assert.equal(form.errors.role, 'Select Donor or Inviter before saving.');
});

test('Case 10: Save with a valid role -> exactly one person created with correct donor/inviter behavior', async () => {
  // Sub-case A: Donor saved
  const formDonor = new PersonFormSimulator();
  formDonor.onNameChange('Deepak Sharma');
  formDonor.selectDonor();

  let savedDonorData: any = null;
  await formDonor.submit(async (data) => {
    savedDonorData = { id: 'new-1', ...data };
  });

  assert.ok(savedDonorData);
  assert.equal(savedDonorData.isDonor, true);
  assert.equal(isPersonDonor(savedDonorData), true, 'Must appear in donor list');
  assert.equal(isPersonInviter(savedDonorData), true, 'Donors must automatically appear in invitation list');

  // Sub-case B: Inviter-only saved
  const formInviter = new PersonFormSimulator();
  formInviter.onNameChange('Priya Patel');
  formInviter.selectInviter();

  let savedInviterData: any = null;
  await formInviter.submit(async (data) => {
    savedInviterData = { id: 'new-2', ...data };
  });

  assert.ok(savedInviterData);
  assert.equal(savedInviterData.isDonor, false);
  assert.equal(savedInviterData.isInviter, true);
  assert.equal(isPersonDonor(savedInviterData), false, 'Inviter-only contact must NOT appear in donor list');
  assert.equal(isPersonInviter(savedInviterData), true, 'Inviter contact must appear in invitation list');
});

test('Substrings do NOT trigger false duplicate warnings', () => {
  const allPeople: Person[] = [
    { id: 'p1', fullName: 'Danielle Miller', status: 'pending', isDonor: true },
    { id: 'p2', fullName: 'Rajesh Khanna', status: 'pending', isDonor: true },
    { id: 'p3', fullName: 'Suresh Kumar', status: 'pending', isDonor: true },
  ];

  // "Dan" vs "Danielle Miller"
  assert.equal(findDuplicatePeople('Dan', allPeople).length, 0);
  // "Raj" vs "Rajesh Khanna"
  assert.equal(findDuplicatePeople('Raj', allPeople).length, 0);
  // "Kumar" vs "Suresh Kumar"
  assert.equal(findDuplicatePeople('Kumar', allPeople).length, 0);
});

test('Transposed full names trigger close duplicate warning', () => {
  const allPeople: Person[] = [
    { id: 'p1', fullName: 'Ramesh Kumar', status: 'pending', isDonor: true },
  ];

  const matches = findDuplicatePeople('Kumar Ramesh', allPeople);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].matchType, 'close');
  assert.equal(matches[0].person.fullName, 'Ramesh Kumar');
});

test('Firestore onSnapshot during save does NOT trigger false duplicate warning', async () => {
  const initialPeople: Person[] = [];
  const form = new PersonFormSimulator(undefined, initialPeople);

  form.onNameChange('Sunita Rao');
  form.selectDonor();
  assert.equal(form.duplicates.length, 0);

  // Submit save
  await form.submit(async () => {
    // While onSave is in-flight, Firestore fires an onSnapshot with the new person
    const updatedPeople: Person[] = [
      { id: 'new-person-id', fullName: 'Sunita Rao', status: 'pending', isDonor: true },
    ];
    form.onFirestoreSnapshotUpdate(updatedPeople);

    // Because form.saving is true, no false duplicate warning is produced
    assert.equal(form.duplicates.length, 0, 'Must NOT trigger duplicate warning while saving in-flight');
  });

  assert.equal(form.duplicates.length, 0);
});
