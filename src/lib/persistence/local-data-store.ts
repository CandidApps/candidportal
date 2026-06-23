import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import type { AccountServiceRow } from '@/lib/services/account-services';

export const LOCAL_PERSISTENCE_STORAGE_KEY = 'candid-local-persistence-v1';

export type BillFingerprintRow = {
  id: string;
  user_id: string;
  fingerprint: string;
  original_filename: string | null;
  created_at: string;
};

export type LocalPersistenceSnapshot = {
  version: 1;
  account_services: AccountServiceRow[];
  bill_analysis_reviews: BillAnalysisReviewRow[];
  bill_upload_fingerprints: BillFingerprintRow[];
};

function emptySnapshot(): LocalPersistenceSnapshot {
  return {
    version: 1,
    account_services: [],
    bill_analysis_reviews: [],
    bill_upload_fingerprints: [],
  };
}

function readSnapshot(): LocalPersistenceSnapshot {
  if (typeof window === 'undefined') return emptySnapshot();
  try {
    const raw = localStorage.getItem(LOCAL_PERSISTENCE_STORAGE_KEY);
    if (!raw) return emptySnapshot();
    const parsed = JSON.parse(raw) as LocalPersistenceSnapshot;
    return {
      version: 1,
      account_services: parsed.account_services ?? [],
      bill_analysis_reviews: parsed.bill_analysis_reviews ?? [],
      bill_upload_fingerprints: parsed.bill_upload_fingerprints ?? [],
    };
  } catch {
    return emptySnapshot();
  }
}

function writeSnapshot(snapshot: LocalPersistenceSnapshot): void {
  if (typeof window === 'undefined') return;
  localStorage.setItem(LOCAL_PERSISTENCE_STORAGE_KEY, JSON.stringify(snapshot));
}

export function clearLocalPersistenceData(): void {
  if (typeof window === 'undefined') return;
  localStorage.removeItem(LOCAL_PERSISTENCE_STORAGE_KEY);
}

export function getLocalPersistenceSnapshot(): LocalPersistenceSnapshot {
  return readSnapshot();
}

export function getLocalPersistenceCounts(): {
  services: number;
  reviews: number;
  fingerprints: number;
} {
  const snap = readSnapshot();
  return {
    services: snap.account_services.length,
    reviews: snap.bill_analysis_reviews.length,
    fingerprints: snap.bill_upload_fingerprints.length,
  };
}

export function newLocalId(): string {
  if (typeof crypto !== 'undefined' && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `local-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function listLocalAccountServices(userId: string): AccountServiceRow[] {
  return readSnapshot()
    .account_services.filter((r) => r.user_id === userId)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function insertLocalAccountService(row: AccountServiceRow): AccountServiceRow {
  const snap = readSnapshot();
  snap.account_services = [row, ...snap.account_services.filter((r) => r.id !== row.id)];
  writeSnapshot(snap);
  return row;
}

export function updateLocalAccountService(
  id: string,
  patch: Partial<AccountServiceRow>,
): AccountServiceRow | null {
  const snap = readSnapshot();
  const idx = snap.account_services.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const updated = {
    ...snap.account_services[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  snap.account_services[idx] = updated;
  writeSnapshot(snap);
  return updated;
}

export function deleteLocalAccountService(id: string): void {
  const snap = readSnapshot();
  snap.account_services = snap.account_services.filter((r) => r.id !== id);
  snap.bill_analysis_reviews = snap.bill_analysis_reviews.filter(
    (r) => r.account_service_id !== id,
  );
  writeSnapshot(snap);
}

export function listLocalAnalysisReviews(filter?: {
  userId?: string;
  status?: string;
}): BillAnalysisReviewRow[] {
  let rows = readSnapshot().bill_analysis_reviews;
  if (filter?.userId) rows = rows.filter((r) => r.user_id === filter.userId);
  if (filter?.status && filter.status !== 'all') {
    rows = rows.filter((r) => r.status === filter.status);
  }
  return [...rows].sort((a, b) => b.created_at.localeCompare(a.created_at));
}

export function getLocalAnalysisReview(id: string): BillAnalysisReviewRow | null {
  return readSnapshot().bill_analysis_reviews.find((r) => r.id === id) ?? null;
}

export function insertLocalAnalysisReview(review: BillAnalysisReviewRow): BillAnalysisReviewRow {
  const snap = readSnapshot();
  snap.bill_analysis_reviews = [
    review,
    ...snap.bill_analysis_reviews.filter((r) => r.id !== review.id),
  ];
  writeSnapshot(snap);
  return review;
}

export function updateLocalAnalysisReview(
  id: string,
  patch: Partial<BillAnalysisReviewRow>,
): BillAnalysisReviewRow | null {
  const snap = readSnapshot();
  const idx = snap.bill_analysis_reviews.findIndex((r) => r.id === id);
  if (idx < 0) return null;
  const updated = {
    ...snap.bill_analysis_reviews[idx],
    ...patch,
    updated_at: new Date().toISOString(),
  };
  snap.bill_analysis_reviews[idx] = updated;
  writeSnapshot(snap);
  return updated;
}

export function listLocalReviewsForServiceIds(ids: string[]): BillAnalysisReviewRow[] {
  const set = new Set(ids);
  return readSnapshot().bill_analysis_reviews.filter((r) => set.has(r.id));
}

export function isLocalDuplicateBill(userId: string, fingerprint: string): boolean {
  return readSnapshot().bill_upload_fingerprints.some(
    (r) => r.user_id === userId && r.fingerprint === fingerprint,
  );
}

export function saveLocalBillFingerprint(
  userId: string,
  fingerprint: string,
  originalFilename?: string,
): void {
  const snap = readSnapshot();
  if (
    snap.bill_upload_fingerprints.some(
      (r) => r.user_id === userId && r.fingerprint === fingerprint,
    )
  ) {
    return;
  }
  snap.bill_upload_fingerprints.push({
    id: newLocalId(),
    user_id: userId,
    fingerprint,
    original_filename: originalFilename ?? null,
    created_at: new Date().toISOString(),
  });
  writeSnapshot(snap);
}
