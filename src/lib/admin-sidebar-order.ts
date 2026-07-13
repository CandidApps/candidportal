export const ADMIN_MAIN_NAV_IDS = [
  'assistant',
  'tickets',
  'customers',
  'leads',
  'agents',
  'commissions',
  'partners',
  'marketinghub',
  'messages',
] as const;

export type AdminMainNavId = (typeof ADMIN_MAIN_NAV_IDS)[number];

const STORAGE_KEY = 'candid:admin-sidebar-order';

function isAdminMainNavId(value: string): value is AdminMainNavId {
  return (ADMIN_MAIN_NAV_IDS as readonly string[]).includes(value);
}

export function defaultAdminSidebarOrder(): AdminMainNavId[] {
  return [...ADMIN_MAIN_NAV_IDS];
}

export function loadAdminSidebarOrder(): AdminMainNavId[] {
  if (typeof window === 'undefined') return defaultAdminSidebarOrder();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return defaultAdminSidebarOrder();
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return defaultAdminSidebarOrder();
    const seen = new Set<AdminMainNavId>();
    const order: AdminMainNavId[] = [];
    for (const item of parsed) {
      if (typeof item !== 'string' || !isAdminMainNavId(item) || seen.has(item)) continue;
      seen.add(item);
      order.push(item);
    }
    for (const id of ADMIN_MAIN_NAV_IDS) {
      if (!seen.has(id)) order.push(id);
    }
    return order;
  } catch {
    return defaultAdminSidebarOrder();
  }
}

export function saveAdminSidebarOrder(order: AdminMainNavId[]): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(order));
  } catch {
    // ignore quota / private mode
  }
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
