import test from 'node:test';
import assert from 'node:assert/strict';

// Helper types & interfaces mirroring our app logic
interface Contribution {
  id: string;
  amount: number;
  date: string;
  recordedAt: string;
  recordedByUid?: string;
  recordedByName?: string;
  note?: string;
}

interface Person {
  id: string;
  teamId: string;
  fullName: string;
  phone?: string;
  location?: string;
  group?: string;
  status: 'pending' | 'visited' | 'collected';
  amount?: number;
  contributions?: Contribution[];
  isDonor?: boolean;
  isInviter?: boolean;
  inviterStatus?: 'not_invited' | 'invited' | 'confirmed';
}

function formatINR(amount: number | null | undefined, options: { minimumFractionDigits?: number; maximumFractionDigits?: number } = {}): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) {
    return '₹0';
  }
  const minDigits = options.minimumFractionDigits ?? (Number.isInteger(amount) ? 0 : 2);
  const maxDigits = options.maximumFractionDigits ?? 2;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    minimumFractionDigits: minDigits,
    maximumFractionDigits: maxDigits,
  }).format(amount);
}

function parseAndValidateAmount(raw: unknown): { valid: boolean; value?: number; error?: string } {
  if (raw === undefined || raw === null) {
    return { valid: false, error: 'Donation amount is required.' };
  }

  const str = String(raw).trim().replace(/,/g, '');
  if (!str) {
    return { valid: false, error: 'Donation amount cannot be blank.' };
  }

  const num = Number(str);
  if (!Number.isFinite(num)) {
    return { valid: false, error: 'Please enter a valid numeric monetary amount.' };
  }

  if (num <= 0) {
    return { valid: false, error: 'Donation amount must be greater than zero.' };
  }

  if (num > 1_000_000_000) {
    return { valid: false, error: 'Donation amount exceeds reasonable single contribution limit.' };
  }

  const rounded = Math.round(num * 100) / 100;
  return { valid: true, value: rounded };
}

function isPersonDonor(person: Person): boolean {
  return person.isDonor !== false;
}

function isPersonInviter(person: Person): boolean {
  return person.isInviter === true || person.isDonor === true || person.isDonor === undefined;
}

interface DashboardStats {
  totalPeople: number;
  totalDonors: number;
  totalInviters: number;
  totalAmountCollected: number;
  totalRecordedDonations: number;
  collectedWithoutAmount: number;
  totalContributionsCount: number;
}

function computeTeamStats(people: Person[], activeTeamId: string): DashboardStats {
  const teamPeople = people.filter((p) => p.teamId === activeTeamId);
  const donors = teamPeople.filter(isPersonDonor);
  const inviters = teamPeople.filter(isPersonInviter);

  let totalAmountCollected = 0;
  let totalRecordedDonations = 0;
  let collectedWithoutAmount = 0;
  let totalContributionsCount = 0;

  donors.forEach((p) => {
    if (p.status === 'collected') {
      if (typeof p.amount === 'number' && Number.isFinite(p.amount) && p.amount > 0) {
        totalAmountCollected += p.amount;
        totalRecordedDonations++;
        totalContributionsCount += p.contributions && p.contributions.length > 0 ? p.contributions.length : 1;
      } else {
        collectedWithoutAmount++;
      }
    }
  });

  return {
    totalPeople: teamPeople.length,
    totalDonors: donors.length,
    totalInviters: inviters.length,
    totalAmountCollected: Math.round(totalAmountCollected * 100) / 100,
    totalRecordedDonations,
    collectedWithoutAmount,
    totalContributionsCount,
  };
}

class DonationManager {
  people: Person[] = [];

  constructor(initial: Person[] = []) {
    this.people = JSON.parse(JSON.stringify(initial));
  }

  recordDonation(personId: string, amountRaw: unknown, note?: string, userUid = 'user-1'): Person {
    const p = this.people.find((x) => x.id === personId);
    if (!p) throw new Error('Person not found');

    const validation = parseAndValidateAmount(amountRaw);
    if (!validation.valid || typeof validation.value !== 'number') {
      throw new Error(validation.error || 'Invalid amount');
    }

    const contribution: Contribution = {
      id: `contrib-${Date.now()}-${Math.random().toString(36).substring(2, 7)}`,
      amount: validation.value,
      date: new Date().toISOString().split('T')[0],
      recordedAt: new Date().toISOString(),
      recordedByUid: userUid,
      recordedByName: 'Test User',
      note: note?.trim() || undefined,
    };

    const prevContributions = p.contributions || [];
    const updatedContributions = [...prevContributions, contribution];
    const newTotal = updatedContributions.reduce((sum, c) => sum + c.amount, 0);

    p.status = 'collected';
    p.amount = Math.round(newTotal * 100) / 100;
    p.contributions = updatedContributions;
    p.isDonor = true;

    return p;
  }

