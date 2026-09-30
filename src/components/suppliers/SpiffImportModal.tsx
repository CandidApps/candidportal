'use client';

import { useMemo, useRef, useState } from 'react';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import { formatMemberReward, type IncentiveCampaign } from '@/lib/incentive-campaigns';
import {
  parseSpiffImport,
  rewriteSpiffRows,
  saveSpiffImport,
} from '@/lib/incentive-campaigns-client';
import { customerCopyIssues } from '@/lib/incentive-import/guardrails';
import { matchProvider, providerLabel } from '@/lib/incentive-import/provider-match';
import {
  SPIFF_LAYOUT_LABEL,
  SPIFF_REWRITE_BATCH,
  type RawSpiffRow,
  type SpiffDraft,
  type SpiffFlag,
  type SpiffParseResult,
  type SpiffSaveResult,
} from '@/lib/incentive-import/types';
import { spiffImportKey } from '@/lib/incentive-import/layouts';
import type { SolutionProviderRecord } from '@/lib/solution-providers-types';

type Step = 'input' | 'processing' | 'review' | 'done';
type FlagFilter = 'all' | SpiffFlag | 'unmatched';

type ReviewRow = SpiffDraft & {
  providerDbId: number | null;
  selected: boolean;
  expanded: boolean;
};

const CONCURRENCY = 5;
const SECONDS_PER_BATCH = 60;

const FLAG_LABEL: Record<SpiffFlag, string> = { yes: 'Yes', review: 'Review', no: 'No' };
const FLAG_HELP: Record<SpiffFlag, string> = {
  yes: 'Customer-facing. Goes live on member cards once saved and in its date window.',
  review: 'Saved as Needs review. Hidden from members until you set it to Yes.',
  no: 'Saved admin-only. Never shown to members.',
};

const overlay: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  zIndex: 1200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const card: React.CSSProperties = {
  width: 1320,
  maxWidth: '98vw',
  height: 'min(94vh, 980px)',
  background: 'var(--white, #fff)',
  borderRadius: 12,
  border: '1px solid var(--gray-border)',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
};

const field: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '6px 8px',
  fontSize: 12,
  fontFamily: 'inherit',
  lineHeight: 1.4,
  resize: 'vertical',
};

const muted: React.CSSProperties = { fontSize: 11, color: 'var(--gray)' };

function fallbackDraft(raw: RawSpiffRow, error: string): SpiffDraft {
  return {
    rowNumber: raw.rowNumber,
    raw,
    provider: raw.provider ?? '',
    sourceProgram: raw.sourceProgram,
    importKey: spiffImportKey(raw),
    flag: 'review',
    flagReason: 'AI rewrite failed for this row. Edit the copy by hand or re-run the import.',
    guardrailIssues: [],
    internalName: raw.name,
    internalDescription: raw.description,
    internalTerms: raw.terms,
    payoutRaw: raw.payout,
    payoutType: null,
    payoutValue: null,
    payoutUpTo: false,
    minMonthlyCharge: null,
    minTermMonths: null,
    payoutTimeline: raw.payoutTimeline,
    customerName: raw.prior?.name ?? '',
    customerDescription: raw.prior?.description ?? '',
    customerCriteria: raw.prior?.criteria ?? '',
    startsOn: raw.startsOn,
    endsOn: raw.endsOn,
    link: raw.link,
    error,
  };
}

function chunk<T>(list: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < list.length; i += size) out.push(list.slice(i, i + size));
  return out;
}

