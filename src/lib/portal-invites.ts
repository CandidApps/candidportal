/** Set to "true" in production when ready to email portal magic links. Off by default. */
export function portalInvitesEnabled(): boolean {
  return process.env.NEXT_PUBLIC_PORTAL_INVITES_ENABLED === 'true';
}

export function portalInvitesDisabledNotice(): string {
  return 'Invite emails are off in this environment. Access is saved — set NEXT_PUBLIC_PORTAL_INVITES_ENABLED=true to send.';
}
