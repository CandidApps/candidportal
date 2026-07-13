import type { LocalPersistenceSnapshot } from '@/lib/persistence/local-data-store';

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function needsIdRemap(id: string): boolean {
  return id.startsWith('local-') || !UUID_RE.test(id);
}

function remapId(id: string, idMap: Map<string, string>): string {
  if (!needsIdRemap(id)) return id;
  const existing = idMap.get(id);
  if (existing) return existing;
  const next = crypto.randomUUID();
  idMap.set(id, next);
  return next;
}

function sanitizeStoragePath(path: string | null): string | null {
  if (!path || path.startsWith('local://')) return null;
  return path;
}

type SupabaseWriter = {
  from: (table: string) => {
    upsert: (
      row: Record<string, unknown>,
      options?: { onConflict?: string },
    ) => PromiseLike<{ error: { message: string } | null }>;
    update: (patch: Record<string, unknown>) => {
      eq: (col: string, val: string) => PromiseLike<{ error: { message: string } | null }>;
    };
  };
};

export type PushLocalResult = {
  services: number;
  reviews: number;
  fingerprints: number;
  skippedBillPaths: number;
};

export async function pushLocalSnapshotToDatabase(
  admin: SupabaseWriter,
  snapshot: LocalPersistenceSnapshot,
  options?: { userIdFilter?: string },
): Promise<PushLocalResult> {
  const idMap = new Map<string, string>();
  let skippedBillPaths = 0;

  const services = options?.userIdFilter
    ? snapshot.account_services.filter((r) => r.user_id === options.userIdFilter)
    : snapshot.account_services;
  const reviews = options?.userIdFilter
    ? snapshot.bill_analysis_reviews.filter((r) => r.user_id === options.userIdFilter)
    : snapshot.bill_analysis_reviews;
  const fingerprints = options?.userIdFilter
    ? snapshot.bill_upload_fingerprints.filter((r) => r.user_id === options.userIdFilter)
    : snapshot.bill_upload_fingerprints;

  for (const svc of services) {
    const id = remapId(svc.id, idMap);
    if (svc.bill_storage_path?.startsWith('local://')) skippedBillPaths += 1;
    if (svc.contract_storage_path?.startsWith('local://')) skippedBillPaths += 1;
    const { error } = await admin.from('account_services').upsert(
      {
        id,
        user_id: svc.user_id,
        name: svc.name,
        vendor: svc.vendor,
        status: svc.status,
        monthly_amount_cents: svc.monthly_amount_cents,
        expires_at: svc.expires_at,
        logo_key: svc.logo_key,
        bill_storage_path: sanitizeStoragePath(svc.bill_storage_path),
        service_type: svc.service_type,
        merchant_analysis: svc.merchant_analysis,
        analysis_snapshot: svc.analysis_snapshot,
        analysis_review_id: null,
        candid_managed: svc.candid_managed,
        savings_opportunity_only: svc.savings_opportunity_only,
        service_description: svc.service_description,
        user_count: svc.user_count,
        renewal_terms: svc.renewal_terms,
        interested_in_alternatives: svc.interested_in_alternatives,
        contract_start_date: svc.contract_start_date,
        contract_storage_path: sanitizeStoragePath(svc.contract_storage_path),
        contract_filename: svc.contract_filename,
        created_at: svc.created_at,
        updated_at: svc.updated_at,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`account_services: ${error.message}`);
  }

  for (const review of reviews) {
    const id = remapId(review.id, idMap);
    const accountServiceId = review.account_service_id
      ? remapId(review.account_service_id, idMap)
      : null;
    if (review.bill_storage_path?.startsWith('local://')) skippedBillPaths += 1;

    const { error } = await admin.from('bill_analysis_reviews').upsert(
      {
        id,
        user_id: review.user_id,
        account_service_id: accountServiceId,
        crm_customer_id: review.crm_customer_id ?? null,
        customer_email: review.customer_email,
        customer_name: review.customer_name,
        vendor_name: review.vendor_name,
        filename: review.filename,
        bill_storage_path: sanitizeStoragePath(review.bill_storage_path),
        detected_category: review.detected_category,
        category_label: review.category_label,
        detected_categories: review.detected_categories,
        parse_result: review.parse_result,
        draft_snapshot: review.draft_snapshot,
        published_snapshot: review.published_snapshot,
        matched_provider_slug: review.matched_provider_slug,
        status: review.status,
        admin_notes: review.admin_notes,
        submitted_at: review.submitted_at,
        submitted_by: review.submitted_by,
        customer_notified_at: review.customer_notified_at,
        created_at: review.created_at,
        updated_at: review.updated_at,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`bill_analysis_reviews: ${error.message}`);
  }

  for (const svc of services) {
    if (!svc.analysis_review_id) continue;
    const serviceId = remapId(svc.id, idMap);
    const reviewId = remapId(svc.analysis_review_id, idMap);
    const { error } = await admin
      .from('account_services')
      .update({ analysis_review_id: reviewId, updated_at: svc.updated_at })
      .eq('id', serviceId);
    if (error) throw new Error(`account_services link: ${error.message}`);
  }

  for (const fp of fingerprints) {
    const id = remapId(fp.id, idMap);
    const { error } = await admin.from('bill_upload_fingerprints').upsert(
      {
        id,
        user_id: fp.user_id,
        fingerprint: fp.fingerprint,
        original_filename: fp.original_filename,
        created_at: fp.created_at,
      },
      { onConflict: 'id' },
    );
    if (error) throw new Error(`bill_upload_fingerprints: ${error.message}`);
  }

  return {
    services: services.length,
    reviews: reviews.length,
    fingerprints: fingerprints.length,
    skippedBillPaths,
  };
}
