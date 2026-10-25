import { Timestamp } from 'firebase/firestore';

export type PersonStatus = 'pending' | 'visited' | 'collected';
export type InviterStatus = 'not_invited' | 'invited' | 'confirmed';
export type MemberRole = 'owner' | 'member';

/**
 * Sentinel value stored in Firestore to satisfy deployed security rules
 * that require `location is string && location.size() > 0`.
 * Displayed as blank/empty in the UI and CSV exports.
 */
export const FALLBACK_EMPTY_LOCATION = '—';

/**
 * Returns a clean string for display/export.
 * Converts the fallback sentinel ('—') or empty string to blank ''.
 */
export function normalizeLocationForDisplay(loc?: string | null): string {
  if (!loc || loc.trim() === '' || loc === FALLBACK_EMPTY_LOCATION || loc === '-') {
    return '';
  }
  return loc.trim();
}

/**
 * Returns the string to persist to Firestore.
 * If empty or only whitespace, returns the fallback sentinel to comply with deployed rules.
 */
export function normalizeLocationForStorage(loc?: string | null): string {
  const trimmed = loc?.trim();
  return trimmed && trimmed !== FALLBACK_EMPTY_LOCATION ? trimmed : FALLBACK_EMPTY_LOCATION;
}

/**
 * Determines if a person is a donor.
 * Default is true for backward compatibility with existing records.
 */
export function isPersonDonor(p: Person): boolean {
  return p.isDonor !== false;
}

/**
 * Determines if a person is an inviter / in invitation list.
 * Requirement: Donors must automatically appear in the invitation list.
 * Inviter-only people also appear.
 */
export function isPersonInviter(p: Person): boolean {
  return p.isInviter === true || p.isDonor !== false;
}

export interface Team {
  id: string;
  name: string;
  description?: string;
  ownerId: string;
  createdAt: Timestamp;
}

export interface TeamMember {
  uid: string;
  displayName: string;
  email: string;
  photoURL?: string;
  role: MemberRole;
  joinedAt: Timestamp;
}

export interface UserTeamInfo {
  id: string;
  name: string;
  description?: string;
  role: MemberRole;
}

export interface Contribution {
  id: string;
  amount: number;
  date?: string;
  recordedAt?: Timestamp | string;
  recordedByUid?: string;
  recordedByName?: string;
  note?: string;
}

export interface Person {
  id: string;
  fullName: string;
  phone?: string;
  /** Optional location — stored as FALLBACK_EMPTY_LOCATION ('—') in Firestore if empty */
  location?: string;
  /** Area / Block / Group — organizational grouping separate from physical location */
  group?: string;
  status: PersonStatus;
  /** Whether this person is a donor (default true for backward compatibility) */
  isDonor?: boolean;
  /** Whether this person is an inviter */
  isInviter?: boolean;
  /** Invitation status — independent of donation status */
  inviterStatus?: InviterStatus;
  /** Total collected donation amount in Indian Rupees (INR, ₹) */
  amount?: number;
  /** Audit history of contributions (supports repeat donations) */
  contributions?: Contribution[];
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
}

/**
 * Formats a numeric amount in Indian Rupees (INR, ₹).
 * If undefined or null, returns 'Amount not recorded'.
 */
export function formatINR(amount?: number | null, options?: { showZero?: boolean; includeDecimals?: boolean }): string {
  if (amount === undefined || amount === null || isNaN(amount)) {
    return 'Amount not recorded';
  }
  if (amount === 0 && !options?.showZero) {
    return 'Amount not recorded';
  }
  const hasDecimals = amount % 1 !== 0 || options?.includeDecimals;
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: hasDecimals ? 2 : 0,
    minimumFractionDigits: hasDecimals ? 2 : 0,
  }).format(amount);
}

/**
 * Validates and parses user input for a positive monetary amount in INR.
 */
export function parseAndValidateAmount(raw: string | number): { valid: boolean; value?: number; error?: string } {
  if (typeof raw === 'number') {
    if (!isFinite(raw) || isNaN(raw)) return { valid: false, error: 'Please enter a valid amount' };
    if (raw <= 0) return { valid: false, error: 'Donation amount must be greater than ₹0' };
    return { valid: true, value: Math.round(raw * 100) / 100 };
  }
  const str = String(raw).trim().replace(/,/g, '');
  if (!str) {
    return { valid: false, error: 'Donation amount is required' };
  }
  const num = parseFloat(str);
  if (isNaN(num) || !isFinite(num)) {
    return { valid: false, error: 'Please enter a valid numeric amount' };
  }
  if (num <= 0) {
    return { valid: false, error: 'Donation amount must be greater than ₹0' };
  }
  if (num > 1000000000) {
    return { valid: false, error: 'Amount exceeds maximum allowable limit' };
  }
  return { valid: true, value: Math.round(num * 100) / 100 };
}

export interface Group {
  id: string;
  name: string;
  description?: string;
  createdByUid?: string;
  createdByName?: string;
  createdAt?: Timestamp;
  updatedAt?: Timestamp;
}

export function normalizeGroupName(name?: string | null): string {
  if (!name) return '';
  return name.trim();
}

export interface LocationStats {
  location: string;
  total: number;
  pending: number;
  visited: number;
  collected: number;
  collectedAmount: number;
}

export interface GroupStats {
  group: string;
  total: number;
  pending: number;
  visited: number;
  collected: number;
  collectedAmount: number;
}

export interface DashboardStats {
  total: number;
  pending: number;
  visited: number;
  collected: number;
  totalAmountCollected: number;
  totalRecordedDonations: number;
  collectedWithoutAmount: number;
  totalContributionsCount: number;
  locationStats: LocationStats[];
  groupStats: GroupStats[];
}

