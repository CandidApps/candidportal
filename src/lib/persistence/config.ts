export type DataPersistenceMode = 'local' | 'supabase';

export const RUNTIME_PERSISTENCE_KEY = 'candid-data-persistence-mode';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function envPersistenceMode(): DataPersistenceMode {
  const raw = process.env.NEXT_PUBLIC_DATA_PERSISTENCE?.trim().toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'local';
}

/** True when the app is running in a local dev browser (not production/staging hosts). */
export function isLocalhostClient(): boolean {
  if (typeof window === 'undefined') return false;
  return LOCALHOST_HOSTNAMES.has(window.location.hostname);
}

/** Where app-created test data is stored (services, bill reviews, uploads). */
export function getDataPersistenceMode(): DataPersistenceMode {
  if (typeof window !== 'undefined') {
    // Admins work in local browser storage on localhost only. Ignore older runtime
    // overrides so a stale "database" selection cannot silently change writes.
    localStorage.removeItem(RUNTIME_PERSISTENCE_KEY);
    return isLocalhostClient() ? 'local' : 'supabase';
  }

  // Server: local persistence is only for local development builds.
  if (process.env.NODE_ENV === 'production') {
    return 'supabase';
  }

  return envPersistenceMode();
}

export function isLocalPersistence(): boolean {
  return getDataPersistenceMode() === 'local';
}

/** Admin sidebar local-storage controls (push local → DB, status banner). */
export function showLocalPersistenceControls(): boolean {
  return isLocalPersistence();
}

export function setRuntimePersistenceMode(mode: DataPersistenceMode): void {
  if (typeof window === 'undefined') return;
  if (!isLocalhostClient()) return;
  if (mode === 'local') {
    localStorage.removeItem(RUNTIME_PERSISTENCE_KEY);
  }
  window.location.reload();
}

export function isLocalhostRequestHost(hostHeader: string | null): boolean {
  const hostname = (hostHeader ?? '').split(':')[0]?.trim().toLowerCase();
  return LOCALHOST_HOSTNAMES.has(hostname);
}
