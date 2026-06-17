// @ts-nocheck — ported from CandidPayEngine; types added incrementally via merchant-analysis.ts
'use client';

/**
 * CandidPay Statement Engine
 * ==========================
 * Main React component. Drop this into your Next.js app and
 * import it wherever you want the engine to render.
 *
 * Usage:
 *   import StatementEngine from '@/components/StatementEngine';
 *   <StatementEngine calendarLink="https://candid.solutions" />
 *
 * Props:
 *   calendarLink   {string}  URL for the scheduling calendar (Option A CTA)
 *   agentName      {string}  Pre-fill the agent name field
 *   onProposalGenerated  {(data) => void}  Called when Generate is clicked
 *   onCalendarRequest    {(data) => void}  Called when Option B form is submitted
 *
 * TODO before going live:
 *   [ ] Set ANTHROPIC_API_KEY in .env.local
 *   [ ] Replace calendarLink prop with your real scheduling URL
 *   [ ] Wire onCalendarRequest to your CRM / email backend
 *   [ ] Wire onProposalGenerated to save proposals to your database
 *   [ ] Gate the "Internal View" tab behind CandidPay management auth
 */

import { useState, useMemo, useCallback, useEffect } from 'react';
import {
  classifyMCC,
  calcFlat3Savings,
  calcDualPricingSavings,
  calcInterchangePlusSavings,
  calcFlatRateSavings,
  calcProfitability,
  PRICING_MODELS,
  fmt$,
  fmtPct,
} from '@/lib/candid-pay/pricingEngine';
import {
  parseStatementWithClaude,
  fileToBase64,
  avgField,
  avgFeeField,
  sortStatements,
  type StatementData,
} from '@/lib/candid-pay/statementParser';
import type { MerchantAnalysisSnapshot, MerchantStatementForm } from '@/lib/candid-pay/merchant-analysis';

// ── Agent tier options
const AGENT_TIERS = [
  { value: 'standard', label: 'Standard — 20–30% (CandidPay handles operations)' },
  { value: 'full',     label: 'Full-Service — up to 50% ($100K–$1M/mo)' },
  { value: 'elite',    label: 'Elite Volume — up to 65% ($1M–$10M/mo)' },
];

// ── Empty form state
const EMPTY_FORM = {
  merchantName: '',
  mcc:          '',
  statementPeriod: '',
  // Contact
  contactName:  '',
  contactTitle: '',
  contactEmail: '',
  contactPhone: '',
  // Statement data
  ccVolume:          '',
  achVolume:          '',
  transactionCount:   '',
  currentEffectiveRate: '',
  pricingModel:       '',
  // Model-specific
  currentMarkupBps:  '',
  cardPresentPct:    '60',
  equipment:         'pos',
  currentCCRate:     '',
  currentACHRate:    '',
  // Key extracted fees
  bascStand:   '',
  stmtMail:    '',
  nonQualFee:  '',
  // Agent
  agentName: '',
  agentTier: 'standard',
};

// ================================================================
// MAIN COMPONENT
// ================================================================
export type StatementEngineProps = {
  calendarLink?: string;
  agentName?: string;
  onProposalGenerated?: (data: unknown) => void;
  onCalendarRequest?: (data: Record<string, string>) => void;
  /** Pre-loaded analysis from My Services (skips upload) */
  initialSnapshot?: MerchantAnalysisSnapshot | null;
  onBack?: () => void;
  /** Member portal: hide internal profitability tab */
  showInternalTab?: boolean;
  /** Customer portal: hide agent form sidebar (upload / MCC / markup fields) */
  showAgentSidebar?: boolean;
  /** Member portal: label for proposal tab */
  proposalTabLabel?: string;
};

