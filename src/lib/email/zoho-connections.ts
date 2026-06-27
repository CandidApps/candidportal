import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/email/crypto';
import { getPrimaryAccount, refreshAccessTokenDetailed } from '@/lib/email/zoho';

const TABLE = 'zoho_connections';

/** Refresh this far before the real expiry so in-flight requests never use a
 *  token that expires mid-call. */
const TOKEN_EXPIRY_BUFFER_MS = 5 * 60 * 1000;

export type ZohoConnectionRow = {
  userId: string;
  accountId: string | null;
  email: string | null;
  displayName: string | null;
  scope: string | null;
  isShared: boolean;
  connectedAt: string;
};

type DbRow = {
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

function toRow(r: DbRow): ZohoConnectionRow {
  return {
    userId: r.user_id,
    accountId: r.account_id,
    email: r.email,
    displayName: r.display_name,
    scope: r.scope,
    isShared: r.is_shared,
    connectedAt: r.connected_at,
  };
}

/** Encrypts + stores a connection. If shared, demotes any prior shared mailbox. */
export async function saveConnection(input: {
  userId: string;
  accountId: string;
  email: string;
  displayName: string;
  refreshToken: string;
  scope: string;
  isShared: boolean;
}): Promise<void> {
  const admin = createSupabaseAdminClient();
  if (input.isShared) {
    await admin.from(TABLE).update({ is_shared: false }).eq('is_shared', true);
  }
  const { error } = await admin.from(TABLE).upsert(
    {
      user_id: input.userId,
      account_id: input.accountId,
      email: input.email,
      display_name: input.displayName,
      refresh_token_enc: encryptSecret(input.refreshToken),
      scope: input.scope,
      is_shared: input.isShared,
      connected_at: new Date().toISOString(),
    },
    { onConflict: 'user_id' },
  );
  if (error) throw new Error(error.message);
  tokenCache.delete(input.userId);
  refreshInFlight.delete(input.userId);
}

export async function getConnectionForUser(userId: string): Promise<ZohoConnectionRow | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  return data ? toRow(data as DbRow) : null;
}

export async function deleteConnection(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.from(TABLE).delete().eq('user_id', userId);
  tokenCache.delete(userId);
  refreshInFlight.delete(userId);
}

type ActiveConnection = {
  accessToken: string;
  accountId: string;
  email: string;
  scope: string | null;
};

// In-memory access-token cache (per warm server instance) plus an in-flight
// promise map so the several connection lookups in a single page load
// (calendar + email + brief + topbar) share ONE refresh instead of each hitting
// Zoho's rate-limited token endpoint.
type CachedToken = { accessToken: string; expiresAt: number };
const tokenCache = new Map<string, CachedToken>();
const refreshInFlight = new Map<string, Promise<string>>();

/** Returns a valid access token for the row, refreshing (once) only if needed. */
async function getFreshAccessToken(row: DbRow): Promise<string> {
  const key = row.user_id;
  const now = Date.now();

  const cached = tokenCache.get(key);
  if (cached && cached.expiresAt - TOKEN_EXPIRY_BUFFER_MS > now) {
    return cached.accessToken;
  }

  // Reuse a token persisted by a previous (possibly cold-started) invocation.
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
        const admin = createSupabaseAdminClient();
        await admin
          .from(TABLE)
          .update({
            access_token_enc: encryptSecret(accessToken),
            access_token_expires_at: new Date(expiresAt).toISOString(),
          })
          .eq('user_id', row.user_id);
      } catch {
        /* token still works in-memory even if persistence fails */
      }
      return accessToken;
    })().finally(() => refreshInFlight.delete(key));
    refreshInFlight.set(key, inflight);
  }
  return inflight;
}

async function activate(row: DbRow): Promise<ActiveConnection> {
  const accessToken = await getFreshAccessToken(row);
  let accountId = row.account_id ?? '';
  let email = row.email ?? '';
  if (!accountId || !email) {
    const account = await getPrimaryAccount(accessToken);
    accountId = account.accountId;
    email = account.email;
    const admin = createSupabaseAdminClient();
    await admin
      .from(TABLE)
      .update({ account_id: accountId, email })
      .eq('user_id', row.user_id);
  }
  return { accessToken, accountId, email, scope: row.scope };
}

/** Returns a fresh access token + account for a user's mailbox, or null if not connected. */
export async function getActiveConnectionForUser(userId: string): Promise<ActiveConnection | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  if (!data) return null;
  return activate(data as DbRow);
}

/** Returns a fresh access token + account for the shared system mailbox, or null. */
export async function getActiveSharedConnection(): Promise<ActiveConnection | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(TABLE).select('*').eq('is_shared', true).maybeSingle();
  if (!data) return null;
  return activate(data as DbRow);
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