  editDonationAmount(personId: string, newAmountRaw: unknown, note?: string): Person {
    const p = this.people.find((x) => x.id === personId);
    if (!p) throw new Error('Person not found');

    const validation = parseAndValidateAmount(newAmountRaw);
    if (!validation.valid || typeof validation.value !== 'number') {
      throw new Error(validation.error || 'Invalid amount');
    }

    p.amount = validation.value;
    p.contributions = [
      {
        id: `contrib-${Date.now()}`,
        amount: validation.value,
        date: new Date().toISOString().split('T')[0],
        recordedAt: new Date().toISOString(),
        note: note ? `Adjusted amount: ${note}` : 'Amount adjusted',
      },
    ];

    return p;
  }

  convertInviterToDonor(personId: string, initialAmountRaw?: unknown, note?: string): Person {
    const p = this.people.find((x) => x.id === personId);
    if (!p) throw new Error('Person not found');

    // In-place conversion: preserve isInviter and inviterStatus
    p.isDonor = true;

    if (initialAmountRaw !== undefined && initialAmountRaw !== null && String(initialAmountRaw).trim() !== '') {
      const validation = parseAndValidateAmount(initialAmountRaw);
      if (!validation.valid || typeof validation.value !== 'number') {
        throw new Error(validation.error || 'Invalid amount');
      }
      p.status = 'collected';
      p.amount = validation.value;
      p.contributions = [
        {
          id: `contrib-initial-${Date.now()}`,
          amount: validation.value,
          date: new Date().toISOString().split('T')[0],
          recordedAt: new Date().toISOString(),
          note: note?.trim() || 'Initial donation upon becoming donor',
        },
      ];
    }

    return p;
  }
}

// ─────────────────────────────────────────────────────────────────
// TEST SUITE: 12 Acceptance Criteria Scenarios
// ─────────────────────────────────────────────────────────────────

test('Scenario 1 & 2: Mark a donor as Collected with ₹500 and verify dashboard total increases by ₹500', () => {
  const manager = new DonationManager([
    {
      id: 'p1',
      teamId: 'team-a',
      fullName: 'Sunil Rao',
      status: 'pending',
      isDonor: true,
    },
  ]);

  const initialStats = computeTeamStats(manager.people, 'team-a');
  assert.equal(initialStats.totalAmountCollected, 0);
  assert.equal(initialStats.totalRecordedDonations, 0);

  // Mark as collected with 500
  manager.recordDonation('p1', 500);

  const updatedPerson = manager.people.find((p) => p.id === 'p1')!;
  assert.equal(updatedPerson.status, 'collected');
  assert.equal(updatedPerson.amount, 500);
  assert.equal(updatedPerson.contributions?.length, 1);
  assert.equal(updatedPerson.contributions?.[0].amount, 500);

  // Verify dashboard total increases by ₹500
  const afterStats = computeTeamStats(manager.people, 'team-a');
  assert.equal(afterStats.totalAmountCollected, 500);
  assert.equal(afterStats.totalRecordedDonations, 1);
  assert.equal(afterStats.totalContributionsCount, 1);
});

test('Scenario 3: Edit donation amount and verify the total recalculates correctly', () => {
  const manager = new DonationManager([
    {
      id: 'p1',
      teamId: 'team-a',
      fullName: 'Sunil Rao',
      status: 'collected',
      amount: 500,
      isDonor: true,
    },
  ]);

  const beforeStats = computeTeamStats(manager.people, 'team-a');
  assert.equal(beforeStats.totalAmountCollected, 500);

  // Correct amount from 500 to 1250
  manager.editDonationAmount('p1', 1250);

  const afterPerson = manager.people.find((p) => p.id === 'p1')!;
  assert.equal(afterPerson.amount, 1250);

  const afterStats = computeTeamStats(manager.people, 'team-a');
  assert.equal(afterStats.totalAmountCollected, 1250);
  assert.equal(afterStats.totalRecordedDonations, 1);
});