export default function StatementEngine({
  calendarLink = 'https://candid.solutions',
  agentName = '',
  onProposalGenerated,
  onCalendarRequest,
  initialSnapshot = null,
  onBack,
  showInternalTab = true,
  showAgentSidebar = true,
  proposalTabLabel = 'Customer proposal',
}: StatementEngineProps) {
  const initialForm = initialSnapshot?.form
    ? { ...EMPTY_FORM, ...initialSnapshot.form, agentName: initialSnapshot.form.agentName || agentName }
    : { ...EMPTY_FORM, agentName };

  const [form, setForm] = useState<MerchantStatementForm>(initialForm);
  const [statements, setStatements] = useState<StatementData[]>(initialSnapshot?.statements ?? []);
  const [stage, setStage] = useState<'upload' | 'parsing' | 'form'>(
    initialSnapshot?.statements?.length ? 'form' : 'upload'
  );
  const [parseMsg, setParseMsg] = useState('Analyzing statement...');
  const [activeTab, setActiveTab] = useState('proposal');
  const [generated, setGenerated] = useState(
    initialSnapshot?.generated ?? Boolean(initialSnapshot?.statements?.length)
  );
  const [ctaSent,     setCtaSent]     = useState(false);
  const [ctaForm,     setCtaForm]     = useState({ name: '', phone: '', email: '', date: '', time: '', notes: '' });

  // ── Derived MCC classification
  const mccInfo = useMemo(() => classifyMCC(form.mcc), [form.mcc]);

  // ── Real-time calculations
  const analysis = useMemo(() => {
    const vol  = parseFloat(form.ccVolume) || 0;
    const ach  = parseFloat(form.achVolume) || 0;
    const rate = parseFloat(form.currentEffectiveRate) || 0;
    const txn  = parseFloat(form.transactionCount) || Math.round(vol / 75);

    const flat3    = calcFlat3Savings({ currentEffectiveRate: rate, ccVolume: vol });
    const dual     = calcDualPricingSavings({
      currentCCRate:  form.currentCCRate  || String(rate),
      currentACHRate: form.currentACHRate || '1.0',
      ccVolume: vol, achVolume: ach,
    });
    const ipSavings = form.pricingModel === 'interchange_plus'
      ? calcInterchangePlusSavings({ currentMarkupBps: form.currentMarkupBps, ccVolume: vol })
      : null;
    const frSavings = form.pricingModel === 'flat_rate'
      ? calcFlatRateSavings({ currentEffectiveRate: rate, ccVolume: vol, cardPresentPct: form.cardPresentPct })
      : null;

    const profitability = calcProfitability({
      ccVolume: vol, achVolume: ach, transactionCount: txn,
      agentTier: form.agentTier, riskLevel: mccInfo.risk,
      proposedRatePct: '3.0',
    });

    return { vol, ach, rate, txn, flat3, dual, ipSavings, frSavings, profitability };
  }, [form, mccInfo]);

  // ── Form field updater
  const setField = useCallback((name, value) => {
    setForm((prev) => ({ ...prev, [name]: value }));
  }, []);

  // ── Handle PDF file upload
  const handleFiles = useCallback(async (files) => {
    const pdfs = Array.from(files).filter(
      (f) => f.type === 'application/pdf' || f.name.endsWith('.pdf')
    );
    if (!pdfs.length) return;

    setStage('parsing');
    const parsed = [];

    for (let i = 0; i < pdfs.length; i++) {
      setParseMsg(`Analyzing statement ${i + 1} of ${pdfs.length}...`);
      const b64    = await fileToBase64(pdfs[i]);
      const result = await parseStatementWithClaude(b64);
      if (result) parsed.push(result);
    }

    if (!parsed.length) {
      setStage('upload');
      return;
    }

    const sorted = sortStatements(parsed);
    setStatements(sorted);
    populateFormFromStatements(sorted);
    setStage('form');
  }, []);

  // ── Auto-populate form from parsed statements
  const populateFormFromStatements = useCallback((stmts) => {
    if (!stmts.length) return;
    const latest = stmts[stmts.length - 1];         // most recent
    const period = stmts.length === 1
      ? latest.statementDate
      : `${stmts[0].statementDate} – ${latest.statementDate}`;

    setForm((prev) => ({
      ...prev,
      merchantName:         latest.merchantName    || '',
      statementPeriod:      period,
      ccVolume:             avgField(stmts, 'totalVolume').toFixed(2),
      transactionCount:     Math.round(avgField(stmts, 'transactionCount')).toString(),
      currentEffectiveRate: avgField(stmts, 'effectiveRate').toFixed(2),
      currentMarkupBps:     Math.round(avgField(stmts, 'processingMarkupBps')).toString(),
      pricingModel:         latest.pricingModel   || '',
      bascStand:            avgFeeField(stmts, 'bascStand').toFixed(2),
      stmtMail:             avgFeeField(stmts, 'stmtMail').toFixed(2),
      nonQualFee:           avgFeeField(stmts, 'nonQualSurcharge').toFixed(2),
    }));
  }, []);

  // ── Generate proposal
  const handleGenerate = useCallback(() => {
    if (!form.ccVolume || !form.currentEffectiveRate) {
      alert('Please enter at least monthly CC volume and effective rate.');
      return;
    }
    setGenerated(true);
    setActiveTab('proposal');
    onProposalGenerated?.({ form, analysis, statements });
  }, [form, analysis, statements, onProposalGenerated]);

  // ── CTA form submit
  const handleCtaSubmit = useCallback(() => {
    const { name, phone, email, date, time } = ctaForm;
    if (!name || !phone || !email || !date || !time) {
      alert('Please fill in all required fields.');
      return;
    }
    setCtaSent(true);
    onCalendarRequest?.({ merchant: form.merchantName, ...ctaForm });
  }, [ctaForm, form.merchantName, onCalendarRequest]);

  // ================================================================
  // RENDER
  // ================================================================
  const tabs = showInternalTab ? ['proposal', 'trend', 'internal'] : ['proposal', 'trend'];

  useEffect(() => {
    if (!showAgentSidebar && initialSnapshot?.statements?.length) {
      setGenerated(true);
      setActiveTab('proposal');
    }
  }, [showAgentSidebar, initialSnapshot]);

  return (
    <div style={{ width: '100%' }}>
      {onBack && (
        <div style={{ padding: '0 0 12px' }}>
          <button
            type="button"
            onClick={onBack}
            style={{
              background: '#fff',
              border: '1px solid #e2e8f0',
              borderRadius: 8,
              padding: '8px 14px',
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
            }}
          >
            ← Back to My Services
          </button>
        </div>
      )}

      <div
        style={{
          ...styles.root,
          gridTemplateColumns: showAgentSidebar ? '320px 1fr' : '1fr',
        }}
      >
      {/* ── LEFT PANEL (agents only) ───────────────────────────── */}
      {showAgentSidebar && (
      <div style={styles.leftPanel}>
        <div style={styles.leftHeader}>
          <div style={styles.leftTitle}>Statement Engine</div>
          <div style={styles.leftSubtitle}>Upload · AI extracts · Proposal generates</div>
        </div>

        <div style={styles.leftBody}>
          {/* UPLOAD STAGE */}
          {stage === 'upload' && (
            <UploadZone onFiles={handleFiles} />
          )}

          {/* PARSING STAGE */}
          {stage === 'parsing' && (
            <div style={styles.parsingOverlay}>
              <div style={styles.spinner} />
              <div style={{ fontWeight: 500, fontSize: 13 }}>{parseMsg}</div>
              <div style={{ fontSize: 11, color: '#94a3b8' }}>AI is extracting pricing model, volume &amp; fee data</div>
            </div>
          )}

          {/* FORM STAGE */}
          {stage === 'form' && (
            <StatementForm
              form={form}
              mccInfo={mccInfo}
              setField={setField}
              statements={statements}
            />
          )}
        </div>

        {stage === 'form' && (
          <div style={styles.leftFooter}>
            <button style={styles.generateBtn} onClick={handleGenerate}>
              ✨ &nbsp;Generate customer proposal
            </button>
          </div>
        )}

        <div style={styles.statusBar}>
          {stage === 'upload'  && 'Upload a PDF statement to begin'}
          {stage === 'parsing' && parseMsg}
          {stage === 'form'    && `${statements.length} statement${statements.length !== 1 ? 's' : ''} loaded — review and generate`}
        </div>
      </div>
      )}

      {/* ── RIGHT PANEL ─────────────────────────────────────────── */}
      <div style={styles.rightPanel}>
        {/* Tab bar */}
        <div style={styles.tabBar}>
          {tabs.map((t) => (
            <button
              key={t}
              style={{ ...styles.tab, ...(activeTab === t ? styles.tabActive : {}) }}
              onClick={() => setActiveTab(t)}
            >
              {t === 'proposal' ? `📄 ${proposalTabLabel}`
                : t === 'trend' ? '📈 Trend analysis'
                : '🔒 Internal view'}
            </button>
          ))}
        </div>

        <div style={styles.rightBody}>
          {activeTab === 'proposal' && (
            <CustomerProposal
              form={form}
              analysis={analysis}
              generated={generated}
              calendarLink={calendarLink}
              ctaForm={ctaForm}
              setCtaForm={setCtaForm}
              ctaSent={ctaSent}
              onCtaSubmit={handleCtaSubmit}
            />
          )}
          {activeTab === 'trend' && (
            <TrendAnalysis statements={statements} />
          )}
          {activeTab === 'internal' && (
            <InternalView form={form} analysis={analysis} mccInfo={mccInfo} generated={generated} />
          )}
        </div>
      </div>
      </div>
    </div>
  );
}

