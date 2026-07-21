'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  buildPricingStructureOptions,
  DEFAULT_DUAL_CUSTOMER_FEE_PCT,
  normalizePricingStructureSelection,
} from '@/lib/analysis/pricing-structure-options';
import { riskTierFromMcc } from '@/lib/analysis/merchant-risk';
import type { MerchantAnalysisProvider, PricingStructureOption } from '@/lib/analysis/types';
import { CategoryMultiSelect } from '@/components/admin/CategoryMultiSelect';
import { PricingStructuresPanel } from '@/components/admin/PricingStructuresPanel';
import { UcaasQuoteBuilder } from '@/components/admin/UcaasQuoteBuilder';
import { InternetQuoteBuilder } from '@/components/internet/InternetQuoteBuilder';
import { MerchantQuoteStatementPanel } from '@/components/admin/MerchantQuoteStatementPanel';
import { SupplierRateLinesTable } from '@/components/suppliers/SupplierRateLinesTable';
import { QUOTE_SERVICE_TYPES } from '@/lib/quote-flow-config';
import {
  detectQuoteServiceTypeId,
  quoteDefaultCurrentSpend,
  quoteServiceToCategories,
} from '@/lib/quotes/quote-request-analysis';
import type { PublishedQuoteSnapshot } from '@/lib/quotes/types';
import type { QuoteRequestRow } from '@/lib/services/quote-requests';
import { serviceTypeLabel } from '@/lib/services/quote-requests';
import {
  categorySupportsFeeAnalysis,
  formatCategoriesLabel,
  normalizeReviewCategories,
  reviewNeedsProposalDocument,
  reviewUsesUcaasQuote,
  type ProviderCategory,
} from '@/lib/provider-categories';
import { fetchProviderRateTemplates } from '@/lib/rate-templates';
import { newScheduleALine, type ScheduleARateLine } from '@/lib/schedule-a-types';
import type { RateTemplateRecord } from '@/lib/rate-template-types';
import { merchantFormForQuote } from '@/lib/quotes/merchant-quote-statement';
import type { StatementData } from '@/lib/candid-pay/statementParser';

