export type DataPersistenceMode = 'local' | 'supabase';

export const RUNTIME_PERSISTENCE_KEY = 'candid-data-persistence-mode';

function envPersistenceMode(): DataPersistenceMode {
  const raw = process.env.NEXT_PUBLIC_DATA_PERSISTENCE?.trim().toLowerCase();
  return raw === 'supabase' ? 'supabase' : 'local';
}

/** Where app-created test data is stored (services, bill reviews, uploads). */
export function getDataPersistenceMode(): DataPersistenceMode {
  if (typeof window !== 'undefined') {
    // Admins work in local browser storage by default. Ignore older runtime
    // overrides so a stale "database" selection cannot silently change writes.
    localStorage.removeItem(RUNTIME_PERSISTENCE_KEY);
    return 'local';
  }
  return envPersistenceMode();
}

export function isLocalPersistence(): boolean {
  return getDataPersistenceMode() === 'local';
}

export function setRuntimePersistenceMode(mode: DataPersistenceMode): void {
  if (typeof window === 'undefined') return;
  if (mode === 'local') {
    localStorage.removeItem(RUNTIME_PERSISTENCE_KEY);
  }
  window.location.reload();
}
