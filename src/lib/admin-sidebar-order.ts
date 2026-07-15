export const ADMIN_MAIN_NAV_IDS = [
  'assistant',
  'tickets',
  'customers',
  'leads',
  'agents',
  'commissions',
  'partners',
  'marketinghub',
  'outreach',
  'messages',
] as const;

export type AdminMainNavId = (typeof ADMIN_MAIN_NAV_IDS)[number];

export type AdminSidebarPreferences = {
  order: AdminMainNavId[];
  hidden: AdminMainNavId[];
};

const STORAGE_KEY = 'candid:admin-sidebar-prefs';

function isAdminMainNavId(value: string): value is AdminMainNavId {
  return (ADMIN_MAIN_NAV_IDS as readonly string[]).includes(value);
}

export function defaultAdminSidebarOrder(): AdminMainNavId[] {
  return [...ADMIN_MAIN_NAV_IDS];
}

export function defaultAdminSidebarPreferences(): AdminSidebarPreferences {
  return { order: defaultAdminSidebarOrder(), hidden: [] };
}

/** Normalize order/hidden so every known id appears once in order and hidden only contains valid ids. */
export function normalizeAdminSidebarPreferences(
  orderInput: unknown,
  hiddenInput: unknown,
): AdminSidebarPreferences {
  const seen = new Set<AdminMainNavId>();
  const order: AdminMainNavId[] = [];
  if (Array.isArray(orderInput)) {
    for (const item of orderInput) {
      if (typeof item !== 'string' || !isAdminMainNavId(item) || seen.has(item)) continue;
      seen.add(item);
      order.push(item);
    }
  }
  for (const id of ADMIN_MAIN_NAV_IDS) {
    if (!seen.has(id)) order.push(id);
  }

  const hiddenSeen = new Set<AdminMainNavId>();
  const hidden: AdminMainNavId[] = [];
  if (Array.isArray(hiddenInput)) {
    for (const item of hiddenInput) {
      if (typeof item !== 'string' || !isAdminMainNavId(item) || hiddenSeen.has(item)) continue;
      hiddenSeen.add(item);
      hidden.push(item);
    }
  }

  return { order, hidden };
}

export function visibleAdminSidebarOrder(prefs: AdminSidebarPreferences): AdminMainNavId[] {
  const hidden = new Set(prefs.hidden);
  return prefs.order.filter((id) => !hidden.has(id));
}

export function loadCachedAdminSidebarPreferences(): AdminSidebarPreferences {
  if (typeof window === 'undefined') return defaultAdminSidebarPreferences();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      // Migrate legacy order-only cache if present
      const legacy = window.localStorage.getItem('candid:admin-sidebar-order');
      if (legacy) {
        const parsed = JSON.parse(legacy) as unknown;
        return normalizeAdminSidebarPreferences(parsed, []);
      }
      return defaultAdminSidebarPreferences();
    }
    const parsed = JSON.parse(raw) as { order?: unknown; hidden?: unknown };
    return normalizeAdminSidebarPreferences(parsed?.order, parsed?.hidden);
  } catch {
    return defaultAdminSidebarPreferences();
  }
}

export function saveCachedAdminSidebarPreferences(prefs: AdminSidebarPreferences): void {
  if (typeof window === 'undefined') return;
  try {
    const normalized = normalizeAdminSidebarPreferences(prefs.order, prefs.hidden);
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(normalized));
  } catch {
    // ignore quota / private mode
  }
}

/** @deprecated Prefer loadCachedAdminSidebarPreferences */
export function loadAdminSidebarOrder(): AdminMainNavId[] {
  return loadCachedAdminSidebarPreferences().order;
}

/** @deprecated Prefer saveCachedAdminSidebarPreferences */
export function saveAdminSidebarOrder(order: AdminMainNavId[]): void {
  const current = loadCachedAdminSidebarPreferences();
  saveCachedAdminSidebarPreferences({ ...current, order: normalizeAdminSidebarPreferences(order, current.hidden).order });
}

export function reorderAdminSidebar(
  order: AdminMainNavId[],
  fromId: AdminMainNavId,
  toId: AdminMainNavId,
): AdminMainNavId[] {
  if (fromId === toId) return order;
  const fromIdx = order.indexOf(fromId);
  const toIdx = order.indexOf(toId);
  if (fromIdx < 0 || toIdx < 0) return order;
  const next = [...order];
  next.splice(fromIdx, 1);
  next.splice(toIdx, 0, fromId);
  return next;
}

export async function fetchAdminSidebarPreferences(): Promise<AdminSidebarPreferences> {
  const res = await fetch('/api/admin/sidebar-preferences');
  if (!res.ok) {
    return loadCachedAdminSidebarPreferences();
  }
  const data = (await res.json()) as { order?: unknown; hidden?: unknown };
  const prefs = normalizeAdminSidebarPreferences(data.order, data.hidden);
  saveCachedAdminSidebarPreferences(prefs);
  return prefs;
}

export async function persistAdminSidebarPreferences(
  prefs: AdminSidebarPreferences,
): Promise<AdminSidebarPreferences> {
  const normalized = normalizeAdminSidebarPreferences(prefs.order, prefs.hidden);
  saveCachedAdminSidebarPreferences(normalized);
  const res = await fetch('/api/admin/sidebar-preferences', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(normalized),
  });
  if (!res.ok) return normalized;
  const data = (await res.json()) as { order?: unknown; hidden?: unknown };
  const saved = normalizeAdminSidebarPreferences(data.order ?? normalized.order, data.hidden ?? normalized.hidden);
  saveCachedAdminSidebarPreferences(saved);
  return saved;
}

export const ADMIN_MAIN_NAV_LABELS: Record<AdminMainNavId, string> = {
  assistant: 'MyAssistant',
  tickets: 'Action Center',
  customers: 'Accounts',
  leads: 'Leads',
  agents: 'Agents & Team',
  commissions: 'Commissions',
  partners: 'Partners',
  marketinghub: 'Marketing Hub',
  outreach: 'Outreach',
  messages: 'Message Center',
};