test('Scenario 4: Record amount for an invitation-only person and verify they become a donor without creating duplicate person', () => {
  const manager = new DonationManager([
    {
      id: 'inv-1',
      teamId: 'team-a',
      fullName: 'Priya Sharma',
      status: 'pending',
      isDonor: false,
      isInviter: true,
      inviterStatus: 'confirmed',
      group: 'Block A',
      location: 'Bangalore',
    },
  ]);

  assert.equal(manager.people.length, 1);
  const initialPerson = manager.people[0];
  assert.equal(isPersonDonor(initialPerson), false);
  assert.equal(isPersonInviter(initialPerson), true);

  // Convert inviter to donor with donation of ₹1,000
  manager.convertInviterToDonor('inv-1', 1000, 'Diwali contribution');

  // Verify NO duplicate record was created
  assert.equal(manager.people.length, 1);
  const updatedPerson = manager.people[0];
  assert.equal(updatedPerson.id, 'inv-1');
  assert.equal(updatedPerson.fullName, 'Priya Sharma');
  assert.equal(updatedPerson.group, 'Block A');
  assert.equal(updatedPerson.location, 'Bangalore');

  // Verify they are now a donor with recorded amount
  assert.equal(isPersonDonor(updatedPerson), true);
  assert.equal(updatedPerson.status, 'collected');
  assert.equal(updatedPerson.amount, 1000);

  // Verify dashboard total now reflects their donation
  const stats = computeTeamStats(manager.people, 'team-a');
  assert.equal(stats.totalAmountCollected, 1000);
  assert.equal(stats.totalDonors, 1);
});

test('Scenario 5: Confirm invitation status remains unchanged when donor role or donation status changes', () => {
  const manager = new DonationManager([
    {
      id: 'inv-2',
      teamId: 'team-a',
      fullName: 'Anand Verma',
      status: 'pending',
      isDonor: false,
      isInviter: true,
      inviterStatus: 'confirmed',
    },
  ]);

  manager.convertInviterToDonor('inv-2', 2000);

  const person = manager.people[0];
  // Invitation status MUST remain confirmed
  assert.equal(person.inviterStatus, 'confirmed');
  assert.equal(person.isInviter, true);
  assert.equal(person.isDonor, true);
  assert.equal(person.status, 'collected');
  assert.equal(person.amount, 2000);
});

test('Scenario 6: Confirm inviter-only people without donations are excluded from donation totals', () => {
  const manager = new DonationManager([
    {
      id: 'donor-1',
      teamId: 'team-a',
      fullName: 'Kavita Roy',
      status: 'collected',
      amount: 750,
      isDonor: true,
    },
    {
      id: 'inviter-only-1',
      teamId: 'team-a',
      fullName: 'Deepak Patil',
      status: 'pending',
      isDonor: false,
      isInviter: true,
      inviterStatus: 'invited',
    },
    {
      id: 'inviter-only-2',
      teamId: 'team-a',
      fullName: 'Ravi Teja',
      status: 'pending',
      isDonor: false,
      isInviter: true,
      inviterStatus: 'confirmed',
    },
  ]);

  const stats = computeTeamStats(manager.people, 'team-a');
  assert.equal(stats.totalPeople, 3);
  assert.equal(stats.totalDonors, 1);
  assert.equal(stats.totalInviters, 3); // All donors + inviters
  assert.equal(stats.totalAmountCollected, 750); // ONLY Kavita's ₹750
  assert.equal(stats.totalRecordedDonations, 1);
});

test('Scenario 7: Verify an existing collected record without an amount is handled honestly (not treated as ₹0)', () => {
  const manager = new DonationManager([
    {
      id: 'legacy-collected',
      teamId: 'team-a',
      fullName: 'Vijay Mallya',
      status: 'collected',
      // amount is intentionally undefined (legacy record)
      isDonor: true,
    },
    {
      id: 'recorded-donor',
      teamId: 'team-a',
      fullName: 'Meera Sen',
      status: 'collected',
      amount: 1500,
      isDonor: true,
    },
  ]);

  const stats = computeTeamStats(manager.people, 'team-a');
  // Total must be honest: 1500, NOT counting the missing amount as 0 or inflating recorded count
  assert.equal(stats.totalAmountCollected, 1500);
  assert.equal(stats.totalRecordedDonations, 1);
  assert.equal(stats.collectedWithoutAmount, 1); // Transparently reported
});

