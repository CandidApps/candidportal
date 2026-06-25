'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { BillAnalysisReviewRow, PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import {
  buildPricingStructureOptions,
  DEFAULT_DUAL_CUSTOMER_FEE_PCT,
  normalizePricingStructureSelection,
} from '@/lib/analysis/pricing-structure-options';
import { PricingStructuresPanel } from '@/components/admin/PricingStructuresPanel';
import type { MerchantAnalysisProvider, CurrentFeeLine, PricingStructureOption } from '@/lib/analysis/types';
import { formatReviewTime } from '@/lib/services/analysis-reviews';
import {
  formatCategoriesLabel,
  normalizeReviewCategories,
  reviewNeedsProposalDocument,
  reviewUsesMerchantFeeTools,
  type ProviderCategory,
} from '@/lib/provider-categories';
import { CategoryMultiSelect } from '@/components/admin/CategoryMultiSelect';
import { ProposalUploadPanel } from '@/components/admin/ProposalUploadPanel';
import { UcaasQuoteBuilder } from '@/components/admin/UcaasQuoteBuilder';
import { reviewUsesUcaasQuote } from '@/lib/provider-categories';
import type { UcaasQuoteSnapshot } from '@/lib/ucaas/types';
import { SupplierRateLinesTable } from '@/components/suppliers/SupplierRateLinesTable';
import { CurrentFeesReviewTable } from '@/components/admin/CurrentFeesReviewTable';
import { buildCurrentFeeLines } from '@/lib/analysis/current-fee-breakdown';
import { newScheduleALine, type ScheduleARateLine } from '@/lib/schedule-a-types';
import { calcProviderSavingsQuotes } from '@/lib/analysis/our-rate-savings';
import { fmt$ } from '@/lib/candid-pay/pricingEngine';
import type { Customer } from '@/components/CustomersView';
import { findCustomerByContactEmail } from '@/lib/crm/customer-lookup';
import type { RateTemplateRecord } from '@/lib/rate-template-types';
import { fetchProviderRateTemplates } from '@/lib/rate-templates';
import { fetchAdminAnalysisReviewDetail, patchAnalysisReview } from '@/lib/submit-bill-analysis';
import { ActionWorkBar } from '@/components/admin/ActionWorkBar';
import { TeamNotesPanel } from '@/components/admin/TeamNotesPanel';
import { buildActionKey } from '@/lib/admin-action-work';

