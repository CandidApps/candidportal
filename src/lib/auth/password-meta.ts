/** Server-safe helpers for password onboarding metadata. */
export function userNeedsPasswordSetup(
  user: { user_metadata?: Record<string, unknown> } | null | undefined,
): boolean {
  if (!user) return false;
  const flag = user.user_metadata?.needs_password_setup;
  return flag === true || flag === 'true';
}
