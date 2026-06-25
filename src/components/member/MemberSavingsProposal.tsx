'use client';

import { useMemo, useState } from 'react';
import {
  calcDualPricingSavings,
  calcFlat3Savings,
  fmt$,
  fmtPct,
  fmtRange,
  PRICING_MODELS,
} from '@/lib/candid-pay/pricingEngine';
import type { MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';
import type { StatementData } from '@/lib/candid-pay/statementParser';
import { sortStatements } from '@/lib/candid-pay/statementParser';
import type {
  MerchantAnalysisProvider,
  PricingStructureId,
  PricingStructureOption,
  ProviderSavingsQuote,
} from '@/lib/analysis/types';
import { customerFacingProposalOptions } from '@/lib/analysis/pricing-structure-options';
import { resolveRecurringCostBasis } from '@/lib/analysis/recurring-processing-cost';
import { detectedPricingStructure } from '@/lib/analysis/statement-pricing-model';

type PackageOption = 'flat3' | 'dual' | PricingStructureId | (string & {});

type ComparisonColumn = {
  key: string;
  packageKey: PackageOption;
  name: string;
  vendor: string;
  rateLabel: string;
  currentMonthly: number;
  proposedMonthly: number;
  monthlySavings: number;
  annualSavings: number;
};

type MemberSavingsProposalProps = {
  form: MerchantStatementForm;
  statements: StatementData[];
  calendarLink?: string;
  ctaForm: { name: string; phone: string; email: string; date: string; time: string; notes: string };
  setCtaForm: React.Dispatch<
    React.SetStateAction<{ name: string; phone: string; email: string; date: string; time: string; notes: string }>
  >;
  ctaSent: boolean;
  onCtaSubmit: () => void;
  /** Savings quotes from admin Our Rate schedules (merchant services providers) */
  providerQuotes?: ProviderSavingsQuote[];
  analysisProviders?: MerchantAnalysisProvider[];
  /** Admin-selected pricing structures for this proposal */
  pricingStructureOptions?: PricingStructureOption[];
  /** Partner name for proposed pricing (customer-facing) */
  partnerName?: string;
};

function feeRowsFromStatements(statements: StatementData[]) {
  const sorted = sortStatements(statements);
  const months = sorted.length || 1;
  const sum = (fn: (s: StatementData) => number) =>
    sorted.reduce((acc, s) => acc + fn(s), 0);

  const interchange = sum((s) => s.feeBreakdown?.interchange ?? 0);
  const markup = sum((s) => s.feeBreakdown?.processingMarkup ?? 0);
  const amex = sum(
    (s) => (s.cardBreakdown?.amex ?? 0) * ((s.feeBreakdown?.processingMarkup ?? 0) / Math.max(s.totalVolume, 1)) * 0.15,
  );
  const network = sum((s) => (s.feeBreakdown?.networkFees ?? 0) + (s.feeBreakdown?.authFees ?? 0));
  const nq = sum((s) => s.feeBreakdown?.nonQualSurcharge ?? 0);
  const fixed = sum(
    (s) =>
      (s.feeBreakdown?.bascStand ?? 0) +
      (s.feeBreakdown?.stmtMail ?? 0) +
      (s.feeBreakdown?.acctFee ?? 0),
  );
  const oneOff = sum((s) => s.feeBreakdown?.otherFixed ?? 0);
  const recurring = sum((s) => {
    const fb = s.feeBreakdown;
    if (!fb) return s.totalFees ?? 0;
    return (
      (fb.interchange ?? 0) +
      (fb.processingMarkup ?? 0) +
      (fb.networkFees ?? 0) +
      (fb.nonQualSurcharge ?? 0) +
      (fb.authFees ?? 0) +
      (fb.bascStand ?? 0) +
      (fb.stmtMail ?? 0) +
      (fb.acctFee ?? 0)
    );
  });
  const total = sum((s) => s.totalFees ?? 0);

  return {
    months,
    periodLabel:
      sorted.length > 1
        ? `${sorted[0].statementDate} – ${sorted[sorted.length - 1].statementDate}`
        : sorted[0]?.statementDate ?? formFallbackPeriod(statements),
    interchange,
    markup,
    amex: amex > 0 ? amex : markup * 0.35,
    network,
    nq,
    fixed,
    oneOff,
    recurring: recurring > 0 ? recurring : Math.max(0, total - oneOff),
    total,
    processor: sorted[sorted.length - 1]?.merchantName ? 'Current processor' : 'Processor',
  };
}

function formFallbackPeriod(statements: StatementData[]) {
  return statements[0]?.statementDate ?? '';
}

function AccordionSection({
  id,
  title,
  badge,
  badgeVariant = 'ok',
  openId,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  badgeVariant?: 'ok' | 'current';
  openId: string | null;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const open = openId === id;
  return (
    <div className="msp-accordion">
      <button type="button" className="msp-accordion-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className="msp-accordion-title">{title}</span>
        {badge && (
          <span className={`msp-accordion-badge${badgeVariant === 'current' ? ' msp-accordion-badge--current' : ''}`}>
            {badge}
          </span>
        )}
        <span className="msp-accordion-chevron">{open ? '−' : '+'}</span>
      </button>
      {open && <div className="msp-accordion-body">{children}</div>}
    </div>
  );
}

function LineItem({ label, value, note, variant }: { label: string; value: string; note?: string; variant?: 'warn' | 'ok' | 'info' }) {
  return (
    <div className="msp-line-item">
      <div className="msp-line-item-main">
        <span>{label}</span>
        <strong>{value}</strong>
      </div>
      {note && <div className={`msp-line-note msp-line-note--${variant ?? 'info'}`}>{note}</div>}
    </div>
  );
}

function ProposedStructureDetails({
  opt,
  partnerName,
}: {
  opt: PricingStructureOption;
  partnerName?: string;
}) {
  return (
    <>
      {partnerName && <LineItem label="Processing partner" value={partnerName} />}
      <LineItem label="Proposed pricing" value={opt.proposedRateLabel} />
      {opt.id === 'interchange_plus' && opt.proposedCardMarkups && opt.proposedCardMarkups.length > 0 ? (
        opt.proposedCardMarkups.map((m) => (
          <LineItem
            key={`${m.label}-${m.markupBps}`}
            label={`${m.label} markup above interchange`}
            value={`${m.markupBps} bps`}
          />
        ))
      ) : opt.id === 'interchange_plus' && opt.proposedMarkupBps != null ? (
        <LineItem
          label="Markup above interchange"
          value={`${opt.proposedMarkupBps} bps`}
        />
      ) : null}
      {opt.proposedPerItemFees?.map((fee) => (
        <LineItem
          key={`${fee.label}-${fee.perItem}`}
          label={fee.label || 'Per-transaction fee'}
          value={
            fee.monthlyEstimate != null && fee.monthlyEstimate > 0
              ? `${fmt$(fee.perItem)} (~${fmt$(fee.monthlyEstimate)}/mo est.)`
              : fmt$(fee.perItem)
          }
        />
      ))}
      {opt.id === 'dual_pricing' && opt.dualCustomerFeePct != null && (
        <LineItem label="Customer card fee" value={fmtPct(opt.dualCustomerFeePct)} />
      )}
      {opt.id === 'dual_pricing' && opt.merchantProcessingPct != null && (
        <LineItem label="Your net card processing rate" value={fmtPct(opt.merchantProcessingPct)} variant="ok" />
      )}
      <LineItem label="Est. monthly processing cost" value={fmt$(opt.proposedMonthlyCost)} />
      <LineItem label="Monthly savings" value={fmt$(opt.monthlySavings)} variant="ok" />
      <LineItem label="Annual savings" value={fmt$(opt.annualSavings)} variant="ok" />
    </>
  );
}

export function MemberSavingsProposal({
  form,
  statements,
  calendarLink = 'https://candid.solutions',
  ctaForm,
  setCtaForm,
  ctaSent,
  onCtaSubmit,
  providerQuotes = [],
  analysisProviders = [],
  pricingStructureOptions = [],
  partnerName,
}: MemberSavingsProposalProps) {
  const [openAccordion, setOpenAccordion] = useState<string | null>('fees');
  const [packageSelected, setPackageSelected] = useState<Set<PackageOption>>(new Set());

  const sortedStatements = useMemo(() => sortStatements(statements), [statements]);
  const latestStatement = sortedStatements[sortedStatements.length - 1];
  const currentStructureId = detectedPricingStructure(form.pricingModel, latestStatement);
  const isFlatRateCurrent = currentStructureId === 'flat_rate' || currentStructureId === 'flat3';

  const vol = parseFloat(form.ccVolume) || 0;
  const ach = parseFloat(form.achVolume) || 0;
  const costBasis = resolveRecurringCostBasis(form, statements);
  const rate = costBasis.recurringEffectiveRate || parseFloat(form.currentEffectiveRate) || 0;
  const recurringMonthly = costBasis.recurringCardMonthly;
  const flat3 = calcFlat3Savings({
    currentEffectiveRate: rate,
    ccVolume: vol,
    currentMonthlyCost: recurringMonthly,
  });
  const dual = calcDualPricingSavings({
    currentCCRate: form.currentCCRate || String(rate),
    currentACHRate: form.currentACHRate || '1.0',
    ccVolume: vol,
    achVolume: ach,
    currentMonthlyCost: recurringMonthly,
  });

  const selectedStructureOptions = useMemo(
    () => pricingStructureOptions.filter((o) => o.selected),
    [pricingStructureOptions],
  );
  const proposalOptions = useMemo(
    () => customerFacingProposalOptions(pricingStructureOptions),
    [pricingStructureOptions],
  );
  const useStructureOptions = proposalOptions.length > 0;
  const currentStructureOption = selectedStructureOptions.find((o) => o.isCurrentStructure);

  const useProviderRates = !useStructureOptions && providerQuotes.length > 0;

  const feeData = useMemo(() => feeRowsFromStatements(statements), [statements]);
  const modelKey =
    currentStructureId === 'interchange_plus'
      ? 'interchange_plus'
      : currentStructureId === 'dual_pricing'
        ? 'dual_pricing'
        : 'flat_rate';
  const modelInfo =
    (modelKey in PRICING_MODELS ? PRICING_MODELS[modelKey as keyof typeof PRICING_MODELS] : null) ??
    PRICING_MODELS.flat_rate;
  const merchant = form.merchantName || 'Your business';

  const curMonthly = useStructureOptions
    ? (currentStructureOption?.currentMonthlyCost ??
      proposalOptions[0]?.currentMonthlyCost ??
      recurringMonthly)
    : recurringMonthly > 0
      ? recurringMonthly
      : vol * (rate / 100);

  const annualLow =
    useStructureOptions && proposalOptions.length > 0
      ? Math.min(...proposalOptions.map((o) => o.annualSavings))
      : useProviderRates
        ? Math.min(...providerQuotes.map((q) => q.annualSavings))
        : Math.min(flat3.annualSavings, dual.annualSavings);
  const annualHigh =
    useStructureOptions && proposalOptions.length > 0
      ? Math.max(...proposalOptions.map((o) => o.annualSavings))
      : useProviderRates
        ? Math.max(...providerQuotes.map((q) => q.annualSavings))
        : Math.max(flat3.annualSavings, dual.annualSavings);
  const monthlyLow =
    useStructureOptions && proposalOptions.length > 0
      ? Math.min(...proposalOptions.map((o) => o.monthlySavings))
      : useProviderRates
        ? Math.min(...providerQuotes.map((q) => q.monthlySavings))
        : Math.min(flat3.monthlySavings, dual.monthlySavings);
  const monthlyHigh =
    useStructureOptions && proposalOptions.length > 0
      ? Math.max(...proposalOptions.map((o) => o.monthlySavings))
      : useProviderRates
        ? Math.max(...providerQuotes.map((q) => q.monthlySavings))
        : Math.max(flat3.monthlySavings, dual.monthlySavings);

  const togglePackage = (opt: PackageOption) => {
    setPackageSelected((prev) => {
      const next = new Set(prev);
      if (next.has(opt)) next.delete(opt);
      else next.add(opt);
      return next;
    });
  };

  const packageSavings = useMemo(() => {
    let monthly = 0;
    if (useStructureOptions) {
      for (const id of packageSelected) {
        const opt = proposalOptions.find((o) => o.id === id);
        if (opt) monthly += opt.monthlySavings;
      }
    } else if (useProviderRates) {
      for (const id of packageSelected) {
        const quote = providerQuotes.find((q) => q.providerId === id);
        if (quote) monthly += quote.monthlySavings;
      }
    } else {
      if (packageSelected.has('flat3')) monthly += flat3.monthlySavings;
      if (packageSelected.has('dual')) monthly += dual.monthlySavings;
    }
    return { monthly, annual: monthly * 12 };
  }, [
    packageSelected,
    flat3.monthlySavings,
    dual.monthlySavings,
    providerQuotes,
    useProviderRates,
    useStructureOptions,
    proposalOptions,
  ]);

  const markupRatio =
    !isFlatRateCurrent && feeData.interchange > 0
      ? Math.round((feeData.markup / feeData.interchange) * 100)
      : null;
  const resolvedPartnerName =
    partnerName ??
    (analysisProviders.length === 1
      ? analysisProviders[0].displayName ?? analysisProviders[0].name
      : undefined);

  const comparisonColumns = useMemo<ComparisonColumn[]>(() => {
    if (useStructureOptions) {
      return proposalOptions.map((opt) => ({
        key: String(opt.id),
        packageKey: opt.id,
        name: opt.label,
        vendor: resolvedPartnerName ?? 'Proposed pricing',
        rateLabel: opt.proposedRateLabel,
        currentMonthly: opt.currentMonthlyCost,
        proposedMonthly: opt.proposedMonthlyCost,
        monthlySavings: opt.monthlySavings,
        annualSavings: opt.annualSavings,
      }));
    }
    if (useProviderRates) {
      return providerQuotes.map((quote) => ({
        key: quote.providerId,
        packageKey: quote.providerId,
        name: quote.providerName,
        vendor: 'Our rate',
        rateLabel:
          quote.breakdown.flatRatePct != null
            ? `${fmtPct(quote.breakdown.flatRatePct)} flat`
            : quote.breakdown.markupBps != null
              ? `Interchange + ${quote.breakdown.markupBps} bps`
              : 'Custom rate',
        currentMonthly: quote.currentMonthlyCost,
        proposedMonthly: quote.proposedMonthlyCost,
        monthlySavings: quote.monthlySavings,
        annualSavings: quote.annualSavings,
      }));
    }
    return [
      {
        key: 'flat3',
        packageKey: 'flat3',
        name: 'Flat rate — 3.0%',
        vendor: 'CandidPay',
        rateLabel: '3.0% flat',
        currentMonthly: curMonthly,
        proposedMonthly: flat3.newCost,
        monthlySavings: flat3.monthlySavings,
        annualSavings: flat3.annualSavings,
      },
      {
        key: 'dual',
        packageKey: 'dual',
        name: 'Dual pricing',
        vendor: 'CandidPay',
        rateLabel: `${fmtPct(dual.newCCRate)} card · ${fmtPct(dual.newACHRate)} ACH`,
        currentMonthly: curMonthly,
        proposedMonthly: dual.newCost,
        monthlySavings: dual.monthlySavings,
        annualSavings: dual.annualSavings,
      },
    ];
  }, [
    useStructureOptions,
    useProviderRates,
    proposalOptions,
    providerQuotes,
    resolvedPartnerName,
    curMonthly,
    flat3.newCost,
    flat3.monthlySavings,
    flat3.annualSavings,
    dual.newCost,
    dual.newCCRate,
    dual.newACHRate,
    dual.monthlySavings,
    dual.annualSavings,
  ]);

  const bestColumnIndex = useMemo(() => {
    if (comparisonColumns.length === 0) return -1;
    let best = 0;
    for (let i = 1; i < comparisonColumns.length; i += 1) {
      if (comparisonColumns[i].annualSavings > comparisonColumns[best].annualSavings) best = i;
    }
    return best;
  }, [comparisonColumns]);

  const showComparison = comparisonColumns.length >= 2;

  return (
    <div className="msp-root">
      <header className="msp-header">
        <div>
          <div className="msp-brand">Candid Solutions</div>
          <div className="msp-brand-sub">Technology &amp; Payment Optimization</div>
        </div>
        <div className="msp-header-meta">
          <div className="msp-doc-type">Cost Optimization Proposal</div>
          <div className="msp-merchant">{merchant}</div>
          {form.statementPeriod && <div className="msp-period">Statement: {form.statementPeriod}</div>}
          <div className="msp-links">candid.solutions · candidpay.app</div>
        </div>
      </header>

      {/* Statement breakdown — summary table */}
      <section className="msp-section">
        <div className="msp-section-label">Total Savings Summary</div>
        <h1 className="msp-hero">
          {merchant} is leaving{' '}
          <span className="msp-hero-accent">{fmtRange(annualLow, annualHigh)}</span> per year unrealized.
        </h1>
        <p className="msp-hero-sub">
          Based on {feeData.months > 1 ? `${feeData.months}-month` : 'your'} statement analysis — payment processing
          fees and pricing model review.
          {useStructureOptions && resolvedPartnerName && (
            <>
              {' '}
              Proposed alternatives use pricing from {resolvedPartnerName}.
            </>
          )}
          {useProviderRates && (
            <>
              {' '}
              Proposed pricing uses Candid&apos;s configured merchant services partner sell rates
              {analysisProviders.length === 1
                ? ` (${analysisProviders[0].displayName ?? analysisProviders[0].name})`
                : ` (${analysisProviders.length} partners)`}
              .
            </>
          )}
        </p>
      </section>

      {/* Overview boxes */}
      <section className="msp-stat-grid">
        {Math.abs(annualLow - annualHigh) < 0.005 ? (
          <div className="msp-stat-card">
            <div className="msp-stat-label">Est. annual savings</div>
            <div className="msp-stat-value">{fmt$(annualLow)}</div>
            <div className="msp-stat-sub">Based on selected proposal options</div>
          </div>
        ) : (
          <>
            <div className="msp-stat-card">
              <div className="msp-stat-label">Est. annual savings – low</div>
              <div className="msp-stat-value">{fmt$(annualLow)}</div>
              <div className="msp-stat-sub">Conservative range</div>
            </div>
            <div className="msp-stat-card">
              <div className="msp-stat-label">Est. annual savings – high</div>
              <div className="msp-stat-value">{fmt$(annualHigh)}</div>
              <div className="msp-stat-sub">Full upside range</div>
            </div>
          </>
        )}
        <div className="msp-stat-card">
          <div className="msp-stat-label">Upfront cost to switch</div>
          <div className="msp-stat-value">$0</div>
          <div className="msp-stat-sub">No setup fees, no install costs</div>
        </div>
      </section>

      {/* Side-by-side comparison */}
      {showComparison && (
        <section className="msp-section">
          <div className="msp-section-label">Compare your options</div>
          <h2 className="msp-section-title">Your pricing options, side by side</h2>
          <p className="msp-section-desc">
            Each option below replaces your current {modelInfo.label.toLowerCase()} pricing
            {curMonthly > 0 ? <> of <strong>{fmt$(curMonthly)}/mo</strong></> : null}. Expand any
            option in the analysis below for the full fee breakdown.
          </p>
          <div className="msp-compare-wrap">
            <table className="msp-compare">
              <thead>
                <tr>
                  <th className="msp-compare-corner" />
                  <th className="msp-compare-option msp-compare-current">
                    <span className="msp-compare-badge msp-compare-badge--worst">Current</span>
                    <div className="msp-compare-name">Current pricing</div>
                    <div className="msp-compare-vendor">{modelInfo.label}</div>
                  </th>
                  {comparisonColumns.map((col, i) => (
                    <th
                      key={col.key}
                      className={`msp-compare-option${i === bestColumnIndex ? ' is-best' : ''}`}
                    >
                      {i === bestColumnIndex && <span className="msp-compare-badge">Best value</span>}
                      <div className="msp-compare-name">{col.name}</div>
                      <div className="msp-compare-vendor">{col.vendor}</div>
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                <tr>
                  <td className="msp-compare-metric">Est. monthly cost</td>
                  <td className="msp-compare-current">{fmt$(curMonthly)}</td>
                  {comparisonColumns.map((col, i) => (
                    <td key={col.key} className={i === bestColumnIndex ? 'is-best' : undefined}>
                      {fmt$(col.proposedMonthly)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="msp-compare-metric">Monthly savings</td>
                  <td className="msp-compare-current msp-compare-current-muted">—</td>
                  {comparisonColumns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`msp-positive${i === bestColumnIndex ? ' is-best' : ''}`}
                    >
                      {fmt$(col.monthlySavings)}
                    </td>
                  ))}
                </tr>
                <tr>
                  <td className="msp-compare-metric">Annual savings</td>
                  <td className="msp-compare-current msp-compare-current-muted">—</td>
                  {comparisonColumns.map((col, i) => (
                    <td
                      key={col.key}
                      className={`msp-positive${i === bestColumnIndex ? ' is-best' : ''}`}
                    >
                      {fmt$(col.annualSavings)}
                    </td>
                  ))}
                </tr>
                <tr className="msp-compare-action-row">
                  <td className="msp-compare-metric" />
                  <td className="msp-compare-current" />
                  {comparisonColumns.map((col, i) => (
                    <td key={col.key} className={i === bestColumnIndex ? 'is-best' : undefined}>
                      <button
                        type="button"
                        className={`msp-compare-btn${packageSelected.has(col.packageKey) ? ' selected' : ''}`}
                        onClick={() => togglePackage(col.packageKey)}
                      >
                        {packageSelected.has(col.packageKey) ? '✓ Added' : 'Add to package'}
                      </button>
                    </td>
                  ))}
                </tr>
              </tbody>
            </table>
          </div>

          {packageSelected.size > 0 && (
            <div className="msp-package-total">
              <span>Your package estimate</span>
              <strong>
                {fmt$(packageSavings.monthly)}/mo · {fmt$(packageSavings.annual)}/yr
              </strong>
            </div>
          )}
        </section>
      )}

      {/* Accordion analysis */}
      <section className="msp-section">
        <div className="msp-section-label">Invoice analysis – expand for detail</div>

        <AccordionSection
          id="fees"
          title={`Payment processing — ${modelInfo.label} (current)`}
          badge={`Current ${fmt$(curMonthly)}/mo`}
          badgeVariant="current"
          openId={openAccordion}
          onToggle={(id) => setOpenAccordion(openAccordion === id ? null : id)}
        >
          <div className="msp-accordion-grid">
            <div className="msp-panel">
              <div className="msp-panel-title">Fee category analysis ({feeData.months}-month total)</div>
              {!isFlatRateCurrent && (
                <LineItem label="Interchange — Visa/MC/Disc (non-negotiable)" value={fmt$(feeData.interchange)} />
              )}
              <LineItem
                label={isFlatRateCurrent ? 'Discount / processing fees' : 'Processor markup'}
                value={fmt$(feeData.markup)}
              />
              <LineItem label="AMEX & premium card costs" value={fmt$(feeData.amex)} />
              <LineItem
                label="BASC STAND + other fixed fees"
                value={fmt$(feeData.fixed)}
                variant={feeData.fixed > 0 ? 'warn' : undefined}
              />
              <LineItem label="Non-qualified surcharges" value={fmt$(feeData.nq)} variant={feeData.nq > 0 ? 'warn' : undefined} />
              <LineItem label="Network assessments + auth fees" value={fmt$(feeData.network)} />
              {feeData.oneOff > 0 && (
                <LineItem
                  label="One-time fees (chargebacks, etc.) — excluded from savings"
                  value={fmt$(feeData.oneOff)}
                  variant="warn"
                />
              )}
              <div className="msp-line-total">
                <span>Recurring fees used for savings ({feeData.months} mo)</span>
                <strong>{fmt$(feeData.recurring)}</strong>
              </div>
              {feeData.oneOff > 0 && (
                <div className="msp-callout msp-callout--info" style={{ marginTop: 8 }}>
                  Statement total {fmt$(feeData.total)} includes {fmt$(feeData.oneOff)} in non-recurring fees not counted toward savings.
                </div>
              )}
              {markupRatio != null && markupRatio > 50 && (
                <div className="msp-callout msp-callout--warn">
                  Processor markup is {markupRatio}% of interchange — industry standard is 20–40%. This excess may cost
                  you an estimated {fmt$(feeData.markup / feeData.months)}/mo above market rate.
                </div>
              )}
            </div>

            <div className="msp-panel">
              <div className="msp-panel-title">Your current situation</div>
              <LineItem label="Avg monthly volume" value={fmt$(vol)} />
              <LineItem label="Recurring effective rate" value={fmtPct(rate)} variant="warn" />
              <LineItem
                label="Recurring fees / month (avg)"
                value={fmt$(feeData.recurring / feeData.months)}
                variant="warn"
              />
              <LineItem label="Pricing model" value={modelInfo.label} />
              <div className="msp-callout msp-callout--info">{modelInfo.evidence}</div>
            </div>
          </div>
        </AccordionSection>

        {useStructureOptions
          ? proposalOptions.map((opt) => (
              <AccordionSection
                key={opt.id}
                id={`structure-${opt.id}`}
                title={`${opt.label} — proposed alternative`}
                badge={opt.monthlySavings > 0 ? `Saves ${fmt$(opt.monthlySavings)}/mo` : undefined}
                openId={openAccordion}
                onToggle={(id) => setOpenAccordion(openAccordion === id ? null : id)}
              >
                <div className="msp-accordion-grid">
                  <div className="msp-panel">
                    <div className="msp-panel-title">Your current cost</div>
                    <LineItem label="Est. monthly processing cost" value={fmt$(opt.currentMonthlyCost)} />
                    <LineItem label="Effective rate" value={fmtPct(rate)} variant="warn" />
                    <LineItem label="Current pricing model" value={modelInfo.label} />
                  </div>
                  <div className="msp-panel">
                    <div className="msp-panel-title">Proposed — {opt.label}</div>
                    <ProposedStructureDetails opt={opt} partnerName={resolvedPartnerName} />
                  </div>
                </div>
              </AccordionSection>
            ))
          : useProviderRates
          ? providerQuotes.map((quote) => (
              <AccordionSection
                key={quote.providerId}
                id={`provider-${quote.providerId}`}
                title={`${quote.providerName} — Our rate`}
                badge={`Saves ${fmt$(quote.monthlySavings)}/mo`}
                openId={openAccordion}
                onToggle={(id) => setOpenAccordion(openAccordion === id ? null : id)}
              >
                <div className="msp-accordion-grid">
                  <div className="msp-panel">
                    <div className="msp-panel-title">Current (from your statement)</div>
                    <LineItem label="Est. monthly processing cost" value={fmt$(quote.currentMonthlyCost)} />
                    <LineItem label="Effective rate" value={fmtPct(rate)} variant="warn" />
                  </div>
                  <div className="msp-panel">
                    <div className="msp-panel-title">Proposed — {quote.providerName}</div>
                    {quote.breakdown.flatRatePct != null && (
                      <LineItem label="Sell rate (flat)" value={fmtPct(quote.breakdown.flatRatePct)} />
                    )}
                    {quote.breakdown.markupBps != null && (
                      <LineItem label="Markup above interchange" value={`${quote.breakdown.markupBps} bps`} />
                    )}
                    <LineItem label="Volume-based cost" value={fmt$(quote.breakdown.volumeCost)} />
                    <LineItem label="Per-item fees" value={fmt$(quote.breakdown.perItemCost)} />
                    <LineItem label="Monthly fees" value={fmt$(quote.breakdown.monthlyFees)} />
                    <LineItem label="Total proposed / month" value={fmt$(quote.proposedMonthlyCost)} />
                    <LineItem label="Monthly savings" value={fmt$(quote.monthlySavings)} variant="ok" />
                    <LineItem label="Annual savings" value={fmt$(quote.annualSavings)} variant="ok" />
                    {quote.notes[0] && <div className="msp-callout msp-callout--info">{quote.notes[0]}</div>}
                  </div>
                </div>
              </AccordionSection>
            ))
          : (
            <>
              <AccordionSection
                id="flat3"
                title="Option A — CandidPay flat rate (3.0%)"
                badge={flat3.monthlySavings > 0 ? `Saves ${fmt$(flat3.monthlySavings)}/mo` : undefined}
                openId={openAccordion}
                onToggle={(id) => setOpenAccordion(openAccordion === id ? null : id)}
              >
                <div className="msp-accordion-grid">
                  <div className="msp-panel">
                    <div className="msp-panel-title">Current</div>
                    <LineItem label="Monthly processing cost" value={fmt$(curMonthly)} />
                    <LineItem label="Effective rate" value={fmtPct(rate)} />
                  </div>
                  <div className="msp-panel">
                    <div className="msp-panel-title">Proposed — CandidPay flat 3%</div>
                    <LineItem label="Flat card rate" value="3.0%" />
                    <LineItem label="Monthly cost" value={fmt$(flat3.newCost)} />
                    <LineItem label="Monthly savings" value={fmt$(flat3.monthlySavings)} variant="ok" />
                    <LineItem label="Annual savings" value={fmt$(flat3.annualSavings)} variant="ok" />
                    <div className="msp-callout msp-callout--ok">
                      Simple, transparent pricing — what we quote is what you pay every month.
                    </div>
                  </div>
                </div>
              </AccordionSection>

              <AccordionSection
                id="dual"
                title="Option B — CandidPay dual pricing"
                badge={dual.monthlySavings > 0 ? `Saves ${fmt$(dual.monthlySavings)}/mo` : 'Maximum savings'}
                openId={openAccordion}
                onToggle={(id) => setOpenAccordion(openAccordion === id ? null : id)}
              >
                <div className="msp-accordion-grid">
                  <div className="msp-panel">
                    <div className="msp-panel-title">Current</div>
                    <LineItem label="CC effective rate" value={fmtPct(parseFloat(form.currentCCRate) || rate)} />
                    <LineItem label="ACH rate" value={fmtPct(parseFloat(form.currentACHRate) || 1)} />
                    <LineItem label="Monthly CC cost" value={fmt$(curMonthly)} />
                  </div>
                  <div className="msp-panel">
                    <div className="msp-panel-title">Proposed — dual pricing</div>
                    <LineItem label="Card-pay price (cardholder)" value={fmtPct(dual.newCCRate)} />
                    <LineItem label="ACH / bank transfer" value={fmtPct(dual.newACHRate)} />
                    <LineItem label="Your net CC cost" value="$0.00 (cardholder)" variant="ok" />
                    <LineItem label="Monthly savings" value={fmt$(dual.monthlySavings)} variant="ok" />
                    <LineItem label="Annual savings" value={fmt$(dual.annualSavings)} variant="ok" />
                    <div className="msp-callout msp-callout--ok">
                      With dual pricing, card-paying customers absorb processing cost — driving your net card cost toward zero.
                    </div>
                  </div>
                </div>
              </AccordionSection>
            </>
          )}
      </section>

      {/* Partner / next-steps band — visually separated from the analysis */}
      <div className="msp-outro">
      {/* Why Candid */}
      <section className="msp-section">
        <div className="msp-section-label">Why Candid</div>
        <h2 className="msp-section-title">More than a vendor — a true business partner</h2>
        <div className="msp-why-grid">
          {[
            ['🇺🇸', '100% U.S.-Based & Local', 'Locally operated — a real person who knows your account answers.'],
            ['🏆', 'World-Class Support', 'Many clients treat Candid as an extension of their finance team.'],
            ['📊', 'Transparent Pricing — Always', 'No hidden fees. What we quote is what you pay — every month.'],
            ['⚡', 'Easy Onboarding & Fast Activation', 'Streamlined digital onboarding with a dedicated team.'],
            ['♾️', 'Grows With Your Business', 'Scale without penalties or renegotiation.'],
            ['🤝', "Your Finance Team's Partner", 'Reconciliation support and billing clarity from day one.'],
          ].map(([icon, title, body]) => (
            <div key={title} className="msp-why-card">
              <div className="msp-why-icon">{icon}</div>
              <div className="msp-why-title">{title}</div>
              <div className="msp-why-body">{body}</div>
            </div>
          ))}
        </div>
      </section>

      {/* CTA */}
      <section className="msp-section msp-cta-section">
        <h2 className="msp-section-title">Ready to move forward?</h2>
        <p className="msp-section-desc">
          We&apos;d love to walk you through these savings in detail. Book a time directly, or tell us when works best.
        </p>
        <div className="msp-cta-grid">
          <div className="msp-cta-card">
            <div className="msp-cta-option">Option A</div>
            <div className="msp-cta-title">Book a time directly</div>
            <p className="msp-cta-desc">20–30 minute meetings — we&apos;ll come prepared with your full analysis.</p>
            <a href={calendarLink} target="_blank" rel="noreferrer" className="msp-cta-primary">
              📅 Open scheduling calendar
            </a>
          </div>
          <div className="msp-cta-card">
            <div className="msp-cta-option">Option B</div>
            <div className="msp-cta-title">Suggest a time &amp; we&apos;ll reach out</div>
            {ctaSent ? (
              <div className="msp-cta-success">
                <div className="msp-cta-success-icon">✅</div>
                <div className="msp-cta-success-title">We&apos;ve got it — thank you!</div>
                <p>Your request has been received. We&apos;ll send a calendar invite within one business day.</p>
              </div>
            ) : (
              <div className="msp-cta-form">
                <input
                  className="msp-input"
                  placeholder="Full name *"
                  value={ctaForm.name}
                  onChange={(e) => setCtaForm((p) => ({ ...p, name: e.target.value }))}
                />
                <div className="msp-cta-row">
                  <input
                    className="msp-input"
                    placeholder="Phone *"
                    value={ctaForm.phone}
                    onChange={(e) => setCtaForm((p) => ({ ...p, phone: e.target.value }))}
                  />
                  <input
                    className="msp-input"
                    type="email"
                    placeholder="Email *"
                    value={ctaForm.email}
                    onChange={(e) => setCtaForm((p) => ({ ...p, email: e.target.value }))}
                  />
                </div>
                <div className="msp-cta-row">
                  <input
                    className="msp-input"
                    type="date"
                    value={ctaForm.date}
                    onChange={(e) => setCtaForm((p) => ({ ...p, date: e.target.value }))}
                  />
                  <input
                    className="msp-input"
                    type="time"
                    value={ctaForm.time}
                    onChange={(e) => setCtaForm((p) => ({ ...p, time: e.target.value }))}
                  />
                </div>
                <input
                  className="msp-input"
                  placeholder="Notes (optional)"
                  value={ctaForm.notes}
                  onChange={(e) => setCtaForm((p) => ({ ...p, notes: e.target.value }))}
                />
                <button type="button" className="msp-cta-secondary" onClick={onCtaSubmit}>
                  ✉️ Request my calendar invite
                </button>
              </div>
            )}
          </div>
        </div>
      </section>

      <footer className="msp-footer">
        Candid Solutions · candidpay.app · candid.solutions · Confidential
      </footer>
      </div>
    </div>
  );
}
