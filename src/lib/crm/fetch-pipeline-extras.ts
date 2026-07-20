import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import {
  pipelineExtrasFromAnalysisSnapshot,
  pipelineExtrasFromQuoteRequest,
  type PipelineContractExtras,
} from '@/lib/crm/contract-service-pricing';

/** Fetch quote / analysis extras for lead → contract prefill (client). */
export async function fetchPipelineExtrasForLead(opts: {
  quoteRequestId?: string | null;
  analysisReviewId?: string | null;
}): Promise<PipelineContractExtras> {
  let extras: PipelineContractExtras = {};

  if (opts.quoteRequestId) {
    try {
      const res = await fetch(`/api/admin/quote-requests/${opts.quoteRequestId}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as {
          request?: {
            service_type_id?: string | null;
            service_answers?: Record<string, string | boolean> | null;
          };
        };
        if (data.request) {
          extras = { ...extras, ...pipelineExtrasFromQuoteRequest(data.request) };
        }
      }
    } catch {
      /* ignore */
    }
  }

  if (opts.analysisReviewId) {
    try {
      const res = await fetch(`/api/admin/analysis-reviews/${opts.analysisReviewId}`, {
        cache: 'no-store',
      });
      if (res.ok) {
        const data = (await res.json()) as {
          review?: {
            published_snapshot?: PublishedAnalysisSnapshot | null;
          };
        };
        const snap = data.review?.published_snapshot ?? null;
        const fromAnalysis = pipelineExtrasFromAnalysisSnapshot(snap);
        extras = {
          ...extras,
          ...fromAnalysis,
          merchantPricing: fromAnalysis.merchantPricing ?? extras.merchantPricing,
          pricingStructureId: fromAnalysis.pricingStructureId ?? extras.pricingStructureId,
          estimatedMonthly: fromAnalysis.estimatedMonthly ?? extras.estimatedMonthly,
          serviceTypeId: fromAnalysis.serviceTypeId ?? extras.serviceTypeId,
        };
      }
    } catch {
      /* ignore */
    }
  }

  return extras;
}
