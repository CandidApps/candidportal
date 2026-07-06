export const ACTION_CENTER_REFRESH_EVENT = 'candid:action-center-refresh';

/** Hint open admin tabs to reload Action Center queues (e.g. after a portal submission). */
export function notifyActionCenterRefresh(): void {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent(ACTION_CENTER_REFRESH_EVENT));
}