// ================================================================
// SUB-COMPONENTS
// ================================================================

// ── Upload Zone
function UploadZone({ onFiles }) {
  const [dragging, setDragging] = useState(false);
  return (
    <div>
      <label
        style={{ ...styles.uploadZone, ...(dragging ? styles.uploadZoneDrag : {}) }}
        onDragOver={(e) => { e.preventDefault(); setDragging(true); }}
        onDragLeave={() => setDragging(false)}
        onDrop={(e) => { e.preventDefault(); setDragging(false); onFiles(e.dataTransfer.files); }}
      >
        <input type="file" accept=".pdf" multiple style={{ display: 'none' }}
          onChange={(e) => onFiles(e.target.files)} />
        <div style={{ fontSize: 30, marginBottom: 8 }}>☁️</div>
        <div style={{ fontSize: 13, fontWeight: 500, marginBottom: 4 }}>Drop PDF statements here</div>
        <div style={{ fontSize: 11, color: '#94a3b8', lineHeight: 1.5 }}>
          Upload 1–3 months for trend analysis<br />AI auto-fills all form fields
        </div>
      </label>
    </div>
  );
}

// ── Statement Form
function StatementForm({ form, mccInfo, setField, statements }) {
  const modelInfo = PRICING_MODELS[form.pricingModel];
  const riskColors = { low: '#16a34a', mid: '#d97706', high: '#dc2626' };

  return (
    <div>
      {/* Pricing model detection banner */}
      {modelInfo && (
        <div style={{ ...styles.modelBanner, borderLeftColor: modelInfo.color }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: modelInfo.color }}>Pricing model detected</div>
          <div style={{ fontSize: 12, marginTop: 3 }}>
            <strong>{modelInfo.label}</strong> — {modelInfo.evidence}
          </div>
        </div>
      )}

      {/* MERCHANT INFO */}
      <SectionHead label="Merchant" />
      <Field label="Business name" autofilled={!!statements.length}>
        <input style={styles.input} value={form.merchantName}
          onChange={(e) => setField('merchantName', e.target.value)} placeholder="e.g. Crystal Lake Country Club" />
      </Field>
      <div style={styles.row2}>
        <Field label="MCC code">
          <input style={styles.input} type="number" value={form.mcc}
            onChange={(e) => setField('mcc', e.target.value)} placeholder="e.g. 7997" />
          {form.mcc && (
            <div style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6 }}>
              <span style={{ background: riskColors[mccInfo.risk], color: '#fff', borderRadius: 4, padding: '1px 7px', fontSize: 10, fontWeight: 700 }}>
                {mccInfo.risk.toUpperCase()}
              </span>
              <span style={{ fontSize: 11, color: '#64748b' }}>{mccInfo.label}</span>
            </div>
          )}
        </Field>
        <Field label="Statement period" autofilled={!!statements.length}>
          <input style={{ ...styles.input, background: '#f8fafc' }} value={form.statementPeriod} readOnly />
        </Field>
      </div>

      {/* CONTACT */}
      <SectionHead label="Primary contact (who CandidPay works with)" />
      <div style={styles.row2}>
        <Field label="Contact name">
          <input style={styles.input} value={form.contactName}
            onChange={(e) => setField('contactName', e.target.value)} placeholder="e.g. Sarah Johnson" />
        </Field>
        <Field label="Title / role">
          <input style={styles.input} value={form.contactTitle}
            onChange={(e) => setField('contactTitle', e.target.value)} placeholder="e.g. CFO" />
        </Field>
      </div>
      <div style={styles.row2}>
        <Field label="Email">
          <input style={styles.input} type="email" value={form.contactEmail}
            onChange={(e) => setField('contactEmail', e.target.value)} placeholder="sarah@club.com" />
        </Field>
        <Field label="Phone">
          <input style={styles.input} type="tel" value={form.contactPhone}
            onChange={(e) => setField('contactPhone', e.target.value)} placeholder="(815) 000-0000" />
        </Field>
      </div>

      {/* STATEMENT DATA */}
      <SectionHead label="Statement data" autofilled={!!statements.length} />
      <div style={styles.row2}>
        <Field label="Avg monthly CC volume ($)">
          <input style={styles.input} type="number" value={form.ccVolume}
            onChange={(e) => setField('ccVolume', e.target.value)} placeholder="15000" />
        </Field>
        <Field label="Avg monthly ACH volume ($)">
          <input style={styles.input} type="number" value={form.achVolume}
            onChange={(e) => setField('achVolume', e.target.value)} placeholder="0" />
        </Field>
      </div>
      <div style={styles.row2}>
        <Field label="Avg transaction count">
          <input style={styles.input} type="number" value={form.transactionCount}
            onChange={(e) => setField('transactionCount', e.target.value)} />
        </Field>
        <Field label="Avg effective rate (%)">
          <input style={styles.input} type="number" step="0.01" value={form.currentEffectiveRate}
            onChange={(e) => setField('currentEffectiveRate', e.target.value)} placeholder="6.37" />
        </Field>
      </div>

      <Field label="Current pricing model">
        <select style={styles.input} value={form.pricingModel}
          onChange={(e) => setField('pricingModel', e.target.value)}>
          <option value="">— Select or detected automatically —</option>
          {Object.entries(PRICING_MODELS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
      </Field>

      {form.pricingModel === 'interchange_plus' && (
        <Field label="Markup above interchange (bps)" autofilled={!!statements.length}>
          <input style={styles.input} type="number" value={form.currentMarkupBps}
            onChange={(e) => setField('currentMarkupBps', e.target.value)} placeholder="e.g. 232" />
        </Field>
      )}
      {form.pricingModel === 'flat_rate' && (
        <div style={styles.row2}>
          <Field label="% volume in-person">
            <input style={styles.input} type="number" value={form.cardPresentPct}
              onChange={(e) => setField('cardPresentPct', e.target.value)} />
          </Field>
          <Field label="Equipment">
            <select style={styles.input} value={form.equipment}
              onChange={(e) => setField('equipment', e.target.value)}>
              <option value="pos">POS Terminal</option>
              <option value="mobile">Mobile / Tap</option>
              <option value="online">Online Only</option>
              <option value="both">Both</option>
            </select>
          </Field>
        </div>
      )}
      {form.pricingModel === 'dual_pricing' && (
        <div style={styles.row2}>
          <Field label="Current CC rate (%)">
            <input style={styles.input} type="number" step="0.25" value={form.currentCCRate}
              onChange={(e) => setField('currentCCRate', e.target.value)} />
          </Field>
          <Field label="Current ACH rate (%)">
            <input style={styles.input} type="number" step="0.25" value={form.currentACHRate}
              onChange={(e) => setField('currentACHRate', e.target.value)} />
          </Field>
        </div>
      )}

      {/* KEY EXTRACTED FEES */}
      <SectionHead label="Key fees extracted" autofilled={!!statements.length} />
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10 }}>
        <Field label="BASC STAND/mo ($)">
          <input style={styles.input} type="number" step="0.01" value={form.bascStand}
            onChange={(e) => setField('bascStand', e.target.value)} />
        </Field>
        <Field label="Stmt mail/mo ($)">
          <input style={styles.input} type="number" step="0.01" value={form.stmtMail}
            onChange={(e) => setField('stmtMail', e.target.value)} />
        </Field>
        <Field label="Non-qual fee/mo ($)">
          <input style={styles.input} type="number" step="0.01" value={form.nonQualFee}
            onChange={(e) => setField('nonQualFee', e.target.value)} />
        </Field>
      </div>

      {/* AGENT */}
      <SectionHead label="Agent (internal)" />
      <Field label="Agent name">
        <input style={styles.input} value={form.agentName}
          onChange={(e) => setField('agentName', e.target.value)} placeholder="e.g. Bryan Willis" />
      </Field>
      <Field label="Compensation tier">
        <select style={styles.input} value={form.agentTier}
          onChange={(e) => setField('agentTier', e.target.value)}>
          {AGENT_TIERS.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
        </select>
      </Field>
    </div>
  );
}

