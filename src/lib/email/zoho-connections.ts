import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/email/crypto';
import { getPrimaryAccount, refreshAccessTokenDetailed } from '@/lib/email/zoho';
import { listAdminTeamMembers } from '@/lib/admin-team-members';

const PERSONAL_TABLE = 'zoho_connections';
const SHARED_TABLE = 'zoho_shared_mailbox';

/** Refresh this far before the real expiry so in-flight requests never use a
 *  token that expires mid-call. */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

/** Cache key for the shared singleton (not a user id). */
const SHARED_CACHE_KEY = '__shared__';

export type ZohoConnectionRow = {
  userId: string;
  accountId: string | null;
  email: string | null;
  displayName: string | null;
  scope: string | null;
  /** @deprecated Personal rows are never shared; kept for API compatibility. */
  isShared: boolean;
  connectedAt: string;
};

type PersonalDbRow = {
  user_id: string;
  account_id: string | null;
  email: string | null;
  display_name: string | null;
  refresh_token_enc: string;
  scope: string | null;
  is_shared: boolean;
  connected_at: string;
  access_token_enc?: string | null;
  access_token_expires_at?: string | null;
};

type SharedDbRow = {
  id: boolean;
  account_id: string | null;
  email: string | null;
  display_name: string | null;
  refresh_token_enc: string;
  scope: string | null;
  access_token_enc?: string | null;
  access_token_expires_at?: string | null;
  connected_by_user_id: string | null;
  connected_at: string;
};

function toPersonalRow(r: PersonalDbRow): ZohoConnectionRow {
  return {
    userId: r.user_id,
    accountId: r.account_id,
    email: r.email,
    displayName: r.display_name,
    scope: r.scope,
    isShared: false,
    connectedAt: r.connected_at,
  };
}

type TokenRow = {
  cacheKey: string;
  account_id: string | null;
  email: string | null;
  refresh_token_enc: string;
  scope: string | null;
  access_token_enc?: string | null;
  access_token_expires_at?: string | null;
  persistAccessToken: (accessToken: string, expiresAt: number) => Promise<void>;
  persistAccount: (accountId: string, email: string) => Promise<void>;
};