export function SpiffImportModal({
  providers,
  existingCampaigns,
  onClose,
  onImported,
}: {
  providers: SolutionProviderRecord[];
  existingCampaigns: IncentiveCampaign[];
  onClose: () => void;
  onImported: () => void;
}) {
  const [step, setStep] = useState<Step>('input');
  const [file, setFile] = useState<File | null>(null);
  const [text, setText] = useState('');
  const [program, setProgram] = useState('');
  const [parsed, setParsed] = useState<SpiffParseResult | null>(null);
  const [limit, setLimit] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState({ done: 0, total: 0, failed: 0 });
  const [rows, setRows] = useState<ReviewRow[]>([]);
  const [filter, setFilter] = useState<FlagFilter>('all');
  const [saveResult, setSaveResult] = useState<SpiffSaveResult | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const providerOptions = useMemo(
    () =>
      providers
        .filter((p) => p.dbId != null)
        .map((p) => ({ value: String(p.dbId), label: providerLabel(p) }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [providers],
  );

  const existingKeys = useMemo(() => {
    const set = new Set<string>();
    for (const c of existingCampaigns) {
      if (c.internal?.importKey) set.add(`${c.providerDbId}|${c.internal.importKey}`);
    }
    return set;
  }, [existingCampaigns]);

  const runParse = async (sheet?: string) => {
    setBusy(true);
    setError(null);
    try {
      const result = await parseSpiffImport({ file, text: file ? undefined : text, sheet, program: program.trim() || undefined });
      setParsed(result);
      if (!program.trim() && result.sourceProgram) setProgram(result.sourceProgram);
      if (!result.layout) setError('No SPIFF columns found on this sheet. Pick another sheet or check the headers.');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read the file');
    } finally {
      setBusy(false);
    }
  };

  const startRewrite = async () => {
    if (!parsed?.rows.length) return;
    const n = Number(limit);
    const source = (Number.isFinite(n) && n > 0 ? parsed.rows.slice(0, n) : parsed.rows).map((r) => ({
      ...r,
      sourceProgram: r.sourceProgram || program.trim() || undefined,
    }));
    const batches = chunk(source, SPIFF_REWRITE_BATCH);
    const controller = new AbortController();
    abortRef.current = controller;
    setStep('processing');
    setError(null);
    setProgress({ done: 0, total: source.length, failed: 0 });

    const results: SpiffDraft[] = [];
    let cursor = 0;
    const worker = async () => {
      while (cursor < batches.length && !controller.signal.aborted) {
        const batch = batches[cursor++]!;
        let drafts: SpiffDraft[] | null = null;
        let lastError = 'AI rewrite failed';
        for (let attempt = 0; attempt < 2 && !drafts && !controller.signal.aborted; attempt++) {
          try {
            drafts = await rewriteSpiffRows(batch, controller.signal);
          } catch (e) {
            lastError = e instanceof Error ? e.message : lastError;
          }
        }
        const out = drafts ?? batch.map((r) => fallbackDraft(r, lastError));
        results.push(...out);
        setProgress((p) => ({
          ...p,
          done: p.done + batch.length,
          failed: p.failed + (drafts ? 0 : batch.length),
        }));
      }
    };
    await Promise.all(Array.from({ length: Math.min(CONCURRENCY, batches.length) }, worker));
    if (controller.signal.aborted) {
      setStep('input');
      return;
    }
    results.sort((a, b) => a.rowNumber - b.rowNumber);
    setRows(
      results.map((d) => ({
        ...d,
        providerDbId: matchProvider(d.provider, providers),
        selected: true,
        expanded: false,
      })),
    );
    setStep('review');
  };

  const patchRow = (rowNumber: number, patch: Partial<ReviewRow>) =>
    setRows((prev) => prev.map((r) => (r.rowNumber === rowNumber ? { ...r, ...patch } : r)));

  const counts = useMemo(() => {
    const c = { all: rows.length, yes: 0, review: 0, no: 0, unmatched: 0 };
    for (const r of rows) {
      c[r.flag] += 1;
      if (r.providerDbId == null) c.unmatched += 1;
    }
    return c;
  }, [rows]);

  const visible = useMemo(
    () =>
      rows.filter((r) => {
        if (filter === 'all') return true;
        if (filter === 'unmatched') return r.providerDbId == null;
        return r.flag === filter;
      }),
    [rows, filter],
  );

  const selected = rows.filter((r) => r.selected);
  const selectedUnmatched = selected.filter((r) => r.providerDbId == null).length;

  const selectWhere = (pred: (r: ReviewRow) => boolean) =>
    setRows((prev) => prev.map((r) => ({ ...r, selected: pred(r) })));

  const save = async () => {
    setBusy(true);
    setError(null);
    try {
      const result = await saveSpiffImport(
        selected
          .filter((r) => r.providerDbId != null)
          .map(({ raw: _raw, guardrailIssues: _g, error: _e, selected: _s, expanded: _x, providerDbId, ...rest }) => ({
            ...rest,
            providerDbId: providerDbId as number,
          })),
      );
      setSaveResult(result);
      setStep('done');
      onImported();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(false);
    }
  };

  const close = () => {
    abortRef.current?.abort();
    onClose();
  };

  return (
    <div style={overlay} role="presentation" onClick={(e) => e.target === e.currentTarget && step !== 'processing' && close()}>
      <div style={card} role="dialog" aria-labelledby="spiff-import-title">
        <div
          style={{
            padding: '14px 20px',
            borderBottom: '1px solid var(--gray-border)',
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'flex-start',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div>
            <div id="spiff-import-title" style={{ fontSize: 18, fontWeight: 700 }}>
              Import SPIFFs
            </div>
            <div style={{ ...muted, fontSize: 12, marginTop: 4, maxWidth: 760, lineHeight: 1.45 }}>
              Upload a supplier SPIFF sheet or paste a flyer. AI cleans the supplier text, decides whether each item
              fits customer cash back, and rewrites it for members. You review everything before it saves.
            </div>
          </div>
          <button
            type="button"
            onClick={close}
            aria-label="Close"
            style={{ border: 'none', background: 'transparent', fontSize: 18, cursor: 'pointer', color: 'var(--gray)' }}
          >
            ✕
          </button>
        </div>

        {step === 'input' ? (
          <div style={{ padding: 20, overflowY: 'auto', display: 'grid', gap: 16, maxWidth: 760 }}>
            <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600 }}>
              Spreadsheet (.xlsx, .xls, .csv)
              <input
                type="file"
                accept=".xlsx,.xls,.csv"
                onChange={(e) => {
                  setFile(e.target.files?.[0] ?? null);
                  setParsed(null);
                  setError(null);
                }}
              />
            </label>
            <div style={{ ...muted, fontSize: 12 }}>or paste one flyer / promo</div>
            <textarea
              value={text}
              disabled={Boolean(file)}
              onChange={(e) => {
                setText(e.target.value);
                setParsed(null);
              }}
              rows={5}
              placeholder="Paste SPIFF text from a PDF, email or portal…"
              style={{ ...field, fontSize: 13 }}
            />
            <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, maxWidth: 320 }}>
              Program (who pays the SPIFF)
              <input
                value={program}
                onChange={(e) => setProgram(e.target.value)}
                placeholder="e.g. Sandler, AppDirect, Telarus"
                style={{ ...field, fontSize: 13 }}
              />
              <span style={{ ...muted, fontWeight: 400 }}>Used when the sheet has no Source column.</span>
            </label>

            {parsed && parsed.sheets.length > 1 ? (
              <label style={{ display: 'grid', gap: 6, fontSize: 13, fontWeight: 600, maxWidth: 420 }}>
                Sheet
                <select
                  value={parsed.sheetName ?? ''}
                  onChange={(e) => void runParse(e.target.value)}
                  style={{ ...field, fontSize: 13 }}
                >
                  {parsed.sheets.map((s) => (
                    <option key={s.name} value={s.name}>
                      {s.name} — {s.layout ? SPIFF_LAYOUT_LABEL[s.layout] : 'not a SPIFF sheet'} ({s.rowCount} rows)
                    </option>
                  ))}
                </select>
              </label>
            ) : null}

            {parsed?.layout ? (
              <div
                style={{
                  padding: 12,
                  borderRadius: 8,
                  background: 'var(--gray-light, #f5f7fa)',
                  fontSize: 13,
                  display: 'grid',
                  gap: 8,
                }}
              >
                <div>
                  <strong>{parsed.rows.length}</strong> row{parsed.rows.length === 1 ? '' : 's'} ready ·{' '}
                  {SPIFF_LAYOUT_LABEL[parsed.layout]}
                  {parsed.rows.some((r) => r.prior) ? ' · includes earlier customer-facing copy (used as a hint)' : ''}
                </div>
                {parsed.rows.length > SPIFF_REWRITE_BATCH ? (
                  <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 12 }}>
                    Process first
                    <input
                      value={limit}
                      onChange={(e) => setLimit(e.target.value.replace(/[^\d]/g, ''))}
                      placeholder="all"
                      inputMode="numeric"
                      style={{ ...field, width: 70 }}
                    />
                    rows (blank = all, about{' '}
                    {Math.max(1, Math.round((Math.ceil(parsed.rows.length / SPIFF_REWRITE_BATCH / CONCURRENCY) * SECONDS_PER_BATCH) / 60))}{' '}
                    min)
                  </label>
                ) : null}
              </div>
            ) : null}

            {error ? <div style={{ color: 'var(--red, #C8281E)', fontSize: 13 }}>{error}</div> : null}

            <div style={{ display: 'flex', gap: 8 }}>
              {!parsed?.layout ? (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 'none' }}
                  disabled={busy || (!file && !text.trim())}
                  onClick={() => void runParse()}
                >
                  {busy ? 'Reading…' : 'Read file'}
                </button>
              ) : (
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 'none' }}
                  disabled={busy || !parsed.rows.length}
                  onClick={() => void startRewrite()}
                >
                  Rewrite with AI
                </button>
              )}
            </div>
          </div>
        ) : null}

        {step === 'processing' ? (
          <div style={{ padding: 40, display: 'grid', gap: 14, justifyItems: 'center', alignContent: 'center', flex: 1 }}>
            <div style={{ fontSize: 15, fontWeight: 600 }}>
              Rewriting {progress.done} / {progress.total} rows…
            </div>
            <div style={{ width: 420, height: 8, borderRadius: 4, background: 'var(--gray-border)', overflow: 'hidden' }}>
              <div
                style={{
                  width: `${progress.total ? (progress.done / progress.total) * 100 : 0}%`,
                  height: '100%',
                  background: 'var(--red, #C8281E)',
                  transition: 'width 0.3s',
                }}
              />
            </div>
            {progress.failed ? (
              <div style={{ ...muted, fontSize: 12 }}>{progress.failed} rows failed and will be flagged for manual review.</div>
            ) : null}
            <button type="button" className="btn-secondary" style={{ flex: 'none' }} onClick={() => abortRef.current?.abort()}>
              Cancel
            </button>
          </div>
        ) : null}

        {step === 'review' ? (
          <>
            <div
              style={{
                padding: '10px 20px',
                borderBottom: '1px solid var(--gray-border)',
                display: 'flex',
                gap: 10,
                alignItems: 'center',
                flexWrap: 'wrap',
                flexShrink: 0,
              }}
            >
              <div className="comm-tabs" style={{ marginBottom: 0 }}>
                {(
                  [
                    ['all', 'All'],
                    ['yes', 'Yes'],
                    ['review', 'Review'],
                    ['no', 'No'],
                    ['unmatched', 'Needs supplier'],
                  ] as Array<[FlagFilter, string]>
                ).map(([key, label]) => (
                  <button
                    key={key}
                    type="button"
                    className={`comm-tab${filter === key ? ' active' : ''}`}
                    onClick={() => setFilter(key)}
                  >
                    {label} <span style={{ opacity: 0.6 }}>({counts[key]})</span>
                  </button>
                ))}
              </div>
              <span style={{ ...muted, fontSize: 12, marginLeft: 'auto' }}>Select:</span>
              <button type="button" className="btn-secondary" style={{ flex: 'none' }} onClick={() => selectWhere(() => true)}>
                All
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ flex: 'none' }}
                onClick={() => selectWhere((r) => r.flag === 'yes')}
              >
                Yes only
              </button>
              <button type="button" className="btn-secondary" style={{ flex: 'none' }} onClick={() => selectWhere(() => false)}>
                None
              </button>
            </div>

            <div style={{ flex: 1, minHeight: 0, overflowY: 'auto' }}>
              <table className="admin-mini-table comm-table" style={{ tableLayout: 'fixed', width: '100%' }}>
                <thead style={{ position: 'sticky', top: 0, zIndex: 1, background: 'var(--white, #fff)' }}>
                  <tr>
                    <th style={{ width: 34 }} />
                    <th style={{ width: 230 }}>Supplier</th>
                    <th style={{ width: 300 }}>Original (admin only)</th>
                    <th>Customer-facing</th>
                    <th style={{ width: 220 }}>Fit &amp; member reward</th>
                  </tr>
                </thead>
                <tbody>
                  {visible.map((r) => {
                    const liveIssues = [
                      ...new Set(
                        [r.customerName, r.customerDescription, r.customerCriteria].flatMap(customerCopyIssues),
                      ),
                    ];
                    const updatesExisting =
                      r.providerDbId != null && existingKeys.has(`${r.providerDbId}|${r.importKey}`);
                    const rewardFor = (tier: 'paid' | 'basic') =>
                      formatMemberReward(
                        {
                          source: 'supplier_spiff',
                          structureType: r.payoutType ?? undefined,
                          structureValue: r.payoutValue ?? undefined,
                          internal: { payoutUpTo: r.payoutUpTo },
                        },
                        tier,
                      );
                    return (
                      <tr key={r.rowNumber} style={{ verticalAlign: 'top', opacity: r.selected ? 1 : 0.55 }}>
                        <td>
                          <input
                            type="checkbox"
                            checked={r.selected}
                            aria-label={`Include row ${r.rowNumber}`}
                            onChange={(e) => patchRow(r.rowNumber, { selected: e.target.checked })}
                          />
                        </td>
                        <td>
                          <SearchableSelect
                            value={r.providerDbId == null ? '' : String(r.providerDbId)}
                            options={providerOptions}
                            onChange={(v) => patchRow(r.rowNumber, { providerDbId: v ? Number(v) : null })}
                            placeholder="Search suppliers…"
                            emptyLabel="Match supplier…"
                            inputStyle={{ ...field, borderColor: r.providerDbId == null ? 'var(--amber)' : undefined }}
                            aria-label={`Supplier for row ${r.rowNumber}`}
                          />
                          <div style={{ ...muted, marginTop: 4 }}>
                            Sheet: {r.provider || '—'}
                            <br />
                            {[r.sourceProgram, r.category, `row ${r.rowNumber}`].filter(Boolean).join(' · ')}
                          </div>
                          {updatesExisting ? (
                            <span className="campaign-status campaign-status--scheduled" style={{ marginTop: 4, display: 'inline-block' }}>
                              Updates existing
                            </span>
                          ) : null}
                        </td>
                        <td style={{ fontSize: 12, lineHeight: 1.45 }}>
                          <div style={{ fontWeight: 600 }}>{r.internalName || r.raw.name || '—'}</div>
                          <div>{r.payoutRaw || <span style={muted}>No payout stated</span>}</div>
                          <div style={muted}>
                            {[
                              r.minTermMonths ? `${r.minTermMonths}-mo term` : null,
                              r.minMonthlyCharge ? `min $${r.minMonthlyCharge.toLocaleString()}/mo` : null,
                              r.endsOn ? `ends ${r.endsOn}` : null,
                            ]
                              .filter(Boolean)
                              .join(' · ')}
                          </div>
                          <button
                            type="button"
                            onClick={() => patchRow(r.rowNumber, { expanded: !r.expanded })}
                            style={{ border: 'none', background: 'none', padding: 0, color: 'var(--red, #C8281E)', fontSize: 11, cursor: 'pointer', marginTop: 4 }}
                          >
                            {r.expanded ? 'Hide details' : 'Show details'}
                          </button>
                          {r.expanded ? (
                            <div style={{ marginTop: 6, whiteSpace: 'pre-wrap', display: 'grid', gap: 6 }}>
                              {r.internalDescription ? <div>{r.internalDescription}</div> : null}
                              {r.internalTerms ? (
                                <div>
                                  <strong>Terms:</strong> {r.internalTerms}
                                </div>
                              ) : null}
                              {r.payoutTimeline ? (
                                <div>
                                  <strong>Paid:</strong> {r.payoutTimeline}
                                </div>
                              ) : null}
                              {r.adminNotes ? (
                                <div>
                                  <strong>Notes:</strong> {r.adminNotes}
                                </div>
                              ) : null}
                              {r.raw.prior?.flag ? (
                                <div style={muted}>Earlier flag in sheet: {r.raw.prior.flag}</div>
                              ) : null}
                              {r.link ? (
                                /^https?:\/\//.test(r.link) ? (
                                  <a href={r.link} target="_blank" rel="noreferrer">
                                    Source link
                                  </a>
                                ) : (
                                  <div style={muted}>Source: {r.link}</div>
                                )
                              ) : null}
                            </div>
                          ) : null}
                        </td>
                        <td>
                          <div style={{ display: 'grid', gap: 6 }}>
                            <input
                              value={r.customerName}
                              onChange={(e) => patchRow(r.rowNumber, { customerName: e.target.value })}
                              placeholder="Customer-facing name"
                              style={{ ...field, fontWeight: 600 }}
                            />
                            <textarea
                              value={r.customerDescription}
                              onChange={(e) => patchRow(r.rowNumber, { customerDescription: e.target.value })}
                              placeholder="What the service is, in plain language"
                              rows={2}
                              style={field}
                            />
                            <textarea
                              value={r.customerCriteria}
                              onChange={(e) => patchRow(r.rowNumber, { customerCriteria: e.target.value })}
                              placeholder="Conditions (term, minimum monthly charge…)"
                              rows={2}
                              style={field}
                            />
                            {r.flag !== 'no' && liveIssues.length ? (
                              <div style={{ fontSize: 11, color: 'var(--amber)', lineHeight: 1.4 }}>
                                {liveIssues.join(' · ')}
                              </div>
                            ) : null}
                            {r.error ? <div style={{ fontSize: 11, color: 'var(--red, #C8281E)' }}>{r.error}</div> : null}
                          </div>
                        </td>
                        <td style={{ fontSize: 12 }}>
                          <select
                            value={r.flag}
                            onChange={(e) => patchRow(r.rowNumber, { flag: e.target.value as SpiffFlag })}
                            aria-label={`Customer-facing fit for row ${r.rowNumber}`}
                            title={FLAG_HELP[r.flag]}
                            style={{ ...field, width: 'auto', fontWeight: 700 }}
                          >
                            {(Object.keys(FLAG_LABEL) as SpiffFlag[]).map((f) => (
                              <option key={f} value={f}>
                                {FLAG_LABEL[f]}
                              </option>
                            ))}
                          </select>
                          {r.flagReason ? <div style={{ ...muted, marginTop: 4, lineHeight: 1.4 }}>{r.flagReason}</div> : null}
                          {r.flag !== 'no' ? (
                            <div style={{ marginTop: 8, lineHeight: 1.45 }}>
                              {rewardFor('paid') ? (
                                <>
                                  <div>
                                    <span style={muted}>Paid:</span> {rewardFor('paid')}
                                  </div>
                                  <div>
                                    <span style={muted}>Basic:</span> {rewardFor('basic')}
                                  </div>
                                </>
                              ) : (
                                <span style={muted}>No per-customer amount</span>
                              )}
                            </div>
                          ) : null}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>

            <div
              style={{
                padding: '12px 20px',
                borderTop: '1px solid var(--gray-border)',
                display: 'flex',
                gap: 12,
                alignItems: 'center',
                flexShrink: 0,
              }}
            >
              <div style={{ fontSize: 12, color: 'var(--gray)', lineHeight: 1.45 }}>
                {selected.length} selected · Yes rows go live, Review rows save as Needs review, No rows save admin-only.
                {selectedUnmatched ? (
                  <span style={{ color: 'var(--amber)' }}> {selectedUnmatched} selected rows still need a supplier.</span>
                ) : null}
              </div>
              {error ? <div style={{ color: 'var(--red, #C8281E)', fontSize: 12 }}>{error}</div> : null}
              <div style={{ marginLeft: 'auto', display: 'flex', gap: 8 }}>
                <button type="button" className="btn-secondary" style={{ flex: 'none' }} onClick={() => setStep('input')}>
                  Back
                </button>
                <button
                  type="button"
                  className="btn-primary"
                  style={{ flex: 'none' }}
                  disabled={busy || !selected.length || selectedUnmatched > 0}
                  onClick={() => void save()}
                >
                  {busy ? 'Saving…' : `Save ${selected.length} selected`}
                </button>
              </div>
            </div>
          </>
        ) : null}

        {step === 'done' && saveResult ? (
          <div style={{ padding: 32, display: 'grid', gap: 12, maxWidth: 640 }}>
            <div style={{ fontSize: 16, fontWeight: 700 }}>Import saved</div>
            <div style={{ fontSize: 13 }}>
              {saveResult.created} created · {saveResult.updated} updated
              {saveResult.errors.length ? ` · ${saveResult.errors.length} failed` : ''}
            </div>
            {saveResult.errors.length ? (
              <ul style={{ fontSize: 12, color: 'var(--red, #C8281E)', margin: 0, paddingLeft: 18 }}>
                {saveResult.errors.slice(0, 20).map((e) => (
                  <li key={e.rowNumber}>
                    Row {e.rowNumber}: {e.error}
                  </li>
                ))}
              </ul>
            ) : null}
            <div>
              <button type="button" className="btn-primary" style={{ flex: 'none' }} onClick={onClose}>
                Done
              </button>
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
