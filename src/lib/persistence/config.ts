export type DataPersistenceMode = 'local' | 'supabase';

export const RUNTIME_PERSISTENCE_KEY = 'candid-data-persistence-mode';

function envPersistenceMode(): DataPersistenceMode {
  const raw = process.env.NEXT_PUBLIC_DATA_PERSISTENCE?.trim().toLowerCase();
  return raw === 'local' ? 'local' : 'supabase';
}

/** Where app-created test data is stored (services, bill reviews, uploads). */
export function getDataPersistenceMode(): DataPersistenceMode {
  if (typeof window !== 'undefined') {
    const runtime = localStorage.getItem(RUNTIME_PERSISTENCE_KEY);
    if (runtime === 'local' || runtime === 'supabase') return runtime;
  }
  return envPersistenceMode();
}

export function isLocalPersistence(): boolean {
  return getDataPersistenceMode() === 'local';
}

export function setRuntimePersistenceMode(mode: DataPersistenceMode): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(RUNTIME_PERSISTENCE_KEY, mode);
  window.location.reload();
}
