export type DataPersistenceMode = 'local' | 'supabase';

export const RUNTIME_PERSISTENCE_KEY = 'candid-data-persistence-mode';

const LOCALHOST_HOSTNAMES = new Set(['localhost', '127.0.0.1', '[::1]']);

function envPersistenceMode(): DataPersistenceMode {
  const raw = process.env.NEXT_PUBLIC_DATA_PERSISTENCE?.trim().toLowerCase();
  // Default supabase so local dev reads/writes the same data as production.
  // Set NEXT_PUBLIC_DATA_PERSISTENCE=local for isolated browser-only testing.
  return raw === 'local' ? 'local' : 'supabase';
}

/** True when the app is running in a local dev browser (not production/staging hosts). */
export function isLocalhostClient(): boolean {
  if (typeof window === 'undefined') return false;
  return LOCALHOST_HOSTNAMES.has(window.location.hostname);
}

/** Where app-created test data is stored (services, bill reviews, uploads, leads). */
export function getDataPersistenceMode(): DataPersistenceMode {
  if (typeof window !== 'undefined') {
    // Ignore stale runtime overrides; env is the single source of truth.
    localStorage.removeItem(RUNTIME_PERSISTENCE_KEY);
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
