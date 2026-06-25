import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { decryptSecret, encryptSecret } from '@/lib/email/crypto';
import { getPrimaryAccount, refreshAccessToken } from '@/lib/email/zoho';

const TABLE = 'zoho_connections';

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
}

export async function getConnectionForUser(userId: string): Promise<ZohoConnectionRow | null> {
  const admin = createSupabaseAdminClient();
  const { data } = await admin.from(TABLE).select('*').eq('user_id', userId).maybeSingle();
  return data ? toRow(data as DbRow) : null;
}

export async function deleteConnection(userId: string): Promise<void> {
  const admin = createSupabaseAdminClient();
  await admin.from(TABLE).delete().eq('user_id', userId);
}

type ActiveConnection = { accessToken: string; accountId: string; email: string };

async function activate(row: DbRow): Promise<ActiveConnection> {
  const refreshToken = decryptSecret(row.refresh_token_enc);
  const accessToken = await refreshAccessToken(refreshToken);
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
  return { accessToken, accountId, email };
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