export function QuoteRequestPricingSection({
  row,
  draft,
  onDraftChange,
  proposalUrl,
  proposalName,
  onProposalUrlChange,
  onProposalNameChange,
  disabled = false,
}: {
  row: QuoteRequestRow;
  draft: PublishedQuoteSnapshot | null;
  onDraftChange: (next: PublishedQuoteSnapshot) => void;
  proposalUrl: string;
  proposalName: string;
  onProposalUrlChange: (value: string) => void;
  onProposalNameChange: (value: string) => void;
  disabled?: boolean;
}) {
  const detectedServiceId = useMemo(() => detectQuoteServiceTypeId(row), [row]);
  const [serviceTypeId, setServiceTypeId] = useState(
    () => row.service_type_id ?? detectedServiceId ?? 'other',
  );
  const [selectedCategories, setSelectedCategories] = useState<ProviderCategory[]>(() =>
    normalizeReviewCategories(
      draft?.categories ?? quoteServiceToCategories(serviceTypeId),
      quoteServiceToCategories(serviceTypeId)[0],
    ),
  );
  const [providers, setProviders] = useState<MerchantAnalysisProvider[]>([]);
  const [selectedProvider, setSelectedProvider] = useState(draft?.matchedProviderSlug ?? '');
  const [ourRateLines, setOurRateLines] = useState<ScheduleARateLine[]>(draft?.ourRateLines ?? []);
  const [appliedRateLines, setAppliedRateLines] = useState<ScheduleARateLine[]>(draft?.ourRateLines ?? []);
  const [rateTemplates, setRateTemplates] = useState<RateTemplateRecord[]>([]);
  const [selectedRateTemplateId, setSelectedRateTemplateId] = useState('');
  const [pricingStructureOptions, setPricingStructureOptions] = useState<PricingStructureOption[]>(
    draft?.pricingStructureOptions ?? [],
  );
  const [dualPricingCustomerFeePct, setDualPricingCustomerFeePct] = useState(
    draft?.dualPricingCustomerFeePct ?? DEFAULT_DUAL_CUSTOMER_FEE_PCT,
  );
  const [scheduleRatesDirty, setScheduleRatesDirty] = useState(false);
  const [showSupplierName, setShowSupplierName] = useState(draft?.showSupplierName === true);
  const [providersLoading, setProvidersLoading] = useState(false);
  const pricingStructuresRef = useRef<HTMLDivElement>(null);
  const initialized = useRef(false);

  const isMerchant = selectedCategories.some((c) => categorySupportsFeeAnalysis(c));
  const showUcaasQuote = reviewUsesUcaasQuote(selectedCategories);
  const isInternet = serviceTypeId === 'internet';
  const showProposalFields = reviewNeedsProposalDocument(selectedCategories) && !isInternet;
  const defaultSpend = quoteDefaultCurrentSpend(row);
  const merchantStatements: StatementData[] = draft?.merchantQuote?.statements ?? [];
  const merchantForm = useMemo(
    () => merchantFormForQuote(row, draft?.merchantQuote),
    [row, draft?.merchantQuote],
  );

  const syncDraft = useCallback(
    (patch: Partial<PublishedQuoteSnapshot>) => {
      const base: PublishedQuoteSnapshot = {
        serviceTypeId,
        serviceLabel: serviceTypeLabel(serviceTypeId),
        quotePath: patch.quotePath ?? draft?.quotePath ?? 'manual',
        adminMessage: draft?.adminMessage,
        ucaasQuote: draft?.ucaasQuote,
        proposalDocument: draft?.proposalDocument,
        categories: selectedCategories,
        matchedProviderSlug: selectedProvider || undefined,
        matchedProviderName:
          providers.find((p) => p.id === selectedProvider)?.displayName ??
          providers.find((p) => p.id === selectedProvider)?.name,
        ourRateLines: appliedRateLines,
        pricingStructureOptions,
        selectedPricingStructures: pricingStructureOptions.filter((o) => o.selected).map((o) => o.id),
        dualPricingCustomerFeePct,
        showSupplierName,
        internetQuote: patch.internetQuote ?? draft?.internetQuote,
        merchantQuote: patch.merchantQuote ?? draft?.merchantQuote,
        ...patch,
      };
      if (showUcaasQuote && base.ucaasQuote) base.quotePath = 'instant_ucaas';
      else if (isMerchant && pricingStructureOptions.some((o) => o.selected)) base.quotePath = 'instant_merchant';
      else if (proposalUrl.trim()) {
        base.quotePath = 'proposal';
        base.proposalDocument = {
          url: proposalUrl.trim(),
          name: proposalName.trim() || 'Quote proposal.pdf',
        };
      }
      onDraftChange(base);
    },
    [
      serviceTypeId,
      draft,
      selectedCategories,
      selectedProvider,
      providers,
      appliedRateLines,
      pricingStructureOptions,
      dualPricingCustomerFeePct,
      showSupplierName,
      showUcaasQuote,
      isMerchant,
      proposalUrl,
      proposalName,
      onDraftChange,
    ],
  );

  useEffect(() => {
    if (initialized.current) return;
    initialized.current = true;
    const id = row.service_type_id ?? detectedServiceId ?? 'other';
    setServiceTypeId(id);
    setSelectedCategories(
      normalizeReviewCategories(draft?.categories ?? quoteServiceToCategories(id), quoteServiceToCategories(id)[0]),
    );
  }, [row, detectedServiceId, draft?.categories]);

  useEffect(() => {
    if (!isMerchant) return;
    let cancelled = false;
    setProvidersLoading(true);
    void (async () => {
      try {
        const res = await fetch('/api/portal/merchant-analysis-providers');
        const data = (await res.json()) as { providers?: MerchantAnalysisProvider[] };
        if (cancelled) return;
        const list = data.providers ?? [];
        setProviders(list);
        if (!selectedProvider && list.length) {
          const pick = list.find((p) => p.id === draft?.matchedProviderSlug) ?? list[0];
          setSelectedProvider(pick.id);
          const lines = draft?.ourRateLines?.length ? draft.ourRateLines : pick.lines ?? [];
          setOurRateLines(lines);
          setAppliedRateLines(lines);
        }
      } catch {
        if (!cancelled) setProviders([]);
      } finally {
        if (!cancelled) setProvidersLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isMerchant, draft?.matchedProviderSlug, draft?.ourRateLines, selectedProvider]);

  useEffect(() => {
    if (!selectedProvider || !isMerchant) return;
    let cancelled = false;
    void (async () => {
      try {
        const templates = await fetchProviderRateTemplates(selectedProvider);
        if (cancelled) return;
        setRateTemplates(templates);
        const template =
          templates.find((t) => t.id === selectedRateTemplateId) ??
          templates.find((t) => t.isDefault) ??
          templates[0];
        if (template && !draft?.ourRateLines?.length) {
          const lines = template.lines.map((l) => newScheduleALine(l));
          setOurRateLines(lines);
          setAppliedRateLines(lines);
          setSelectedRateTemplateId(template.id);
        }
      } catch {
        if (!cancelled) setRateTemplates([]);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [selectedProvider, isMerchant, selectedRateTemplateId, draft?.ourRateLines?.length]);

  const rebuildPricingOptions = useCallback(
    (lines: ScheduleARateLine[], keptIds: string[], dualFee: number, statements?: StatementData[]) => {
      if (!lines.length) return [];
      const risk = riskTierFromMcc(merchantForm.mcc).tier;
      const stmts = statements ?? merchantStatements;
      return buildPricingStructureOptions(
        merchantForm,
        lines,
        risk,
        normalizePricingStructureSelection(keptIds),
        dualFee,
        stmts.length ? stmts : undefined,
      );
    },
    [merchantForm, merchantStatements],
  );

  const onMerchantQuoteChange = useCallback(
    (next: import('@/lib/quotes/types').QuoteMerchantSnapshot | undefined) => {
      const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
      const stmts = next?.statements ?? [];
      const nextOptions = appliedRateLines.length
        ? rebuildPricingOptions(appliedRateLines, kept, dualPricingCustomerFeePct, stmts)
        : pricingStructureOptions;
      setPricingStructureOptions(nextOptions);
      syncDraft({ merchantQuote: next, pricingStructureOptions: nextOptions });
    },
    [
      appliedRateLines,
      dualPricingCustomerFeePct,
      pricingStructureOptions,
      rebuildPricingOptions,
      syncDraft,
    ],
  );

  useEffect(() => {
    if (!isMerchant || !appliedRateLines.length) return;
    if (draft?.pricingStructureOptions?.length) return;
    const kept = normalizePricingStructureSelection([]);
    setPricingStructureOptions(rebuildPricingOptions(appliedRateLines, kept, dualPricingCustomerFeePct));
  }, [isMerchant, appliedRateLines, rebuildPricingOptions, dualPricingCustomerFeePct, draft?.pricingStructureOptions?.length]);

  const onServiceTypeChange = (nextId: string) => {
    setServiceTypeId(nextId);
    const cats = quoteServiceToCategories(nextId);
    setSelectedCategories(cats);
    syncDraft({
      serviceTypeId: nextId,
      serviceLabel: serviceTypeLabel(nextId),
      categories: cats,
    });
  };

  const onCategoriesChange = (next: ProviderCategory[]) => {
    setSelectedCategories(next);
    syncDraft({ categories: next });
  };

  const applyProposedRates = () => {
    const nextLines = ourRateLines.map((l) => ({ ...l }));
    const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
    const nextOptions = rebuildPricingOptions(nextLines, kept, dualPricingCustomerFeePct);
    setAppliedRateLines(nextLines);
    setPricingStructureOptions(nextOptions);
    setScheduleRatesDirty(false);
    syncDraft({ ourRateLines: nextLines, pricingStructureOptions: nextOptions });
    pricingStructuresRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  };

  const onProviderChange = async (slug: string) => {
    setSelectedProvider(slug);
    try {
      const templates = await fetchProviderRateTemplates(slug);
      setRateTemplates(templates);
      const template = templates.find((t) => t.isDefault) ?? templates[0];
      if (template) {
        setSelectedRateTemplateId(template.id);
        const lines = template.lines.map((l) => newScheduleALine(l));
        setOurRateLines(lines);
        setAppliedRateLines(lines);
        const nextOptions = rebuildPricingOptions(lines, [], dualPricingCustomerFeePct);
        setPricingStructureOptions(nextOptions);
        syncDraft({
          matchedProviderSlug: slug,
          ourRateLines: lines,
          pricingStructureOptions: nextOptions,
        });
      }
    } catch {
      /* ignore */
    }
  };

  const onRateTemplateChange = (templateId: string) => {
    setSelectedRateTemplateId(templateId);
    const template = rateTemplates.find((t) => t.id === templateId);
    if (!template) return;
    const lines = template.lines.map((l) => newScheduleALine(l));
    setOurRateLines(lines);
    setAppliedRateLines(lines);
    const nextOptions = rebuildPricingOptions(lines, [], dualPricingCustomerFeePct);
    setPricingStructureOptions(nextOptions);
    syncDraft({ ourRateLines: lines, pricingStructureOptions: nextOptions });
  };

  const detectionMismatch =
    detectedServiceId &&
    serviceTypeId &&
    detectedServiceId !== serviceTypeId &&
    row.service_type_id !== serviceTypeId;

  return (
    <>
      <div className="card" style={{ marginBottom: 16 }}>
        <div className="card-header">
          <div className="card-title">Service &amp; pricing</div>
        </div>
        <div className="card-body">
          {detectedServiceId ? (
            <p className="quote-request-detection-hint" style={{ marginTop: 0 }}>
              Detected <strong>{serviceTypeLabel(detectedServiceId)}</strong> from the customer&apos;s
              answers{detectionMismatch ? ' — you can change it below' : ''}.
            </p>
          ) : null}

          <label className="form-group">
            <span className="form-label">Service type</span>
            <select
              className="form-input"
              value={serviceTypeId}
              disabled={disabled}
              onChange={(e) => onServiceTypeChange(e.target.value)}
            >
              {QUOTE_SERVICE_TYPES.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.label}
                  {s.id === detectedServiceId ? ' (detected)' : ''}
                </option>
              ))}
            </select>
          </label>

          <p style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.55 }}>
            Categories drive pricing tools — same as analysis review. Merchant unlocks rate schedules;
            UCaaS uses the instant configurator; other categories use a proposal document.
          </p>
          <CategoryMultiSelect
            value={selectedCategories}
            onChange={onCategoriesChange}
            disabled={disabled}
          />
          <p style={{ fontSize: 12, color: 'var(--gray)', marginBottom: 0 }}>
            Selected: {formatCategoriesLabel(selectedCategories)}
          </p>
        </div>
      </div>

      {isInternet ? (
        <InternetQuoteBuilder
          row={row}
          draft={draft}
          disabled={disabled}
          onDraftChange={(next) => syncDraft(next)}
        />
      ) : null}

      {showUcaasQuote && !isInternet ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">UCaaS quote</div>
          </div>
          <div className="card-body">
            <UcaasQuoteBuilder
              value={draft?.ucaasQuote}
              defaultCurrentSpend={defaultSpend}
              onChange={(q) => syncDraft({ ucaasQuote: q, quotePath: 'instant_ucaas' })}
              onRemove={() => syncDraft({ ucaasQuote: undefined, quotePath: 'manual' })}
            />
            {draft?.ucaasQuote ? (
              <label
                style={{
                  display: 'flex',
                  alignItems: 'flex-start',
                  gap: 10,
                  marginTop: 16,
                  cursor: 'pointer',
                  fontSize: 13,
                }}
              >
                <input
                  type="checkbox"
                  checked={showSupplierName}
                  onChange={(e) => {
                    setShowSupplierName(e.target.checked);
                    syncDraft({ showSupplierName: e.target.checked });
                  }}
                  style={{ marginTop: 3 }}
                />
                <span>
                  <strong>Show supplier name on the customer quote</strong>
                </span>
              </label>
            ) : null}
          </div>
        </div>
      ) : null}

      {isMerchant && !isInternet ? (
        <MerchantQuoteStatementPanel
          value={draft?.merchantQuote}
          ourRateLines={appliedRateLines}
          disabled={disabled}
          onChange={onMerchantQuoteChange}
        />
      ) : null}

      {isMerchant && !isInternet ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Merchant rate schedule</div>
          </div>
          <div className="card-body">
            {providersLoading ? (
              <p className="text-muted">Loading partner rates…</p>
            ) : providers.length ? (
              <>
                <label style={{ display: 'block', fontSize: 12, marginBottom: 10 }}>
                  Partner supplier
                  <select
                    value={selectedProvider}
                    disabled={disabled}
                    onChange={(e) => void onProviderChange(e.target.value)}
                    style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                  >
                    {providers.map((p) => (
                      <option key={p.id} value={p.id}>
                        {p.displayName ?? p.name}
                      </option>
                    ))}
                  </select>
                </label>
                {rateTemplates.length > 0 ? (
                  <label style={{ display: 'block', fontSize: 12, marginBottom: 10 }}>
                    Rate template
                    <select
                      value={selectedRateTemplateId}
                      disabled={disabled}
                      onChange={(e) => onRateTemplateChange(e.target.value)}
                      style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
                    >
                      {rateTemplates.map((t) => (
                        <option key={t.id} value={t.id}>
                          {t.name}
                          {t.isDefault ? ' (default)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                ) : null}
                <SupplierRateLinesTable
                  lines={ourRateLines}
                  rateColumnLabel="Sell rate"
                  onUpdateLine={(id, patch) => {
                    setScheduleRatesDirty(true);
                    setOurRateLines((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
                  }}
                  onRemoveLine={(id) => {
                    setScheduleRatesDirty(true);
                    setOurRateLines((prev) => prev.filter((l) => l.id !== id));
                  }}
                  emptyMessage="No sell rates on file — configure Our rate on the supplier."
                />
                {scheduleRatesDirty ? (
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ marginTop: 12 }}
                    onClick={applyProposedRates}
                  >
                    Update proposed rates
                  </button>
                ) : null}
              </>
            ) : (
              <p className="text-muted">No merchant partners configured.</p>
            )}
          </div>
        </div>
      ) : null}

      {isMerchant && pricingStructureOptions.length > 0 ? (
        <div className="card" style={{ marginBottom: 16 }} ref={pricingStructuresRef}>
          <div className="card-body" style={{ paddingTop: 16, paddingBottom: 16 }}>
            <PricingStructuresPanel
              options={pricingStructureOptions}
              dualPricingCustomerFeePct={dualPricingCustomerFeePct}
              onChange={(next) => {
                setPricingStructureOptions(next);
                syncDraft({ pricingStructureOptions: next });
              }}
              onDualPricingCustomerFeePctChange={(pct) => {
                setDualPricingCustomerFeePct(pct);
                const kept = pricingStructureOptions.filter((o) => o.selected).map((o) => o.id);
                const nextOptions = rebuildPricingOptions(appliedRateLines, kept, pct);
                setPricingStructureOptions(nextOptions);
                syncDraft({ dualPricingCustomerFeePct: pct, pricingStructureOptions: nextOptions });
              }}
            />
          </div>
        </div>
      ) : null}

      {showProposalFields && !showUcaasQuote && !isMerchant ? (
        <div className="card" style={{ marginBottom: 16 }}>
          <div className="card-header">
            <div className="card-title">Proposal / quote document</div>
          </div>
          <div className="card-body">
            <p className="text-muted" style={{ marginBottom: 12 }}>
              Paste a supplier quote PDF URL or upload link after you receive pricing.
            </p>
            <div className="form-group">
              <label>Document URL</label>
              <input
                className="form-input"
                value={proposalUrl}
                disabled={disabled}
                onChange={(e) => {
                  onProposalUrlChange(e.target.value);
                  if (e.target.value.trim()) {
                    syncDraft({
                      quotePath: 'proposal',
                      proposalDocument: {
                        url: e.target.value.trim(),
                        name: proposalName.trim() || 'Quote proposal.pdf',
                      },
                    });
                  }
                }}
                placeholder="https://…"
              />
            </div>
            <div className="form-group">
              <label>Document name</label>
              <input
                className="form-input"
                value={proposalName}
                disabled={disabled}
                onChange={(e) => onProposalNameChange(e.target.value)}
              />
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