// ── Customer Proposal
function CustomerProposal({ form, analysis, generated, calendarLink, ctaForm, setCtaForm, ctaSent, onCtaSubmit }) {
  if (!generated) {
    return (
      <EmptyState icon="📋" title="No proposal generated yet"
        body="Fill in the form and click Generate customer proposal." />
    );
  }

  const { vol, rate, txn, flat3, dual } = analysis;
  const modelInfo = PRICING_MODELS[form.pricingModel] || PRICING_MODELS['interchange_plus'];
  const basc      = parseFloat(form.bascStand)   || 0;
  const stmtMail  = parseFloat(form.stmtMail)    || 0;
  const nq        = parseFloat(form.nonQualFee)  || 0;
  const curCost   = vol * (rate / 100);
  const bestAnnual = Math.max(flat3.annualSavings, dual.annualSavings);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      {/* Header */}
      <div style={{ ...styles.card, display: 'flex', justifyContent: 'space-between', alignItems: 'flex-end' }}>
        <div>
          <div style={{ fontSize: 20, fontWeight: 600 }}>Candid<em>Pay</em></div>
          <div style={{ fontSize: 11, color: '#64748b' }}>Merchant Services — Statement Analysis</div>
        </div>
        <div style={{ textAlign: 'right' }}>
          <div style={{ fontSize: 14, fontWeight: 600 }}>{form.merchantName || '—'}</div>
          {form.contactName && (
            <div style={{ fontSize: 12, color: '#64748b' }}>Attn: {form.contactName}{form.contactTitle ? `, ${form.contactTitle}` : ''}</div>
          )}
          {form.contactEmail && <div style={{ fontSize: 11, color: '#64748b' }}>{form.contactEmail}</div>}
          {form.statementPeriod && <div style={{ fontSize: 11, color: '#64748b' }}>Statement: {form.statementPeriod}</div>}
        </div>
      </div>

      {/* Pricing model callout */}
      <div style={{ ...styles.card, borderLeft: `4px solid ${modelInfo.color}`, borderRadius: '0 12px 12px 0' }}>
        <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b', marginBottom: 4 }}>Current pricing model</div>
        <div style={{ fontWeight: 600, fontSize: 14 }}>{modelInfo.label}</div>
        <div style={{ fontSize: 12, color: '#64748b', marginTop: 3 }}>{modelInfo.evidence}</div>
      </div>

      {/* Current situation */}
      <div>
        <SectionLabel>Your current situation</SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8 }}>
          <Metric label="Avg monthly volume" value={fmt$(vol)} />
          <Metric label="Total fees/mo" value={fmt$(curCost)} danger />
          <Metric label="Effective rate" value={fmtPct(rate)} danger />
          <Metric label="Avg ticket" value={txn > 0 ? fmt$(vol / txn) : '—'} />
        </div>

        {/* Hidden fee flags */}
        {(basc > 0 || stmtMail > 0 || nq > 0) && (
          <div style={{ ...styles.card, marginTop: 10 }}>
            {basc > 0      && <FlagRow icon="🚨" label="BASC STAND — hidden plan fee"             value={`${fmt$(basc)}/mo`}      danger />}
            {nq > 0        && <FlagRow icon="⚠️" label="Non-qualified downgrade surcharge"        value={`${fmt$(nq)}/mo`}        warn />}
            {stmtMail > 0  && <FlagRow icon="📮" label="Paper statement fee (STMT MAIL)"          value={`${fmt$(stmtMail)}/mo · ${fmt$(stmtMail * 12)}/yr`} warn />}
          </div>
        )}
      </div>

      {/* Options */}
      <div>
        <SectionLabel>CandidPay options</SectionLabel>
        <div style={styles.row2}>
          <OptionCard color="#1a9e8c" label="Option A — Flat rate" rate="3.0%"
            rows={[
              ['Monthly cost', fmt$(flat3.newCost)],
              ['Monthly savings', fmt$(flat3.monthlySavings), '#16a34a'],
              ['Annual savings',  fmt$(flat3.annualSavings),  '#16a34a'],
            ]}
            badge={flat3.monthlySavings > 0 ? `Save ${fmt$(flat3.monthlySavings)}/mo` : 'Minimal change'} />
          <OptionCard color="#c07828" label="Option B — Dual pricing" rate={`${fmtPct(dual.newCCRate)} CC`}
            sub={`CC to cardholder · ACH at ${fmtPct(dual.newACHRate)}`}
            rows={[
              ['Your CC cost',    '$0.00 (cardholder)', '#16a34a'],
              ['Monthly savings', fmt$(dual.monthlySavings), '#16a34a'],
              ['Annual savings',  fmt$(dual.annualSavings),  '#16a34a'],
            ]}
            badge="Maximum savings option" badgeColor="#a16207" />
        </div>

        {bestAnnual > 0 && (
          <div style={{ background: '#f0fdf4', border: '1px solid #86efac', borderRadius: 10, padding: '14px 18px', marginTop: 12, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 11, color: '#16a34a' }}>Best annual savings opportunity</div>
              <div style={{ fontSize: 24, fontWeight: 600, color: '#15803d' }}>{fmt$(bestAnnual)}</div>
            </div>
            <div style={{ fontSize: 12, color: '#16a34a', textAlign: 'right' }}>
              Based on {fmt$(vol)}/mo avg volume<br />No contract lock-in required
            </div>
          </div>
        )}
      </div>

      {/* Why CandidPay */}
      <div>
        <SectionLabel>Why Candid<em>Pay</em></SectionLabel>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 10 }}>
          {[
            ['🇺🇸', '100% U.S.-Based & Local',    'Locally operated — real people who know your account.'],
            ['🏆', 'World-Class Support',          'Many CFOs treat us as an extension of their finance team.'],
            ['📊', 'Transparent Pricing',          'What we quote is exactly what you pay — every month.'],
            ['⚡', 'Easy Onboarding',              'Streamlined digital onboarding with a dedicated team.'],
            ['♾️', 'Grows With Your Business',     'No volume penalties or renegotiation — ever.'],
            ['🤝', 'Your Finance Team\'s Partner', 'Reconciliation support, clarity, always available.'],
          ].map(([icon, title, body]) => (
            <div key={title} style={{ ...styles.card, padding: '14px 16px' }}>
              <div style={{ fontSize: 20, marginBottom: 6 }}>{icon}</div>
              <div style={{ fontWeight: 600, fontSize: 12, marginBottom: 4 }}>{title}</div>
              <div style={{ fontSize: 11, color: '#4b5563', lineHeight: 1.5 }}>{body}</div>
            </div>
          ))}
        </div>
      </div>

      {/* CTA */}
      <div style={styles.card}>
        <div style={{ fontSize: 18, fontWeight: 600, marginBottom: 8 }}>Ready to move forward?</div>
        <div style={{ fontSize: 13, color: '#475569', marginBottom: 18 }}>
          Book a time directly or suggest when works and we'll reach out.
        </div>
        <div style={styles.row2}>
          {/* Option A */}
          <div style={{ border: '1px solid #e2e8f0', borderTop: '3px solid #c07828', borderRadius: '0 0 12px 12px', padding: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b', marginBottom: 4 }}>Option A</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 8 }}>Book a time directly</div>
            <p style={{ fontSize: 12, color: '#475569', marginBottom: 14, lineHeight: 1.5 }}>Meetings are typically 20–30 minutes.</p>
            <a href={calendarLink} target="_blank" rel="noreferrer"
              style={{ display: 'block', textAlign: 'center', padding: '11px 0', background: '#c07828', color: '#fff', borderRadius: 8, fontWeight: 600, fontSize: 13, textDecoration: 'none' }}>
              📅 &nbsp;Open scheduling calendar
            </a>
          </div>

          {/* Option B */}
          <div style={{ border: '1px solid #e2e8f0', borderTop: '3px solid #0d1b2e', borderRadius: '0 0 12px 12px', padding: 16 }}>
            <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color: '#64748b', marginBottom: 4 }}>Option B</div>
            <div style={{ fontWeight: 600, fontSize: 15, marginBottom: 6 }}>Suggest a time</div>
            {ctaSent ? (
              <div style={{ textAlign: 'center', padding: '20px 0', color: '#16a34a' }}>
                <div style={{ fontSize: 28, marginBottom: 6 }}>✅</div>
                <div style={{ fontWeight: 600 }}>Request received!</div>
                <div style={{ fontSize: 12, color: '#64748b', marginTop: 4 }}>We'll reach out within one business day.</div>
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                <input style={styles.input} placeholder={`Full Name *${form.contactName ? ` (e.g. ${form.contactName})` : ''}`}
                  value={ctaForm.name} onChange={(e) => setCtaForm((p) => ({ ...p, name: e.target.value }))} />
                <div style={styles.row2}>
                  <input style={styles.input} placeholder="Phone *"
                    value={ctaForm.phone} onChange={(e) => setCtaForm((p) => ({ ...p, phone: e.target.value }))} />
                  <input style={styles.input} type="email" placeholder="Email *"
                    value={ctaForm.email} onChange={(e) => setCtaForm((p) => ({ ...p, email: e.target.value }))} />
                </div>
                <div style={styles.row2}>
                  <input style={styles.input} type="date"
                    value={ctaForm.date} onChange={(e) => setCtaForm((p) => ({ ...p, date: e.target.value }))} />
                  <input style={styles.input} type="time"
                    value={ctaForm.time} onChange={(e) => setCtaForm((p) => ({ ...p, time: e.target.value }))} />
                </div>
                <input style={styles.input} placeholder="Notes (optional)"
                  value={ctaForm.notes} onChange={(e) => setCtaForm((p) => ({ ...p, notes: e.target.value }))} />
                <button style={{ ...styles.generateBtn, marginTop: 0 }} onClick={onCtaSubmit}>
                  📨 &nbsp;Request calendar invite
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ fontSize: 11, color: '#94a3b8', textAlign: 'center', paddingTop: 8 }}>
        © 2026 Candid<em>Pay</em> · Candid Solutions · candid.solutions · candidpay.app
      </div>
    </div>
  );
}

