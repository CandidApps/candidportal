/** Launch the admin Zoho compose modal from anywhere in the admin shell. */
export type AdminComposeLaunch = {
  to: string;
  subject: string;
  body?: string;
  contextLabel?: string;
};

export const ADMIN_COMPOSE_EVENT = 'candid:admin-zoho-compose';

export function launchAdminZohoCompose(detail: AdminComposeLaunch) {
  if (typeof window === 'undefined') return;
  window.dispatchEvent(new CustomEvent<AdminComposeLaunch>(ADMIN_COMPOSE_EVENT, { detail }));
}
