export type MemberProfileFlags = {
  welcomeSeen: boolean;
  analysisUnlocked: boolean;
};

export async function fetchMemberProfileFlags(_userId: string): Promise<MemberProfileFlags> {
  try {
    const res = await fetch('/api/portal/profile-flags', { cache: 'no-store' });
    if (!res.ok) {
      return { welcomeSeen: false, analysisUnlocked: false };
    }
    return (await res.json()) as MemberProfileFlags;
  } catch {
    return { welcomeSeen: false, analysisUnlocked: false };
  }
}

export async function markWelcomeSeenInDb(_userId: string): Promise<void> {
  try {
    await fetch('/api/portal/profile-flags', { method: 'POST' });
  } catch {
    /* ignore */
  }
}

export async function unlockAnalysisInDb(_userId: string): Promise<void> {
  try {
    const res = await fetch('/api/portal/profile-flags', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ analysisUnlocked: true }),
    });
    if (!res.ok) {
      console.error('unlockAnalysisInDb', await res.text().catch(() => res.statusText));
    }
  } catch (err) {
    console.error('unlockAnalysisInDb', err);
  }
}