/** Encrypts + stores a personal mailbox for a user. Never touches the shared singleton. */
export async function saveConnection(input: {
  userId: string;
  accountId: string;
  email: string;
  displayName: string;
  refreshToken: string;
  scope: string;
  /** Ignored — shared mailboxes use saveSharedConnection. */
  isShared?: boolean;
}): Promise<void> {
  if (input.isShared) {
    await saveSharedConnection({
      accountId: input.accountId,
      email: input.email,
      displayName: input.displayName,
      refreshToken: input.refreshToken,
      scope: input.scope,
      connectedByUserId: input.userId,
    });
    return;
  }

  const admin = createSupabaseAdminClient();
  const { error } = await admin.from(PERSONAL_TABLE).upsert(
    {
      user_id: input.userId,
      account_id: input.accountId,
      email: input.email,
      display_name: input.displayName,
      refresh_token_enc: encryptSecret(input.refreshToken),
      scope: input.scope,
      is_shared: false,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
  tokenCache.delete(input.userId);
  refreshInFlight.delete(input.userId);
}

/** Upserts the shared system mailbox singleton (portal invites, etc.). */
export async function saveSharedConnection(input: {
  accountId: string;
  email: string;
  displayName: string;
  refreshToken: string;
  scope: string;
  connectedByUserId: string;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  const { error } = await admin.from(SHARED_TABLE).upsert(
    {
      id: true,
      account_id: input.accountId,
      email: input.email,
      display_name: input.displayName,
      refresh_token_enc: encryptSecret(input.refreshToken),
      scope: input.scope,
      connected_by_user_id: input.connectedByUserId,
      connected_at: new Date().toISOString(),
      access_token_enc: null,
      access_token_expires_at: null,
    },
    { onConflict: 'id' },
  );
  if (error) throw new Error(error.message);
  tokenCache.delete(SHARED_CACHE_KEY);
  refreshInFlight.delete(SHARED_CACHE_KEY);
}

export async function getConnectionForUser(userId: string): Promise<ZohoConnectionRow | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(PERSONAL_TABLE).select('*').eq('user_id', userId).maybeSingle();
  return data ? toPersonalRow(data as PersonalDbRow) : null;
}

export async function deleteConnection(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.from(PERSONAL_TABLE).delete().eq('user_id', userId);
  tokenCache.delete(userId);
  refreshInFlight.delete(userId);
}

export type SharedMailboxStatus = {
  email: string | null;
  displayName: string | null;
  connectedAt: string | null;
  active: boolean;
  connectedByUserId: string | null;
};

export type TeamMailboxRow = {
  userId: string;
  name: string;
  loginEmail: string;
  mailboxEmail: string | null;
  connected: boolean;
  active: boolean;
  isYou: boolean;
};

/** Comma-separated allowlist; when set, only these logins may manage shared. */
function sharedManagerAllowlist(): Set<string> {
  const raw = process.env.SHARED_MAILBOX_ADMIN_EMAILS?.trim() ?? '';
  if (!raw) return new Set();
  return new Set(
    raw
      .split(',')
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean),
  );
}

export function canManageSharedMailbox(opts: {
  viewerUserId: string;
  viewerEmail: string | null | undefined;
  connectedByUserId: string | null | undefined;
  /** When no shared row exists, any admin may bootstrap connect. */
  sharedExists: boolean;
}): boolean {
  const allow = sharedManagerAllowlist();
  const email = (opts.viewerEmail ?? '').trim().toLowerCase();
  if (allow.size > 0) {
    return Boolean(email && allow.has(email));
  }
  if (!opts.sharedExists) return true;
  if (!opts.connectedByUserId) return true;
  return opts.connectedByUserId === opts.viewerUserId;
}

/** DB row for the shared system mailbox (portal invites, member notifications, etc.). */
export async function getSharedMailboxStatus(): Promise<SharedMailboxStatus | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(SHARED_TABLE).select('*').eq('id', true).maybeSingle();
  if (!data) return null;

  const row = data as SharedDbRow;
  let active = false;
  try {
    await activateTokenRow(sharedToTokenRow(row));
    active = true;
  } catch {
    active = false;
  }

  return {
    email: row.email,
    displayName: row.display_name,
    connectedAt: row.connected_at,
    active,
    connectedByUserId: row.connected_by_user_id,
  };
}

/** Remove the shared system mailbox so a new one can be connected. Does not touch personal rows. */
export async function deleteSharedConnection(): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(SHARED_TABLE).select('id').eq('id', true).maybeSingle();
  if (!data) return false;
  await admin.from(SHARED_TABLE).delete().eq('id', true);
  tokenCache.delete(SHARED_CACHE_KEY);
  refreshInFlight.delete(SHARED_CACHE_KEY);
  return true;
}

type ActiveConnection = {
  accessToken: string;
  accountId: string;
  email: string;
  scope: string | null;
};

