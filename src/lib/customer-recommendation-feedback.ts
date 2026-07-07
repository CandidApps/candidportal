export type RecommendationFeedbackVote = 'up' | 'down';

export type RecommendationFeedbackRecord = {
  customerId: string;
  actionId: string;
  vote: RecommendationFeedbackVote;
  note?: string;
  actionTitle: string;
  createdAt: string;
};

const STORAGE_KEY = 'candid-recommendation-feedback-v1';

function readAll(): RecommendationFeedbackRecord[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? (JSON.parse(raw) as RecommendationFeedbackRecord[]) : [];
  } catch {
    return [];
  }
}

function writeAll(rows: RecommendationFeedbackRecord[]): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(STORAGE_KEY, JSON.stringify(rows.slice(0, 500)));
}

export function getRecommendationFeedback(
  customerId: string,
  actionId: string,
): RecommendationFeedbackRecord | null {
  return (
    readAll().find((r) => r.customerId === customerId && r.actionId === actionId) ?? null
  );
}

export function setRecommendationFeedback(input: {
  customerId: string;
  actionId: string;
  actionTitle: string;
  vote: RecommendationFeedbackVote;
  note?: string;
}): RecommendationFeedbackRecord {
  const rows = readAll().filter(
    (r) => !(r.customerId === input.customerId && r.actionId === input.actionId),
  );
  const record: RecommendationFeedbackRecord = {
    customerId: input.customerId,
    actionId: input.actionId,
    actionTitle: input.actionTitle,
    vote: input.vote,
    note: input.note?.trim() || undefined,
    createdAt: new Date().toISOString(),
  };
  rows.unshift(record);
  writeAll(rows);
  return record;
}

export async function submitNegativeFeedbackToTraining(input: {
  customerId: string;
  companyName: string;
  actionTitle: string;
  note?: string;
}): Promise<void> {
  const body = [
    `Customer: ${input.companyName} (${input.customerId})`,
    `Recommendation: ${input.actionTitle}`,
    input.note ? `Why not helpful: ${input.note}` : 'Marked not helpful from AI Recommendations.',
  ].join('\n');

  await fetch('/api/admin/assistant/context', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      subject: `Recommendation feedback — ${input.companyName}`,
      info: body,
      scope: 'team',
    }),
  }).catch(() => undefined);
}
