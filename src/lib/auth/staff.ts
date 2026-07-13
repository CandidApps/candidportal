import { getMyRole, type AppRole } from '@/lib/auth/roles';

export function isMarketingStaffRole(role: AppRole): boolean {
  return role === 'admin' || role === 'agent';
}

export async function canAccessMarketingHub(): Promise<boolean> {
  return isMarketingStaffRole(await getMyRole());
}

export async function canManageMarketingHub(): Promise<boolean> {
  return (await getMyRole()) === 'admin';
}

export async function requireMarketingHubAccess(): Promise<AppRole> {
  const role = await getMyRole();
  if (!isMarketingStaffRole(role)) {
    throw new Error('Not authorized');
  }
  return role;
}
