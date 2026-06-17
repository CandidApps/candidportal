import { createSupabaseBrowserClient } from '@/lib/supabase/browser';

export type MemberProfileFlags = {
  welcomeSeen: boolean;
  analysisUnlocked: boolean;
};

export async function fetchMemberProfileFlags(userId: string): Promise<MemberProfileFlags> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from('profiles')
    .select('welcome_seen_at, analysis_unlocked_at')
    .eq('id', userId)
    .maybeSingle();

  if (error) {
    console.error('fetchMemberProfileFlags', error);
    return { welcomeSeen: false, analysisUnlocked: false };
  }

  return {
    welcomeSeen: Boolean(data?.welcome_seen_at),
    analysisUnlocked: Boolean(data?.analysis_unlocked_at),
  };
}

export async function markWelcomeSeenInDb(userId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from('profiles')
    .update({ welcome_seen_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) console.error('markWelcomeSeenInDb', error);
}

export async function unlockAnalysisInDb(userId: string): Promise<void> {
  const supabase = createSupabaseBrowserClient();
  const { error } = await supabase
    .from('profiles')
    .update({ analysis_unlocked_at: new Date().toISOString() })
    .eq('id', userId);

  if (error) console.error('unlockAnalysisInDb', error);
}