// ── Trend Analysis
function TrendAnalysis({ statements }) {
  if (statements.length < 2) {
    return <EmptyState icon="📈" title="Upload multiple months" body="Upload 2–3 months of statements to see trend analysis and cumulative overpayments." />;
  }

  const sorted = sortStatements(statements);
  const totVol  = sorted.reduce((s, st) => s + (st.totalVolume || 0), 0);
  const totFees = sorted.reduce((s, st) => s + (st.totalFees  || 0), 0);
  const avgRate = totFees / totVol * 100;
  const bascTot = sorted.reduce((s, st) => s + (st.feeBreakdown?.bascStand || 0), 0);
  const stmtTot = sorted.reduce((s, st) => s + (st.feeBreakdown?.stmtMail  || 0), 0);
  const nqTot   = sorted.reduce((s, st) => s + (st.feeBreakdown?.nonQualSurcharge || 0), 0);
  const flatSave = Math.max(totFees - totVol * 0.03, 0);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div style={{ fontWeight: 600, fontSize: 14 }}>
        {sorted.length}-Month Trend — {sorted[0].statementDate} → {sorted[sorted.length-1].statementDate}
      </div>

      {/* Month table */}
      <div style={styles.card}>
        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12 }}>
          <thead>
            <tr style={{ background: '#f8fafc' }}>
              {['Month', 'Volume', 'Fees', 'Eff. Rate', 'Transactions', 'BASC STAND', 'Non-Qual', 'Pricing Model'].map((h) => (
                <th key={h} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 500, color: '#64748b', borderBottom: '1px solid #e2e8f0', whiteSpace: 'nowrap' }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.map((s, i) => {
              const model = PRICING_MODELS[s.pricingModel];
              return (
                <tr key={i} style={{ background: i % 2 ? '#f8fafc' : '#fff', borderBottom: '1px solid #e2e8f0' }}>
                  <td style={{ padding: '8px 10px', fontWeight: 500 }}>{s.statementDate}</td>
                  <td style={{ padding: '8px 10px' }}>{fmt$(s.totalVolume || 0)}</td>
                  <td style={{ padding: '8px 10px', color: '#dc2626' }}>{fmt$(s.totalFees || 0)}</td>
                  <td style={{ padding: '8px 10px', color: s.effectiveRate > 6 ? '#dc2626' : s.effectiveRate > 4 ? '#d97706' : '#16a34a', fontWeight: 600 }}>{fmtPct(s.effectiveRate)}</td>
                  <td style={{ padding: '8px 10px' }}>{s.transactionCount || 0}</td>
                  <td style={{ padding: '8px 10px' }}>{s.feeBreakdown?.bascStand ? fmt$(s.feeBreakdown.bascStand) : '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{s.feeBreakdown?.nonQualSurcharge ? fmt$(s.feeBreakdown.nonQualSurcharge) : '—'}</td>
                  <td style={{ padding: '8px 10px' }}>{model ? <span style={{ background: '#e0f2fe', color: '#0369a1', padding: '2px 8px', borderRadius: 12, fontSize: 11 }}>{model.label}</span> : '—'}</td>
                </tr>
              );
            })}
            <tr style={{ background: '#fef2f2', borderTop: '2px solid #fca5a5' }}>
              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#dc2626' }}>{sorted.length}-mo total</td>
              <td style={{ padding: '8px 10px', fontWeight: 600 }}>{fmt$(totVol)}</td>
              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#dc2626' }}>{fmt$(totFees)}</td>
              <td style={{ padding: '8px 10px', fontWeight: 600, color: '#dc2626' }}>{fmtPct(avgRate)} avg</td>
              <td colSpan={4} style={{ padding: '8px 10px', fontSize: 11, color: '#dc2626' }}>
                Paying ~{fmt$(totFees / sorted.length)}/mo in total fees
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      {/* Cumulative flags */}
      <div style={styles.card}>
        <div style={{ fontSize: 11, fontWeight: 600, color: '#64748b', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: 12 }}>
          {sorted.length}-Month Cumulative Overpayments
        </div>
        {bascTot > 0 && <FlagRow icon="🚨" label={`BASC STAND (hidden plan fee)`} value={`${fmt$(bascTot)} across ${sorted.length} months — ${fmt$(bascTot/sorted.length)}/mo recurring`} danger />}
        {stmtTot > 0 && <FlagRow icon="📮" label={`Paper statement fee`} value={`${fmt$(stmtTot)} paid — ${fmt$(stmtTot/sorted.length*12)}/yr annualized`} warn />}
        {nqTot   > 0 && <FlagRow icon="⚠️" label={`Non-qualified surcharges`} value={`${fmt$(nqTot)} in NQ penalties — premium cards triggering downgrades`} warn />}
        <FlagRow icon="✅" label={`Flat 3% would have saved`} value={`${fmt$(flatSave)} across these ${sorted.length} months (${fmt$(flatSave/sorted.length)}/mo avg)`} success />
      </div>
    </div>
  );
}

