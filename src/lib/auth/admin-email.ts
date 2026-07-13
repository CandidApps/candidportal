/** Interim rule: @candid.solutions addresses use the admin shell until profile roles are fully wired. */
export function isCandidAdminEmail(email: string): boolean {
  const parts = email.trim().toLowerCase().split("@");
  if (parts.length !== 2) return false;
  return parts[1] === "candid.solutions";
}

export function resolveAppRoleFromEmail(
  email: string,
  profileRole?: string | null
): "user" | "admin" | "agent" {
  if (profileRole === "admin") return "admin";
  if (profileRole === "agent") return "agent";
  if (isCandidAdminEmail(email)) return "admin";
  return "user";
}