type CachedToken = { accessToken: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();
const refreshInFlight = new Map<string, Promise<string>>();

function personalToTokenRow(row: PersonalDbRow): TokenRow {
  return {
    cacheKey: row.user_id,
    account_id: row.account_id,
    email: row.email,
    refresh_token_enc: row.refresh_token_enc,
    scope: row.scope,
    access_token_enc: row.access_token_enc,
    access_token_expires_at: row.access_token_expires_at,
    persistAccessToken: async (accessToken, expiresAt) => {
      const admin = createSupabaseAdminClient();
      await admin
        .from(PERSONAL_TABLE)
        .update({
          access_token_enc: encryptSecret(accessToken),
          access_token_expires_at: new Date(expiresAt).toISOString(),
        })
        .eq('user_id', row.user_id);
    },
    persistAccount: async (accountId, email) => {
      const admin = createSupabaseAdminClient();
      await admin.from(PERSONAL_TABLE).update({ account_id: accountId, email }).eq('user_id', row.user_id);
    },
  };
}

function sharedToTokenRow(row: SharedDbRow): TokenRow {
  return {
    cacheKey: SHARED_CACHE_KEY,
    account_id: row.account_id,
    email: row.email,
    refresh_token_enc: row.refresh_token_enc,
    scope: row.scope,
    access_token_enc: row.access_token_enc,
    access_token_expires_at: row.access_token_expires_at,
    persistAccessToken: async (accessToken, expiresAt) => {
      const admin = createSupabaseAdminClient();
      await admin
        .from(SHARED_TABLE)
        .update({
          access_token_enc: encryptSecret(accessToken),
          access_token_expires_at: new Date(expiresAt).toISOString(),
        })
        .eq('id', true);
    },
    persistAccount: async (accountId, email) => {
      const admin = createSupabaseAdminClient();
      await admin.from(SHARED_TABLE).update({ account_id: accountId, email }).eq('id', true);
    },
  };
}

/** Returns a valid access token for the row, refreshing (once) only if needed. */
async function getFreshAccessToken(row: TokenRow): Promise<string> {
  const key = row.cacheKey;
  const now = Date.now();

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - TOKEN_EXPIRY_BUFFER_MS > now) {
    return cached.accessToken;
  }

  if (row.access_token_enc && row.access_token_expires_at) {
    const exp = new Date(row.access_token_expires_at).getTime();
    if (!Number.isNaN(exp) && exp - TOKEN_EXPIRY_BUFFER_MS > now) {
      try {
        const token = decryptSecret(row.access_token_enc);
        tokenCache.set(key, { accessToken: token, expiresAt: exp });
        return token;
      } catch {
        /* fall through to a real refresh */
      }
    }
  }

  let inflight = refreshInFlight.get(key);
  if (!inflight) {
    inflight = (async () => {
      const refreshToken = decryptSecret(row.refresh_token_enc);
      const { accessToken, expiresIn } = await refreshAccessTokenDetailed(refreshToken);
      const expiresAt = Date.now() + expiresIn * 1000;
      tokenCache.set(key, { accessToken, expiresAt });
      try {
        await row.persistAccessToken(accessToken, expiresAt);
      } catch {
        /* token still works in-memory even if persistence fails */
      }
      return accessToken;
    })().finally(() => refreshInFlight.delete(key));
    refreshInFlight.set(key, inflight);
  }
  return inflight;
}

async function activateTokenRow(row: TokenRow): Promise<ActiveConnection> {
  const accessToken = await getFreshAccessToken(row);
  let accountId = row.account_id ?? '';
  let email = row.email ?? '';
  if (!accountId || !email) {
    const account = await getPrimaryAccount(accessToken);
    accountId = account.accountId;
    email = account.email;
    try {
      await row.persistAccount(accountId, email);
    } catch {
      /* still usable for this request */
    }
  }
  return { accessToken, accountId, email, scope: row.scope };
}

/** Returns a fresh access token + account for a user's personal mailbox, or null if not connected. */
export async function getActiveConnectionForUser(userId: string): Promise<ActiveConnection | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(PERSONAL_TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return activateTokenRow(personalToTokenRow(data as PersonalDbRow));
}

/** Returns a fresh access token + account for the shared system mailbox, or null. */
export async function getActiveSharedConnection(): Promise<ActiveConnection | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(SHARED_TABLE).select('*').eq('id', true).maybeSingle();
  if (!data) return null;
  return activateTokenRow(sharedToTokenRow(data as SharedDbRow));
}

/**
 * Resolves the user's own mailbox, falling back to the shared system mailbox.
 * Crucially, if the personal connection THROWS (e.g. a transient token-refresh
 * error) we still try the shared mailbox instead of reporting "disconnected".
 */