// ── Internal View
function InternalView({ form, analysis, mccInfo, generated }) {
  if (!generated) {
    return <EmptyState icon="🔒" title="Generate a proposal first" body="Profitability data will appear here after you generate a proposal." />;
  }

  const { profitability: p } = analysis;
  const riskColors = { low: '#16a34a', mid: '#d97706', high: '#dc2626' };
  const riskBg     = { low: '#dcfce7', mid: '#fef3c7', high: '#fee2e2' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
      <div style={{ background: '#fee2e2', border: '1px solid #fca5a5', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#dc2626', display: 'flex', alignItems: 'center', gap: 8 }}>
        🔒 CandidPay management only — never shown to merchant or agent
      </div>

      <div style={styles.row2}>
        {/* Risk */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Risk Classification</div>
          <IRow label="MCC"            value={form.mcc || '—'} />
          <IRow label="Industry"       value={mccInfo.label} small />
          <IRow label="Risk tier"      value={<span style={{ background: riskBg[mccInfo.risk], color: riskColors[mccInfo.risk], padding: '2px 10px', borderRadius: 6, fontSize: 12, fontWeight: 700 }}>{mccInfo.risk.toUpperCase()}</span>} />
          <IRow label="Revenue share"  value={fmtPct(p.revenueSharePct, 0) + ' to CandidPay'} success />
          <IRow label="BIN monitoring" value={p.binMonitoringBps > 0 ? `${p.binMonitoringBps} bps/mo` : 'None'} danger={p.binMonitoringBps > 0} />
          <IRow label="Risk monthly fee" value={p.riskMonthlyFee > 0 ? fmt$(p.riskMonthlyFee) + '/mo' : '$0.00'} danger={p.riskMonthlyFee > 0} />
        </div>

        {/* Buy costs */}
        <div style={styles.card}>
          <div style={styles.cardTitle}>Schedule A Buy Costs</div>
          <IRow label="Interchange markup (2 bps)" value={fmt$(p.interchangeCost)} />
          <IRow label="Per-transaction fees"        value={fmt$(p.perTxnCost)} />
          <IRow label="Fixed monthly (maint, PCI)"  value={fmt$(p.fixedMonthly)} />
          <IRow label="BIN monitoring cost"         value={fmt$(p.binCost) + (p.riskMonthlyFee > 0 ? ` + ${fmt$(p.riskMonthlyFee)}` : '')} />
          <IRow label="Total buy cost" value={fmt$(p.totalBuyCost)} danger bold />
        </div>
      </div>

      {/* P&L */}
      <div style={styles.card}>
        <div style={styles.cardTitle}>Monthly P&L Estimate</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 8, marginBottom: 14 }}>
          <Metric label="Gross revenue"      value={fmt$(p.grossRevenue)} />
          <Metric label="CandidPay margin"   value={fmt$(p.totalMargin)} />
          <Metric label="Agent payout"       value={fmt$(p.agentPayout)} warn />
          <Metric label="CandidPay net"      value={fmt$(p.netProfit)} success />
        </div>
        <IRow label={`Agent tier / %`}   value={`${form.agentTier} — ${fmtPct(p.agentPct, 0)}`} />
        <IRow label="Annual net profit"   value={fmt$(p.annualNetProfit)} success bold />
        <IRow label="Net margin %"        value={fmtPct(p.marginPct)}
          success={p.marginPct > 15} warn={p.marginPct <= 15 && p.marginPct > 5} danger={p.marginPct <= 5} />
      </div>
    </div>
  );
}

// ================================================================
// SMALL REUSABLE ELEMENTS
// ================================================================
function SectionHead({ label, autofilled }) {
  return (
    <div style={{ display: 'flex', alignItems: 'center', gap: 8, margin: '14px 0 8px', fontSize: 10, fontWeight: 600, color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '.08em' }}>
      {label}
      {autofilled && <span style={{ background: '#dcfce7', color: '#15803d', border: '1px solid #86efac', borderRadius: 4, padding: '1px 6px', fontSize: 10, fontWeight: 600 }}>auto-filled</span>}
      <div style={{ flex: 1, height: 1, background: '#e2e8f0' }} />
    </div>
  );
}
function SectionLabel({ children }) {
  return <div style={{ fontSize: 11, textTransform: 'uppercase', letterSpacing: '.08em', color: '#94a3b8', marginBottom: 8 }}>{children}</div>;
}
function Field({ label, children, autofilled }) {
  return (
    <div style={{ marginBottom: 10 }}>
      <label style={{ display: 'block', fontSize: 10, fontWeight: 500, color: '#64748b', marginBottom: 4, letterSpacing: '.04em', textTransform: 'uppercase' }}>
        {label}
        {autofilled && <span style={{ background: '#dcfce7', color: '#15803d', fontSize: 10, padding: '1px 5px', borderRadius: 3, marginLeft: 5 }}>auto</span>}
      </label>
      {children}
    </div>
  );
}
function Metric({ label, value, danger, warn, success }) {
  const color = danger ? '#dc2626' : warn ? '#d97706' : success ? '#16a34a' : undefined;
  return (
    <div style={{ background: '#f8fafc', borderRadius: 8, padding: '10px 12px', textAlign: 'center' }}>
      <div style={{ fontSize: 11, color: '#64748b', marginBottom: 3 }}>{label}</div>
      <div style={{ fontSize: 16, fontWeight: 600, color }}>{value}</div>
    </div>
  );
}
function FlagRow({ icon, label, value, danger, warn, success }) {
  const color = danger ? '#dc2626' : warn ? '#d97706' : success ? '#16a34a' : '#64748b';
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '8px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
      <span style={{ color: '#64748b' }}>{icon} {label}</span>
      <span style={{ fontWeight: 600, color }}>{value}</span>
    </div>
  );
}
function OptionCard({ color, label, rate, sub, rows, badge, badgeColor }) {
  return (
    <div style={{ ...styles.card, borderTop: `3px solid ${color}`, borderRadius: '0 0 12px 12px' }}>
      <div style={{ fontSize: 10, textTransform: 'uppercase', letterSpacing: '.08em', color, fontWeight: 600, marginBottom: 4 }}>{label}</div>
      <div style={{ fontSize: 24, fontWeight: 600, marginBottom: sub ? 4 : 8 }}>{rate}</div>
      {sub && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 8 }}>{sub}</div>}
      {rows.map(([l, v, c]) => (
        <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
          <span style={{ color: '#64748b' }}>{l}</span>
          <span style={{ fontWeight: 600, color: c }}>{v}</span>
        </div>
      ))}
      {badge && (
        <div style={{ marginTop: 8, background: badgeColor ? '#fef3c7' : '#dcfce7', color: badgeColor || '#15803d', border: `1px solid ${badgeColor ? '#fcd34d' : '#86efac'}`, borderRadius: 20, display: 'inline-block', padding: '2px 10px', fontSize: 11, fontWeight: 600 }}>
          {badge}
        </div>
      )}
    </div>
  );
}
function IRow({ label, value, small, success, warn, danger, bold }) {
  const color = success ? '#16a34a' : warn ? '#d97706' : danger ? '#dc2626' : undefined;
  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', padding: '7px 0', borderBottom: '1px solid #f1f5f9', fontSize: 12 }}>
      <span style={{ color: '#64748b' }}>{label}</span>
      <span style={{ fontWeight: bold ? 700 : 600, color, fontSize: small ? 11 : 12, textAlign: 'right', maxWidth: 180 }}>{value}</span>
    </div>
  );
}
function EmptyState({ icon, title, body }) {
  return (
    <div style={{ textAlign: 'center', padding: '50px 20px', color: '#94a3b8' }}>
      <div style={{ fontSize: 36, marginBottom: 12 }}>{icon}</div>
      <div style={{ fontSize: 14, fontWeight: 500, color: '#475569', marginBottom: 6 }}>{title}</div>
      <div style={{ fontSize: 13 }}>{body}</div>
    </div>
  );
}

