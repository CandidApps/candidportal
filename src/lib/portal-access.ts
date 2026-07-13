'use client';

import { sendMagicLinkSignIn } from '@/lib/auth/magic-link';
import { portalInvitesDisabledNotice, portalInvitesEnabled } from '@/lib/portal-invites';

export type PortalAccessTier = 'full' | 'trial';

export type PortalAccessGrant = {
  email: string;
  contactId: string;
  contactName: string;
  customerId: string;
  companyName: string;
  tier: PortalAccessTier;
  /** Empty = all locations for this customer */
  locationIds: string[];
  invitedAt: string;
};

export type PortalSessionScope = {
  customerId: string;
  companyName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  tier: PortalAccessTier;
  locationIds: string[];
};

import { PORTAL_PREVIEW_CUSTOMER_COOKIE } from '@/lib/portal/preview-cookie';

const GRANTS_KEY = 'candid-portal-access-grants';
const SESSION_SCOPE_KEY = 'candid-portal-session-scope';
const PREVIEW_KEY = 'candid-portal-preview-active';

function setPreviewCustomerCookie(customerId: string | null): void {
  if (typeof document === 'undefined') return;
  if (!customerId) {
    document.cookie = `${PORTAL_PREVIEW_CUSTOMER_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
    return;
  }
  document.cookie = `${PORTAL_PREVIEW_CUSTOMER_COOKIE}=${encodeURIComponent(customerId)}; Path=/; Max-Age=86400; SameSite=Lax`;
}

function readGrants(): PortalAccessGrant[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(GRANTS_KEY);
    return raw ? (JSON.parse(raw) as PortalAccessGrant[]) : [];
  } catch {
    return [];
  }
}

function writeGrants(grants: PortalAccessGrant[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(GRANTS_KEY, JSON.stringify(grants));
}

export function upsertPortalGrant(grant: PortalAccessGrant): void {
  const email = grant.email.toLowerCase().trim();
  const next = readGrants().filter((g) => g.email.toLowerCase() !== email);
  next.push({ ...grant, email });
  writeGrants(next);
}

export function removePortalGrant(email: string): void {
  const normalized = email.toLowerCase().trim();
  writeGrants(readGrants().filter((g) => g.email.toLowerCase() !== normalized));
}

export function getPortalGrantForEmail(email: string): PortalAccessGrant | null {
  const normalized = email.toLowerCase().trim();
  return readGrants().find((g) => g.email.toLowerCase() === normalized) ?? null;
}

export function setPortalSessionScope(scope: PortalSessionScope | null): void {
  if (typeof window === 'undefined') return;
  if (!scope) {
    localStorage.removeItem(SESSION_SCOPE_KEY);
    return;
  }
  localStorage.setItem(SESSION_SCOPE_KEY, JSON.stringify(scope));
}

export function getPortalSessionScope(): PortalSessionScope | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = localStorage.getItem(SESSION_SCOPE_KEY);
    if (!raw) return null;
    const scope = JSON.parse(raw) as PortalSessionScope;
    if (scope.contactEmail?.trim()) return scope;
    const grant = readGrants().find((g) => g.contactId === scope.contactId);
    if (grant?.email) {
      return { ...scope, contactEmail: grant.email };
    }
    return scope;
  } catch {
    return null;
  }
}

export function contactEmailForPortalScope(scope: PortalSessionScope | null): string | null {
  if (!scope) return null;
  const direct = scope.contactEmail?.trim();
  if (direct) return direct;
  const grant = readGrants().find((g) => g.contactId === scope.contactId);
  return grant?.email?.trim() || null;
}

export function portalTierLabel(tier: PortalAccessTier): string {
  return tier === 'full' ? 'Full access' : 'Trial access';
}

export function clearPortalSessionScopeUnlessPreview(): void {
  if (isPortalPreviewActive()) return;
  setPortalSessionScope(null);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PREVIEW_KEY);
  }
}

export function applyPortalScopeForEmail(email: string): void {
  const normalized = email.toLowerCase().trim();
  const grant = getPortalGrantForEmail(normalized);
  if (grant) {
    setPortalSessionScope({
      customerId: grant.customerId,
      companyName: grant.companyName,
      contactId: grant.contactId,
      contactName: grant.contactName,
      contactEmail: grant.email,
      tier: grant.tier,
      locationIds: grant.locationIds,
    });
  } else {
    setPortalSessionScope(null);
  }
}

/** Admin preview: open the member portal scoped to a contact without changing auth. */
export function startPortalPreview(grant: PortalAccessGrant): void {
  upsertPortalGrant(grant);
  setPortalSessionScope({
    customerId: grant.customerId,
    companyName: grant.companyName,
    contactId: grant.contactId,
    contactName: grant.contactName,
    contactEmail: grant.email,
    tier: grant.tier,
    locationIds: grant.locationIds,
  });
  if (typeof window !== 'undefined') {
    localStorage.setItem(PREVIEW_KEY, '1');
    setPreviewCustomerCookie(grant.customerId);
  }
}

export function endPortalPreview(): void {
  setPortalSessionScope(null);
  if (typeof window !== 'undefined') {
    localStorage.removeItem(PREVIEW_KEY);
    localStorage.removeItem(SESSION_SCOPE_KEY);
    setPreviewCustomerCookie(null);
  }
}

/** Keep preview cookie in sync when reloading an existing admin preview session. */
export function syncPortalPreviewCookieFromScope(): void {
  if (typeof window === 'undefined') return;
  if (!isPortalPreviewActive()) {
    setPreviewCustomerCookie(null);
    return;
  }
  const scope = getPortalSessionScope();
  setPreviewCustomerCookie(scope?.customerId?.trim() || null);
}

/**
 * Refresh the preview cookie when an admin preview session is already active.
 * Does not promote a normal member session into preview mode.
 */
export function ensurePortalPreviewSession(): boolean {
  if (typeof window === 'undefined') return false;
  if (!isPortalPreviewActive()) return false;
  const scope = getPortalSessionScope();
  const customerId = scope?.customerId?.trim() || null;
  if (!customerId) return false;
  setPreviewCustomerCookie(customerId);
  return true;
}

/**
 * Admin-only: if customer scope exists while on the member shell but the preview
 * flag was dropped, restore flag + cookie so portal APIs keep resolving.
 */
export function restoreAdminPortalPreviewFromScope(): boolean {
  if (typeof window === 'undefined') return false;
  const scope = getPortalSessionScope();
  const customerId = scope?.customerId?.trim() || null;
  if (!customerId) return isPortalPreviewActive();
  if (!isPortalPreviewActive()) {
    localStorage.setItem(PREVIEW_KEY, '1');
  }
  setPreviewCustomerCookie(customerId);
  return true;
}

/** Ensure the preview cookie matches a known customer before portal API calls. */
export function ensurePortalApiCustomerCookie(customerId: string | null | undefined): void {
  if (typeof window === 'undefined') return;
  const id = customerId?.trim();
  if (!id) return;
  if (!isPortalPreviewActive()) return;
  setPreviewCustomerCookie(id);
}

export function isPortalPreviewActive(): boolean {
  if (typeof window === 'undefined') return false;
  return localStorage.getItem(PREVIEW_KEY) === '1';
}

export type PortalInviteResult = { ok: boolean; message: string; sent: boolean };

export async function sendPortalInvite(
  grant: PortalAccessGrant,
): Promise<PortalInviteResult> {
  if (!grant.email.trim()) {
    return { ok: false, message: 'Contact email is required to send an invite.', sent: false };
  }

  upsertPortalGrant(grant);

  if (!portalInvitesEnabled()) {
    return {
      ok: true,
      sent: false,
      message: `Portal access saved for ${grant.email}. ${portalInvitesDisabledNotice()}`,
    };
  }

  const result = await sendMagicLinkSignIn(grant.email, {
    next: '/app',
    shouldCreateUser: true,
  });

  if (!result.ok) {
    return { ok: false, message: result.message, sent: false };
  }

  return {
    ok: true,
    sent: true,
    message: `Magic link sent to ${grant.email}. They can sign in without a password.`,
  };
}

export function grantFromContact(
  contact: {
    id: string;
    name: string;
    email: string;
    portalAccess?: boolean;
    portalAccessTier?: PortalAccessTier;
    locationIds?: string[];
    portalInviteSentAt?: string;
  },
  customer: { id: string; company: string },
): PortalAccessGrant | null {
  if (!contact.portalAccess || !contact.email.trim()) return null;
  return {
    email: contact.email.trim(),
    contactId: contact.id,
    contactName: contact.name,
    customerId: customer.id,
    companyName: customer.company,
    tier: contact.portalAccessTier ?? 'trial',
    locationIds: contact.locationIds ?? [],
    invitedAt: contact.portalInviteSentAt ?? new Date().toISOString(),
  };
}