export async function getActiveConnectionForUserOrShared(
  userId: string,
): Promise<ActiveConnection | null> {
  try {
    const own = await getActiveConnectionForUser(userId);
    if (own) return own;
  } catch {
    /* fall through to shared */
  }
  try {
    return await getActiveSharedConnection();
  } catch {
    return null;
  }
}

export type MailboxResolveResult =
  | { ok: true; connection: ActiveConnection; source: 'personal' | 'shared' }
  | {
      ok: false;
      reason: 'not_connected' | 'token_invalid';
      message: string;
      hasLinkedMailbox: boolean;
    };

const RECONNECT_MESSAGE =
  'Zoho mailbox is linked but the stored token could not be refreshed. Disconnect and reconnect your mailbox from Settings → Your personal mailbox.';

/** Activates a mailbox, trying personal and/or shared connections with clear failure reasons. */
export async function resolveActiveMailbox(
  userId: string,
  order: 'shared_first' | 'personal_first' = 'personal_first',
): Promise<MailboxResolveResult> {
  const tryPersonal = async (): Promise<ActiveConnection | null> => {
    try {
      return await getActiveConnectionForUser(userId);
    } catch {
      return null;
    }
  };
  const tryShared = async (): Promise<ActiveConnection | null> => {
    try {
      return await getActiveSharedConnection();
    } catch {
      return null;
    }
  };

  const attempts =
    order === 'shared_first'
      ? ([['shared', tryShared] as const, ['personal', tryPersonal] as const] as const)
      : ([['personal', tryPersonal] as const, ['shared', tryShared] as const] as const);

  for (const [source, fn] of attempts) {
    const connection = await fn();
    if (connection) return { ok: true, connection, source };
  }

  const admin = createSupabaseAdminClient();
  const [{ data: ownRow }, { data: sharedRow }] = await Promise.all([
    admin.from(PERSONAL_TABLE).select('user_id').eq('user_id', userId).maybeSingle(),
    admin.from(SHARED_TABLE).select('id').eq('id', true).maybeSingle(),
  ]);
  const hasLinkedMailbox = Boolean(ownRow) || Boolean(sharedRow);

  if (hasLinkedMailbox) {
    return {
      ok: false,
      reason: 'token_invalid',
      message: RECONNECT_MESSAGE,
      hasLinkedMailbox: true,
    };
  }

  return {
    ok: false,
    reason: 'not_connected',
    message:
      'No Zoho mailbox connected. Connect your personal mailbox from Settings, or use the avatar menu when not yet connected.',
    hasLinkedMailbox: false,
  };
}

/** True when a linked mailbox can obtain a fresh access token (not just a DB row). */
export async function isMailboxActive(userId: string): Promise<boolean> {
  const resolved = await resolveActiveMailbox(userId);
  return resolved.ok;
}

/** True when the user has a personal Zoho row (connected, even if token needs refresh). */
export async function hasPersonalMailbox(userId: string): Promise<boolean> {
  const row = await getConnectionForUser(userId);
  return Boolean(row);
}

/**
 * Team roster with each admin's personal Zoho mailbox address (when connected).
 * Used on Settings so Candid can see each other's working emails.
 * Does not refresh tokens for every teammate (avoids Zoho rate limits).
 */
export async function listTeamMailboxes(viewerUserId: string): Promise<TeamMailboxRow[]> {
  const admin = createSupabaseAdminClient();
  const members = await listAdminTeamMembers(admin);
  const { data: connections } = await admin.from(PERSONAL_TABLE).select('user_id, email');

  const byUser = new Map(
    (connections ?? []).map((c) => [
      String(c.user_id),
      c as { user_id: string; email: string | null },
    ]),
  );

  return members.map((m) => {
    const conn = byUser.get(m.id);
    return {
      userId: m.id,
      name: m.displayName,
      loginEmail: m.email,
      mailboxEmail: conn?.email ?? null,
      connected: Boolean(conn),
      active: Boolean(conn?.email),
      isYou: m.id === viewerUserId,
    };
  });
}