export function AnalysisReviewDetailPanel({
  reviewId,
  onClose,
  onPublished,
  onDraftSaved,
  customers = [],
  onOpenCustomer,
  currentUserId,
  onActionWorkUpdated,
  assignees,
}: {
  reviewId: string;
  onClose: () => void;
  onPublished?: () => void;
  onDraftSaved?: () => void;
  customers?: Customer[];
  onOpenCustomer?: (customerId: string) => void;
  currentUserId?: string;
  onActionWorkUpdated?: () => void;
  assignees?: import('@/lib/admin-action-work').ActionAssignee[];
}) {
  const [review, setReview] = useState<BillAnalysisReviewRow | null>(null);
  const [draft, setDraft] = useState<PublishedAnalysisSnapshot | null>(null);
  const [providers, setProviders] = useState<MerchantAnalysisProvider[]>([]);
  const [ourRateLines, setOurRateLines] = useState<ScheduleARateLine[]>([]);
  const [appliedRateLines, setAppliedRateLines] = useState<ScheduleARateLine[]>([]);
  const [scheduleRatesDirty, setScheduleRatesDirty] = useState(false);
  const [ratesApplyNotice, setRatesApplyNotice] = useState('');
  const [pricingStructureOptions, setPricingStructureOptions] = useState<PricingStructureOption[]>([]);
  const [dualPricingCustomerFeePct, setDualPricingCustomerFeePct] = useState(DEFAULT_DUAL_CUSTOMER_FEE_PCT);
  const [adminMessage, setAdminMessage] = useState('');
  const [adminNotes, setAdminNotes] = useState('');
  const [vendorNameInput, setVendorNameInput] = useState('');
  const [savedVendorName, setSavedVendorName] = useState('');
  const [vendorSaving, setVendorSaving] = useState(false);
  const [vendorSaveNotice, setVendorSaveNotice] = useState('');
  const [selectedProvider, setSelectedProvider] = useState('');
  const [rateTemplates, setRateTemplates] = useState<RateTemplateRecord[]>([]);
  const [selectedRateTemplateId, setSelectedRateTemplateId] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [selectedCategories, setSelectedCategories] = useState<ProviderCategory[]>(['other']);
  const [categoriesDirty, setCategoriesDirty] = useState(false);
  const [highlightedRateLineId, setHighlightedRateLineId] = useState<string | null>(null);
  const rateScheduleRef = useRef<HTMLDivElement>(null);
  const pricingStructuresRef = useRef<HTMLDivElement>(null);

  const merchantStatement = review?.parse_result.merchantStatement;

  const currentFeeLines = useMemo((): CurrentFeeLine[] => {
    if (!merchantStatement) return [];
    return buildCurrentFeeLines([merchantStatement], ourRateLines);
  }, [merchantStatement, ourRateLines]);

  const matchedRateLineIds = useMemo(() => {
    const ids = new Set<string>();
    for (const line of currentFeeLines) {
      if (line.matchedRateLineId) ids.add(line.matchedRateLineId);
    }
    return ids;
  }, [currentFeeLines]);

  const matchedFeeLabelByLineId = useMemo(() => {
    const map = new Map<string, string>();
    for (const line of currentFeeLines) {
      if (line.matchedRateLineId) {
        map.set(line.matchedRateLineId, line.item);
      }
    }
    return map;
  }, [currentFeeLines]);

  const navigateToRateLine = useCallback((rateLineId: string) => {
    setHighlightedRateLineId(rateLineId);
    rateScheduleRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, []);

  useEffect(() => {
    if (!highlightedRateLineId) return;
    const el = document.getElementById(`schedule-rate-line-${highlightedRateLineId}`);
    el?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    const timer = window.setTimeout(() => setHighlightedRateLineId(null), 2800);
    return () => window.clearTimeout(timer);
  }, [highlightedRateLineId]);

  const applyDraftSnapshotToState = useCallback(
    (
      reviewRow: BillAnalysisReviewRow,
      suggestion: PublishedAnalysisSnapshot,
      providerList: MerchantAnalysisProvider[],
      options?: { resetDirtyRates?: boolean },
    ) => {
      const merged = {
        ...suggestion,
        vendorName: reviewRow.vendor_name || suggestion.vendorName,
      };
      setReview(reviewRow);
      setDraft(merged);
      const initialLines =
        merged.ourRateLines ??
        reviewRow.draft_snapshot?.ourRateLines ??
        providerList[0]?.lines ??
        [];
      setOurRateLines(initialLines);
      setAppliedRateLines(initialLines);
      if (options?.resetDirtyRates !== false) {
        setScheduleRatesDirty(false);
        setRatesApplyNotice('');
      }
      setSelectedProvider(
        reviewRow.matched_provider_slug ??
          merged.matchedProviderSlug ??
          merged.providerSelection?.providerId ??
          providerList[0]?.id ??
          '',
      );
      setSelectedRateTemplateId(
        merged.rateTemplateId ??
          reviewRow.draft_snapshot?.rateTemplateId ??
          providerList.find(
            (p) =>
              p.id ===
              (reviewRow.matched_provider_slug ??
                merged.matchedProviderSlug ??
                merged.providerSelection?.providerId),
          )?.defaultRateTemplateId ??
          '',
      );
      setAdminMessage(merged.adminMessage ?? reviewRow.draft_snapshot?.adminMessage ?? '');
      setAdminNotes(reviewRow.admin_notes ?? '');
      const loadedVendor = reviewRow.vendor_name ?? '';
      setVendorNameInput(loadedVendor);
      setSavedVendorName(loadedVendor);
      setVendorSaveNotice('');

      const categories = normalizeReviewCategories(
        merged.categories ?? reviewRow.detected_categories,
        reviewRow.detected_category,
      );
      setSelectedCategories(categories);
      setCategoriesDirty(false);

      const dualFee =
        merged.dualPricingCustomerFeePct ??
        reviewRow.draft_snapshot?.dualPricingCustomerFeePct ??
        DEFAULT_DUAL_CUSTOMER_FEE_PCT;
      setDualPricingCustomerFeePct(dualFee);

      const savedPricing =
        merged.pricingStructureOptions ?? reviewRow.draft_snapshot?.pricingStructureOptions;
      const form = merged.merchantAnalysis?.form;
      const risk = merged.providerSelection?.riskTier ?? 'low';
      const selectedIds = normalizePricingStructureSelection(
        merged.selectedPricingStructures ??
          reviewRow.draft_snapshot?.selectedPricingStructures ??
          [],
      );

      if (savedPricing?.length) {
        setPricingStructureOptions(savedPricing);
      } else if (form && initialLines.length) {
        const statements = merged.merchantAnalysis?.statements ?? [];
        setPricingStructureOptions(
          buildPricingStructureOptions(form, initialLines, risk, selectedIds, dualFee, statements),
        );
      } else {
        setPricingStructureOptions([]);
      }
    },
    [],
  );

  const reload = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setError('');
    try {
      const data = await fetchAdminAnalysisReviewDetail(reviewId);
      setProviders(data.providers);
      applyDraftSnapshotToState(data.review, data.draftSuggestion, data.providers);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Load failed');
    } finally {
      setLoading(false);
    }
  }, [reviewId, applyDraftSnapshotToState]);

  useEffect(() => {
    void reload();
  }, [reload]);

  useEffect(() => {
    if (!selectedProvider || loading) return;
    let cancelled = false;
    void (async () => {
      try {
        const templates = await fetchProviderRateTemplates(selectedProvider);
        if (cancelled) return;
        setRateTemplates(templates);
        if (!templates.length) {
          setSelectedRateTemplateId('');
          return;
        }
        setSelectedRateTemplateId((prev) => {
          if (prev && templates.some((t) => t.id === prev)) return prev;
          const fromDraft = draft?.rateTemplateId;
          if (fromDraft && templates.some((t) => t.id === fromDraft)) return fromDraft;
          return templates.find((t) => t.isDefault)?.id ?? templates[0].id;
        });
      } catch {
        if (!cancelled) setRateTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProvider, loading, draft?.rateTemplateId]);

  const selectedRateTemplate = rateTemplates.find((t) => t.id === selectedRateTemplateId) ?? null;

  const providerSelection = draft?.providerSelection;

  const rebuildPricingOptions = useCallback(
    (
      keptIds: string[],
      dualFee: number,
      lines: ScheduleARateLine[] = appliedRateLines,
    ) => {
      if (!draft?.merchantAnalysis || !lines.length) return [];
      return buildPricingStructureOptions(
        draft.merchantAnalysis.form,
        lines,
        providerSelection?.riskTier ?? 'low',
        normalizePricingStructureSelection(keptIds),
        dualFee,
        draft.merchantAnalysis.statements,
      );
    },
    [draft, appliedRateLines, providerSelection?.riskTier],
  );

  const applyProposedRates = useCallback(() => {
    if (!draft?.merchantAnalysis || !ourRateLines.length) return;
    const nextLines = ourRateLines.map((l) => ({ ...l }));
    const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
    const nextOptions = rebuildPricingOptions(kept, dualPricingCustomerFeePct, nextLines);
    setAppliedRateLines(nextLines);
    setPricingStructureOptions(nextOptions);
    setScheduleRatesDirty(false);
    setRatesApplyNotice('Proposed rates applied to customer pricing structures.');
    pricingStructuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  }, [
    draft,
    ourRateLines,
    pricingStructureOptions,
    dualPricingCustomerFeePct,
    rebuildPricingOptions,
  ]);

  const syncRatesForSave = useCallback(() => {
    if (!scheduleRatesDirty || !draft?.merchantAnalysis) {
      return { lines: appliedRateLines, options: pricingStructureOptions };
    }
    const nextLines = ourRateLines.map((l) => ({ ...l }));
    const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
    const nextOptions = rebuildPricingOptions(kept, dualPricingCustomerFeePct, nextLines);
    setAppliedRateLines(nextLines);
    setPricingStructureOptions(nextOptions);
    setScheduleRatesDirty(false);
    return { lines: nextLines, options: nextOptions };
  }, [
    scheduleRatesDirty,
    draft,
    appliedRateLines,
    ourRateLines,
    pricingStructureOptions,
    dualPricingCustomerFeePct,
    rebuildPricingOptions,
  ]);

  const providerQuotes = useMemo(() => {
    if (!draft?.merchantAnalysis || !appliedRateLines.length) return [];
    return calcProviderSavingsQuotes(
      [
        {
          id: selectedProvider || 'draft',
          name: providers.find((p) => p.id === selectedProvider)?.name ?? 'Our rate',
          lines: appliedRateLines,
        },
      ],
      draft.merchantAnalysis.form,
      draft.merchantAnalysis.statements,
    );
  }, [draft, appliedRateLines, selectedProvider, providers]);

  const vendorNameDirty = vendorNameInput.trim() !== savedVendorName;

  const saveVendorName = async () => {
    const trimmed = vendorNameInput.trim();
    if (!trimmed) {
      setError('Vendor name is required');
      return;
    }
    setVendorSaving(true);
    setError('');
    setVendorSaveNotice('');
    try {
      const saved = await patchAnalysisReview(reviewId, {
        status: 'in_progress',
        vendorName: trimmed,
      });
      if (saved.draft_snapshot) {
        applyDraftSnapshotToState(saved, saved.draft_snapshot, providers, { resetDirtyRates: false });
      } else {
        setReview(saved);
        setVendorNameInput(saved.vendor_name);
        setSavedVendorName(saved.vendor_name);
      }
      setVendorSaveNotice('Vendor name saved.');
      onDraftSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save vendor name');
    } finally {
      setVendorSaving(false);
    }
  };

  const patchReview = async (body: Record<string, unknown>, publish = false) => {
    setSaving(true);
    setError('');
    try {
      const { lines: rateLinesForSave, options: pricingOptionsForSave } = syncRatesForSave();
      const quotesForSave =
        draft?.merchantAnalysis && rateLinesForSave.length
          ? calcProviderSavingsQuotes(
              [
                {
                  id: selectedProvider || 'draft',
                  name: providers.find((p) => p.id === selectedProvider)?.name ?? 'Our rate',
                  lines: rateLinesForSave,
                },
              ],
              draft.merchantAnalysis.form,
              draft.merchantAnalysis.statements,
            )
          : providerQuotes;
      const provider = providers.find((p) => p.id === selectedProvider);
      const trimmedVendorName = vendorNameInput.trim();
      const draftForSave = draft
        ? {
            ...draft,
            vendorName: trimmedVendorName || draft.vendorName,
            categories: selectedCategories,
            category: selectedCategories[0],
            categoryLabel: formatCategoriesLabel(selectedCategories),
            categoriesLabel: formatCategoriesLabel(selectedCategories),
            ourRateLines: rateLinesForSave,
            currentFeeLines,
            providerQuotes: quotesForSave,
            pricingStructureOptions: pricingOptionsForSave,
            selectedPricingStructures: pricingOptionsForSave
              .filter((o) => o.selected)
              .map((o) => o.id),
            dualPricingCustomerFeePct,
            matchedProviderSlug: selectedProvider,
            matchedProviderName: provider?.displayName ?? provider?.name,
            rateTemplateId: selectedRateTemplateId || undefined,
            rateTemplateName: selectedRateTemplate?.name,
            adminMessage,
          }
        : undefined;
      const savedReview = await patchAnalysisReview(reviewId, {
        ...(body as Record<string, unknown>),
        ourRateLines: rateLinesForSave,
        matchedProviderSlug: selectedProvider || undefined,
        matchedProviderName: provider?.displayName ?? provider?.name,
        adminMessage,
        adminNotes,
        vendorName: trimmedVendorName || undefined,
        categories: selectedCategories,
        draftSnapshot: draftForSave,
        publish,
      });
      if (savedReview.draft_snapshot) {
        applyDraftSnapshotToState(savedReview, savedReview.draft_snapshot, providers, {
          resetDirtyRates: false,
        });
      } else {
        setReview(savedReview);
        setVendorNameInput(savedReview.vendor_name);
        setSavedVendorName(savedReview.vendor_name);
      }
      setVendorSaveNotice('');
      if (publish) {
        onPublished?.();
        onClose();
        return;
      }
      onDraftSaved?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const applyTemplateLines = useCallback(
    (template: RateTemplateRecord) => {
      const lines = template.lines.map((l) => newScheduleALine(l));
      setOurRateLines(lines);
      setAppliedRateLines(lines);
      setScheduleRatesDirty(false);
      setRatesApplyNotice('');
      if (draft?.merchantAnalysis) {
        const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
        setPricingStructureOptions(rebuildPricingOptions(kept, dualPricingCustomerFeePct, lines));
      }
    },
    [draft, pricingStructureOptions, dualPricingCustomerFeePct, rebuildPricingOptions],
  );

  const onProviderChange = async (slug: string) => {
    setSelectedProvider(slug);
    setError('');
    try {
      const templates = await fetchProviderRateTemplates(slug);
      setRateTemplates(templates);
      const template = templates.find((t) => t.isDefault) ?? templates[0];
      if (template) {
        setSelectedRateTemplateId(template.id);
        applyTemplateLines(template);
      } else {
        setSelectedRateTemplateId('');
        setOurRateLines([]);
        setAppliedRateLines([]);
        setPricingStructureOptions([]);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load rate templates');
    }
  };

  const onRateTemplateChange = (templateId: string) => {
    setSelectedRateTemplateId(templateId);
    const template = rateTemplates.find((t) => t.id === templateId);
    if (template) applyTemplateLines(template);
  };

  const onDualPricingCustomerFeePctChange = (pct: number) => {
    setDualPricingCustomerFeePct(pct);
    const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
    setPricingStructureOptions(rebuildPricingOptions(kept, pct));
  };

  const markScheduleEdited = () => {
    setScheduleRatesDirty(true);
    setRatesApplyNotice('');
  };

  if (loading) {
    return (
      <div className="admin-review-panel">
        <p style={{ padding: 24, color: 'var(--gray)' }}>Loading review…</p>
      </div>
    );
  }

  if (!review) {
    return (
      <div className="admin-review-panel">
        <p style={{ padding: 24, color: 'var(--red)' }}>{error || 'Review not found'}</p>
      </div>
    );
  }

  const isMerchant = reviewUsesMerchantFeeTools(selectedCategories, Boolean(merchantStatement));
  const showUcaasQuote = reviewUsesUcaasQuote(selectedCategories);
  const showProposalUpload = reviewNeedsProposalDocument(selectedCategories);
  const categoriesLabel = formatCategoriesLabel(selectedCategories);
  const linkedCustomer = findCustomerByContactEmail(customers, review.customer_email);
  const contactLabel = [review.customer_name, review.customer_email].filter(Boolean).join(' · ');

  return (
    <div className="admin-review-panel">
      <div className="admin-review-panel-header">
        <div>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', textTransform: 'uppercase' }}>
            Analysis review
          </div>
          <label style={{ display: 'block', marginTop: 8 }}>
            <span style={{ fontSize: 11, color: 'var(--gray)' }}>Vendor / supplier name</span>
            <div className="admin-review-vendor-row">
              <input
                type="text"
                className="sa-input"
                value={vendorNameInput}
                onChange={(e) => {
                  setVendorNameInput(e.target.value);
                  setVendorSaveNotice('');
                }}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && vendorNameDirty && !vendorSaving) {
                    e.preventDefault();
                    void saveVendorName();
                  }
                }}
                style={{
                  flex: 1,
                  minWidth: 0,
                  fontSize: 16,
                  fontWeight: 600,
                }}
              />
              <button
                type="button"
                className="btn-secondary admin-review-vendor-save"
                disabled={vendorSaving || !vendorNameInput.trim() || !vendorNameDirty}
                onClick={() => void saveVendorName()}
              >
                {vendorSaving ? 'Saving…' : 'Save'}
              </button>
            </div>
            {vendorSaveNotice ? (
              <p className="admin-review-vendor-notice">{vendorSaveNotice}</p>
            ) : vendorNameDirty ? (
              <p className="admin-review-vendor-hint">Unsaved changes — click Save to update the vendor name.</p>
            ) : null}
          </label>
          <div className="admin-review-account-meta">
            <div>
              <span className="admin-review-meta-label">Account</span>{' '}
              {linkedCustomer && onOpenCustomer ? (
                <button
                  type="button"
                  className="admin-review-customer-link"
                  onClick={() => onOpenCustomer(linkedCustomer.id)}
                >
                  {linkedCustomer.company}
                </button>
              ) : linkedCustomer ? (
                <strong>{linkedCustomer.company}</strong>
              ) : (
                <span style={{ color: 'var(--gray)' }}>Not linked to an account</span>
              )}
            </div>
            {contactLabel ? (
              <div>
                <span className="admin-review-meta-label">Contact</span> {contactLabel}
              </div>
            ) : null}
            <div>
              <span className="admin-review-meta-label">Categories</span> {categoriesLabel} ·{' '}
              {formatReviewTime(review.created_at)}
            </div>
          </div>
        </div>
        <button type="button" className="btn-secondary" onClick={onClose}>
          Close
        </button>
      </div>

      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Service categories</div>
        </div>
        <div className="card-body">
          <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, lineHeight: 1.55 }}>
            Select every category this bill touches. Merchant Services unlocks fee schedules; other
            categories use a uploaded proposal for the customer.
          </p>
          <CategoryMultiSelect
            value={selectedCategories}
            onChange={(next) => {
              setSelectedCategories(next);
              setCategoriesDirty(true);
            }}
            disabled={saving}
          />
          {categoriesDirty && (
            <p className="admin-review-vendor-hint" style={{ marginTop: 10 }}>
              Unsaved category changes — save draft to apply.
            </p>
          )}
        </div>
      </div>

      {showUcaasQuote && (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-body">
            <UcaasQuoteBuilder
              value={draft?.ucaasQuote}
              defaultCurrentSpend={review.parse_result?.monthlyAmount}
              onChange={(q: UcaasQuoteSnapshot) =>
                setDraft((current) => (current ? { ...current, ucaasQuote: q } : current))
              }
              onRemove={() =>
                setDraft((current) => {
                  if (!current) return current;
                  const next = { ...current };
                  delete next.ucaasQuote;
                  return next;
                })
              }
            />
          </div>
        </div>
      )}

      {showProposalUpload && (
        <ProposalUploadPanel
          reviewId={reviewId}
          proposal={draft?.proposalDocument}
          onUploaded={(doc) => {
            setDraft((current) => (current ? { ...current, proposalDocument: doc } : current));
            onDraftSaved?.();
          }}
          onRemoved={() => {
            setDraft((current) => {
              if (!current) return current;
              const next = { ...current };
              delete next.proposalDocument;
              return next;
            });
            onDraftSaved?.();
          }}
        />
      )}

      {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 12 }}>{error}</p>}

      {isMerchant && providerSelection && (
        <div className="msp-callout msp-callout--info" style={{ marginBottom: 16, textAlign: 'left' }}>
          <strong>Recommended partner:</strong> {providerSelection.providerName}
          <div style={{ fontSize: 12, marginTop: 6, lineHeight: 1.5 }}>{providerSelection.reason}</div>
          {providerSelection.applicableRiskFees.length > 0 && (
            <div style={{ fontSize: 12, marginTop: 8 }}>
              <strong>Risk fees for {providerSelection.riskTier} tier:</strong>{' '}
              {providerSelection.applicableRiskFees.join(' · ')}
            </div>
          )}
          {providerSelection.excludedProviders.length > 0 && (
            <div style={{ fontSize: 11, marginTop: 8, color: 'var(--gray)' }}>
              Excluded:{' '}
              {providerSelection.excludedProviders.map((e) => `${e.name} (${e.reason})`).join('; ')}
            </div>
          )}
        </div>
      )}

      {isMerchant && pricingStructureOptions.length > 0 && (
        <div className="card" style={{ marginBottom: 16 }} ref={pricingStructuresRef}>
          <div className="card-body" style={{ paddingTop: 16, paddingBottom: 16 }}>
            {scheduleRatesDirty && (
              <p className="rate-schedule-dirty-hint">
                Our rate schedule has unsaved edits — click <strong>Update proposed rates</strong> below the schedule
                to refresh these estimates.
              </p>
            )}
            {ratesApplyNotice && !scheduleRatesDirty && (
              <p className="rate-schedule-applied-notice">{ratesApplyNotice}</p>
            )}
            <PricingStructuresPanel
              options={pricingStructureOptions}
              dualPricingCustomerFeePct={dualPricingCustomerFeePct}
              onChange={setPricingStructureOptions}
              onDualPricingCustomerFeePctChange={onDualPricingCustomerFeePctChange}
            />
          </div>
        </div>
      )}

      <div className="admin-review-grid">
        <div className="card">
          <div className="card-header">
            <div className="card-title">
              {isMerchant ? 'Current fees (parsed from statement)' : 'Parsed bill'}
            </div>
          </div>
          <div className="card-body" style={{ fontSize: 13, lineHeight: 1.6 }}>
            <p style={{ marginTop: 0 }}>
              <strong>Categories:</strong> {categoriesLabel} ({review.parse_result.confidence}{' '}
              confidence)
              {review.parse_result.vendorName && (
                <>
                  {' '}
                  · <strong>Processor on bill:</strong> {review.parse_result.vendorName}
                </>
              )}
            </p>
            {isMerchant && currentFeeLines.length > 0 ? (
              <CurrentFeesReviewTable
                lines={currentFeeLines}
                onNavigateToRateLine={navigateToRateLine}
              />
            ) : (
              <>
                {review.parse_result.summary && <p>{review.parse_result.summary}</p>}
                {review.parse_result.monthlyAmount != null && (
                  <p>
                    <strong>Monthly amount:</strong> {fmt$(review.parse_result.monthlyAmount)}
                  </p>
                )}
              </>
            )}
            {review.filename && (
              <p style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 0 }}>
                File: {review.filename}
              </p>
            )}
          </div>
        </div>

        {isMerchant && (
          <div className="card" ref={rateScheduleRef}>
            <div className="card-header">
              <div className="card-title">Our rate schedule</div>
              {matchedRateLineIds.size > 0 && (
                <div className="rate-schedule-match-summary">
                  {matchedRateLineIds.size} line{matchedRateLineIds.size === 1 ? '' : 's'} match current fees
                </div>
              )}
            </div>
            <div className="card-body">
              {providers.length > 0 ? (
                <>
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 10 }}>
                    Partner supplier
                    <select
                      value={selectedProvider}
                      onChange={(e) => void onProviderChange(e.target.value)}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                    >
                      {providers.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.displayName ?? p.name}
                          {providerSelection?.providerId === p.id ? ' (recommended)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  {rateTemplates.length > 0 && (
                    <label style={{ display: 'block', fontSize: 12, marginBottom: 10 }}>
                      Rate template
                      <select
                        value={selectedRateTemplateId}
                        onChange={(e) => onRateTemplateChange(e.target.value)}
                        style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                      >
                        {rateTemplates.map((t) => (
                          <option key={t.id} value={t.id}>
                            {t.name}
                            {t.isDefault ? ' (partner default)' : ''}
                          </option>
                        ))}
                      </select>
                      <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>
                        Loads sell rates from the partner&apos;s saved template. Edit below for this review only, or
                        update templates on the partner&apos;s Our Rate tab.
                      </span>
                    </label>
                  )}
                  <SupplierRateLinesTable
                    lines={ourRateLines}
                    rateColumnLabel="Sell rate"
                    matchedRateLineIds={matchedRateLineIds}
                    matchedFeeLabelByLineId={matchedFeeLabelByLineId}
                    highlightedLineId={highlightedRateLineId}
                    onUpdateLine={(id, patch) => {
                      markScheduleEdited();
                      setOurRateLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
                    }}
                    onRemoveLine={(id) => {
                      markScheduleEdited();
                      setOurRateLines((prev) => prev.filter((l) => l.id !== id));
                    }}
                    emptyMessage="No sell rates on file — add lines or configure Our rate on the supplier."
                  />
                  <div className="rate-schedule-actions">
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12 }}
                      onClick={() => {
                        markScheduleEdited();
                        setOurRateLines((prev) => [...prev, newScheduleALine()]);
                      }}
                    >
                      + Add rate line
                    </button>
                    <button
                      type="button"
                      className={`btn-primary rate-schedule-apply-btn${scheduleRatesDirty ? ' rate-schedule-apply-btn--dirty' : ''}`}
                      disabled={!ourRateLines.length}
                      onClick={applyProposedRates}
                    >
                      Update proposed rates
                    </button>
                  </div>
                  {providerQuotes[0] && (
                    <div className="msp-callout msp-callout--ok" style={{ marginTop: 12 }}>
                      Est. savings: {fmt$(providerQuotes[0].monthlySavings)}/mo ·{' '}
                      {fmt$(providerQuotes[0].annualSavings)}/yr
                    </div>
                  )}
                </>
              ) : (
                <p style={{ fontSize: 13, color: 'var(--gray)' }}>
                  No merchant services partners are flagged for customer analysis with Our rate schedules. Configure a
                  supplier under Partners first.
                </p>
              )}
            </div>
          </div>
        )}
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-body" style={{ display: 'grid', gap: 16 }}>
          <ActionWorkBar
            actionKind="analysis_review"
            sourceId={reviewId}
            currentUserId={currentUserId}
            assignees={assignees}
            onUpdated={onActionWorkUpdated}
          />
          <TeamNotesPanel
            contextType="action"
            contextKey={buildActionKey('analysis_review', reviewId)}
            title="Team notes on this review"
            compact
          />
        </div>
      </div>

      <div className="card" style={{ marginTop: 16 }}>
        <div className="card-header">
          <div className="card-title">Message to customer</div>
        </div>
        <div className="card-body">
          <textarea
            value={adminMessage}
            onChange={(e) => setAdminMessage(e.target.value)}
            rows={3}
            placeholder="Optional note included with the published analysis…"
            style={{ width: '100%', padding: 10, fontSize: 13, borderRadius: 6, border: '1px solid var(--gray-border)' }}
          />
          <label style={{ display: 'block', fontSize: 12, marginTop: 12, color: 'var(--gray)' }}>
            Internal admin notes
            <textarea
              value={adminNotes}
              onChange={(e) => setAdminNotes(e.target.value)}
              rows={2}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8, fontSize: 12 }}
            />
          </label>
        </div>
      </div>

      <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 16 }}>
        <button
          type="button"
          className="btn-secondary"
          disabled={saving}
          onClick={() => void patchReview({ status: 'in_progress' })}
        >
          Save draft
        </button>
        <button
          type="button"
          className="btn-primary"
          disabled={saving || review.status === 'published'}
          onClick={() => void patchReview({ status: 'in_progress' }, true)}
        >
          {saving ? 'Publishing…' : 'Publish to customer'}
        </button>
      </div>
    </div>
  );
}
