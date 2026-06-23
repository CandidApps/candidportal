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
import { detectedPricingStructure } from '@/lib/analysis/statement-pricing-model';

type PackageOption = 'flat3' | 'dual' | PricingStructureId | (string & {});

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
      (s.feeBreakdown?.acctFee ?? 0) +
      (s.feeBreakdown?.otherFixed ?? 0),
  );
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
  openId,
  onToggle,
  children,
}: {
  id: string;
  title: string;
  badge?: string;
  openId: string | null;
  onToggle: (id: string) => void;
  children: React.ReactNode;
}) {
  const open = openId === id;
  return (
    <div className="msp-accordion">
      <button type="button" className="msp-accordion-head" onClick={() => onToggle(id)} aria-expanded={open}>
        <span className="msp-accordion-title">{title}</span>
        {badge && <span className="msp-accordion-badge">{badge}</span>}
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
  const rate = parseFloat(form.currentEffectiveRate) || 0;
  const flat3 = calcFlat3Savings({ currentEffectiveRate: rate, ccVolume: vol });
  const dual = calcDualPricingSavings({
    currentCCRate: form.currentCCRate || String(rate),
    currentACHRate: form.currentACHRate || '1.0',
    ccVolume: vol,
    achVolume: ach,
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
  const bestQuote = providerQuotes[0] ?? null;

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
      vol * (rate / 100))
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
  const proposedMonthlyLow =
    useStructureOptions && proposalOptions.length > 0
      ? Math.min(...proposalOptions.map((o) => o.proposedMonthlyCost))
      : useProviderRates
        ? Math.min(...providerQuotes.map((q) => q.proposedMonthlyCost))
        : flat3.newCost;
  const proposedMonthlyHigh =
    useStructureOptions && proposalOptions.length > 0
      ? Math.max(...proposalOptions.map((o) => o.proposedMonthlyCost))
      : useProviderRates
        ? Math.max(...providerQuotes.map((q) => q.proposedMonthlyCost))
        : dual.newCost;

  const proposedOptionLabels = useStructureOptions
    ? proposalOptions.map((o) => o.label).join(' · ')
    : useProviderRates
      ? providerQuotes.map((q) => q.providerName).join(' · ')
      : 'CandidPay options';

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

        <div className="msp-table-wrap">
          <table className="msp-table">
            <thead>
              <tr>
                <th>Service type</th>
                <th>Current monthly</th>
                <th>Proposed monthly</th>
                <th>Monthly savings</th>
                <th>Annual savings</th>
              </tr>
            </thead>
            <tbody>
              <tr>
                <td>
                  <strong>Payment processing</strong>
                  <div className="msp-table-sub">
                    {useStructureOptions
                      ? `${modelInfo.label} today · ${proposedOptionLabels}`
                      : `${modelInfo.label} analysis`}
                  </div>
                </td>
                <td>{fmt$(curMonthly)}</td>
                <td>
                  {useStructureOptions
                    ? proposalOptions.length === 1
                      ? fmt$(proposalOptions[0].proposedMonthlyCost)
                      : fmtRange(proposedMonthlyLow, proposedMonthlyHigh)
                    : useProviderRates
                      ? providerQuotes.length === 1
                        ? fmt$(bestQuote!.proposedMonthlyCost)
                        : fmtRange(proposedMonthlyLow, proposedMonthlyHigh)
                      : fmtRange(flat3.newCost, dual.newCost)}
                </td>
                <td className="msp-positive">{fmtRange(monthlyLow, monthlyHigh)}</td>
                <td className="msp-positive">{fmtRange(annualLow, annualHigh)}</td>
              </tr>
              <tr className="msp-table-total">
                <td>
                  <strong>Grand total estimated savings</strong>
                </td>
                <td>{fmt$(curMonthly)}/mo</td>
                <td>—</td>
                <td className="msp-positive">{fmtRange(monthlyLow, monthlyHigh)}/mo</td>
                <td className="msp-positive">{fmtRange(annualLow, annualHigh)}/yr</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="msp-footnote">
          * Figures based on {fmt$(vol)}/mo average card volume
          {feeData.periodLabel ? ` · ${feeData.periodLabel}` : ''}. Savings confirmed at contract execution.
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

      {/* Accordion analysis */}
      <section className="msp-section">
        <div className="msp-section-label">Invoice analysis – expand for detail</div>

        <AccordionSection
          id="fees"
          title={`Payment processing — ${modelInfo.label} (current)`}
          badge={`Current ${fmt$(curMonthly)}/mo`}
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
              <div className="msp-line-total">
                <span>Total fees paid ({feeData.months} mo)</span>
                <strong>{fmt$(feeData.total)}</strong>
              </div>
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
              <LineItem label="Effective rate" value={fmtPct(rate)} variant="warn" />
              <LineItem label="Total fees / month (avg)" value={fmt$(feeData.total / feeData.months)} variant="warn" />
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

      {/* Build your package */}
      <section className="msp-section">
        <div className="msp-section-label">Build your package</div>
        <h2 className="msp-section-title">What interests {merchant.split(' ')[0] || 'you'}?</h2>
        <p className="msp-section-desc">Select options to see your estimated savings build up</p>

        {packageSelected.size > 0 && (
          <div className="msp-package-total">
            <span>Your package estimate</span>
            <strong>
              {fmt$(packageSavings.monthly)}/mo · {fmt$(packageSavings.annual)}/yr
            </strong>
          </div>
        )}

        <div className="msp-package-grid">
          {useStructureOptions
            ? proposalOptions.map((opt) => (
                <div
                  key={opt.id}
                  className={`msp-package-card${packageSelected.has(opt.id) ? ' selected' : ''}`}
                >
                  <div className="msp-package-icon">💳</div>
                  <div className="msp-package-name">{opt.label}</div>
                  <div className="msp-package-vendor">{resolvedPartnerName ?? 'Proposed pricing'}</div>
                  <div className="msp-package-compare">
                    <div>
                      <span>Now</span>
                      <strong>{fmt$(opt.currentMonthlyCost)}</strong>
                    </div>
                    <div className="msp-package-arrow">→</div>
                    <div>
                      <span>Proposed</span>
                      <strong>{fmt$(opt.proposedMonthlyCost)}</strong>
                    </div>
                  </div>
                  <div className="msp-package-savings">
                    Saves {fmt$(opt.monthlySavings)}/mo · {fmt$(opt.annualSavings)}/yr
                  </div>
                  <button
                    type="button"
                    className="msp-package-btn"
                    onClick={() => togglePackage(opt.id)}
                  >
                    {packageSelected.has(opt.id) ? '✓ Added to package' : 'Add to my package'}
                  </button>
                </div>
              ))
            : useProviderRates
            ? providerQuotes.map((quote) => (
                <div
                  key={quote.providerId}
                  className={`msp-package-card${packageSelected.has(quote.providerId) ? ' selected' : ''}`}
                >
                  <div className="msp-package-icon">💳</div>
                  <div className="msp-package-name">Merchant processing</div>
                  <div className="msp-package-vendor">{quote.providerName}</div>
                  <div className="msp-package-compare">
                    <div>
                      <span>Now</span>
                      <strong>{fmt$(quote.currentMonthlyCost)}</strong>
                    </div>
                    <div className="msp-package-arrow">→</div>
                    <div>
                      <span>Our rate</span>
                      <strong>{fmt$(quote.proposedMonthlyCost)}</strong>
                    </div>
                  </div>
                  <div className="msp-package-savings">
                    Saves {fmt$(quote.monthlySavings)}/mo · {fmt$(quote.annualSavings)}/yr
                  </div>
                  <button
                    type="button"
                    className="msp-package-btn"
                    onClick={() => togglePackage(quote.providerId)}
                  >
                    {packageSelected.has(quote.providerId) ? '✓ Added to package' : 'Add to my package'}
                  </button>
                </div>
              ))
            : (
              <>
                <div className={`msp-package-card${packageSelected.has('flat3') ? ' selected' : ''}`}>
                  <div className="msp-package-icon">💳</div>
                  <div className="msp-package-name">Flat rate — 3.0%</div>
                  <div className="msp-package-vendor">CandidPay</div>
                  <div className="msp-package-compare">
                    <div>
                      <span>Now</span>
                      <strong>{fmt$(curMonthly)}</strong>
                    </div>
                    <div className="msp-package-arrow">→</div>
                    <div>
                      <span>With Candid</span>
                      <strong>{fmt$(flat3.newCost)}</strong>
                    </div>
                  </div>
                  <div className="msp-package-savings">
                    Saves {fmt$(flat3.monthlySavings)}/mo · {fmt$(flat3.annualSavings)}/yr
                  </div>
                  <button
                    type="button"
                    className="msp-package-btn"
                    onClick={() => togglePackage('flat3')}
                  >
                    {packageSelected.has('flat3') ? '✓ Added to package' : 'Add to my package'}
                  </button>
                </div>

                <div className={`msp-package-card${packageSelected.has('dual') ? ' selected' : ''}`}>
                  <div className="msp-package-icon">⚡</div>
                  <div className="msp-package-name">Dual pricing</div>
                  <div className="msp-package-vendor">CandidPay</div>
                  <div className="msp-package-compare">
                    <div>
                      <span>Now</span>
                      <strong>{fmt$(curMonthly)}</strong>
                    </div>
                    <div className="msp-package-arrow">→</div>
                    <div>
                      <span>With Candid</span>
                      <strong>~$0 net CC</strong>
                    </div>
                  </div>
                  <div className="msp-package-savings">
                    Saves {fmt$(dual.monthlySavings)}/mo · {fmt$(dual.annualSavings)}/yr
                  </div>
                  <button
                    type="button"
                    className="msp-package-btn"
                    onClick={() => togglePackage('dual')}
                  >
                    {packageSelected.has('dual') ? '✓ Added to package' : 'Add to my package'}
                  </button>
                </div>
              </>
            )}
        </div>
      </section>

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
  );
}
