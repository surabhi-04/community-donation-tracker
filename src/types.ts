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
  createdByUid: string;
  createdByName: string;
  createdAt: Timestamp;
  updatedAt: Timestamp;
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
}

export interface GroupStats {
  group: string;
  total: number;
  pending: number;
  visited: number;
  collected: number;
}

export interface DashboardStats {
  total: number;
  pending: number;
  visited: number;
  collected: number;
  locationStats: LocationStats[];
  groupStats: GroupStats[];
}