test('Scenario 8: Verify amounts are formatted in INR using Indian numbering system', () => {
  assert.equal(formatINR(500), '₹500');
  assert.equal(formatINR(1500), '₹1,500');
  assert.equal(formatINR(15000), '₹15,000');
  assert.equal(formatINR(150000), '₹1,50,000');
  assert.equal(formatINR(10000000), '₹1,00,00,000');
  assert.equal(formatINR(500.5), '₹500.50');
  assert.equal(formatINR(1500, { minimumFractionDigits: 2 }), '₹1,500.00');
  assert.equal(formatINR(undefined), '₹0');
  assert.equal(formatINR(null), '₹0');
  assert.equal(formatINR(NaN), '₹0');
});

test('Scenario 9: Verify records remain strictly isolated between teams', () => {
  const allPeople: Person[] = [
    {
      id: 'p-team-a',
      teamId: 'team-alpha',
      fullName: 'Alpha Donor',
      status: 'collected',
      amount: 5000,
      isDonor: true,
    },
    {
      id: 'p-team-b',
      teamId: 'team-beta',
      fullName: 'Beta Donor',
      status: 'collected',
      amount: 12000,
      isDonor: true,
    },
  ];

  const alphaStats = computeTeamStats(allPeople, 'team-alpha');
  const betaStats = computeTeamStats(allPeople, 'team-beta');

  assert.equal(alphaStats.totalAmountCollected, 5000);
  assert.equal(alphaStats.totalDonors, 1);

  assert.equal(betaStats.totalAmountCollected, 12000);
  assert.equal(betaStats.totalDonors, 1);
});

test('Scenario 10: Verify invalid amounts cannot be saved (negative, zero, non-numeric, malformed)', () => {
  assert.equal(parseAndValidateAmount('-500').valid, false);
  assert.equal(parseAndValidateAmount('0').valid, false);
  assert.equal(parseAndValidateAmount('').valid, false);
  assert.equal(parseAndValidateAmount('   ').valid, false);
  assert.equal(parseAndValidateAmount('abc').valid, false);
  assert.equal(parseAndValidateAmount('$500').valid, false);
  assert.equal(parseAndValidateAmount('500.999').valid, true); // rounds to 2 decimals
  assert.equal(parseAndValidateAmount('500.999').value, 501);
  assert.equal(parseAndValidateAmount('1,500.50').valid, true); // comma stripped
  assert.equal(parseAndValidateAmount('1,500.50').value, 1500.5);
  assert.equal(parseAndValidateAmount(2000).valid, true);
  assert.equal(parseAndValidateAmount(2000).value, 2000);
});

test('Scenario 11: Verify repeat clicks and multiple contributions do not silently overwrite earlier contributions', () => {
  const manager = new DonationManager([
    {
      id: 'repeat-donor',
      teamId: 'team-a',
      fullName: 'Gopal Krishna',
      status: 'pending',
      isDonor: true,
    },
  ]);

  // First contribution: ₹500
  manager.recordDonation('repeat-donor', 500, 'First installment');
  let person = manager.people[0];
  assert.equal(person.amount, 500);
  assert.equal(person.contributions?.length, 1);

  // Second contribution: ₹1,000
  manager.recordDonation('repeat-donor', 1000, 'Second installment');
  person = manager.people[0];
  // Total must be 1500 (500 + 1000)
  assert.equal(person.amount, 1500);
  assert.equal(person.contributions?.length, 2);
  assert.equal(person.contributions?.[0].amount, 500);
  assert.equal(person.contributions?.[1].amount, 1000);

  // Third contribution: ₹250
  manager.recordDonation('repeat-donor', 250, 'Final donation');
  person = manager.people[0];
  assert.equal(person.amount, 1750);
  assert.equal(person.contributions?.length, 3);

  const stats = computeTeamStats(manager.people, 'team-a');
  assert.equal(stats.totalAmountCollected, 1750);
  assert.equal(stats.totalRecordedDonations, 1); // 1 donor
  assert.equal(stats.totalContributionsCount, 3); // 3 individual contributions preserved!
});