// ================================================================
// STYLES
// ================================================================
const styles = {
  root: {
    position: 'relative' as const,
    display: 'grid',
    gridTemplateColumns: '320px 1fr',
    minHeight: 680,
    border: '1px solid #e2e8f0',
    borderRadius: 12,
    overflow: 'hidden',
    fontFamily: 'system-ui, -apple-system, sans-serif',
    fontSize: 14,
    color: '#0f172a',
  },
  leftPanel: {
    borderRight: '1px solid #e2e8f0',
    display: 'flex',
    flexDirection: 'column',
    background: '#fff',
    overflow: 'hidden',
  },
  leftHeader: {
    padding: '14px 16px 12px',
    borderBottom: '1px solid #e2e8f0',
  },
  leftTitle: { fontSize: 15, fontWeight: 600 },
  leftSubtitle: { fontSize: 11, color: '#94a3b8', marginTop: 2 },
  leftBody: { flex: 1, overflowY: 'auto', padding: '14px 16px' },
  leftFooter: { padding: '12px 16px', borderTop: '1px solid #e2e8f0', background: '#f8fafc' },
  statusBar: { padding: '8px 16px', fontSize: 11, color: '#94a3b8', borderTop: '1px solid #e2e8f0' },
  rightPanel: { display: 'flex', flexDirection: 'column', background: '#f8fafc', overflow: 'hidden' },
  tabBar: { display: 'flex', background: '#fff', borderBottom: '1px solid #e2e8f0', padding: '0 12px' },
  tab: {
    padding: '10px 14px', fontSize: 13, cursor: 'pointer',
    border: 'none', background: 'none', color: '#94a3b8',
    borderBottom: '2px solid transparent', marginBottom: -1,
    fontFamily: 'inherit',
  },
  tabActive: { color: '#0f172a', borderBottomColor: '#0f172a', fontWeight: 500 },
  rightBody: { flex: 1, overflowY: 'auto', padding: 16 },
  uploadZone: {
    border: '1.5px dashed #cbd5e1', borderRadius: 12, padding: '28px 20px',
    textAlign: 'center', cursor: 'pointer', display: 'block',
    background: '#f8fafc', transition: 'all .2s',
  },
  uploadZoneDrag: { borderColor: '#60a5fa', background: '#eff6ff' },
  parsingOverlay: {
    display: 'flex', flexDirection: 'column', alignItems: 'center',
    padding: '40px 0', gap: 12,
  },
  spinner: {
    width: 28, height: 28,
    border: '3px solid #e2e8f0', borderTopColor: '#60a5fa',
    borderRadius: '50%',
    animation: 'spin 0.7s linear infinite',
  },
  generateBtn: {
    width: '100%', padding: '10px 0',
    background: '#1a9e8c', color: '#fff', border: 'none',
    borderRadius: 8, fontSize: 13, fontWeight: 600,
    cursor: 'pointer', fontFamily: 'inherit',
  },
  input: {
    width: '100%', padding: '8px 11px',
    border: '1px solid #e2e8f0', borderRadius: 8,
    background: '#fff', color: '#0f172a',
    fontFamily: 'inherit', fontSize: 13, outline: 'none',
  },
  row2: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 0 },
  card: {
    background: '#fff', border: '1px solid #e2e8f0',
    borderRadius: 12, padding: '14px 16px',
  },
  cardTitle: {
    fontSize: 10, fontWeight: 600, textTransform: 'uppercase',
    letterSpacing: '.08em', color: '#94a3b8', marginBottom: 10,
  },
  modelBanner: {
    padding: '10px 14px', borderRadius: '0 8px 8px 0',
    background: '#f0f9ff', borderLeft: '4px solid #1a9e8c',
    border: '1px solid #bae6fd', marginBottom: 12, fontSize: 13,
  },
};
