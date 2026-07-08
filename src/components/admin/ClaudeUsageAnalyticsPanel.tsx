'use client';

import { useCallback, useEffect, useState } from 'react';

type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
};

type AreaRow = UsageTotals & { area: string };

type FeatureRow = UsageTotals & { area: string; feature: string; label: string };

type RouteRow = UsageTotals & { route: string; label: string; area: string };

type RecentRow = {
  id: string;
  createdAt: string;
  route: string;
  label: string;
  area: string;
  feature: string;
  trigger: string | null;
  triggerLabel: string | null;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
};

type UsagePayload = {
  days: number;
  areaFilter?: string | null;
  migrationRequired?: boolean;
  pricing?: {
    model: string;
    inputPerMTok: number;
    outputPerMTok: number;
    cacheWritePerMTok: number;
    cacheReadPerMTok: number;
  };
  totals: UsageTotals;
  areas?: string[];
  byArea: AreaRow[];
  byFeature: FeatureRow[];
  byRoute: RouteRow[];
  recent: RecentRow[];
  error?: string;
};

const fmtUsd = (n: number) =>
  `$${n.toLocaleString(undefined, { minimumFractionDigits: 4, maximumFractionDigits: 4 })}`;
const fmtN = (n: number) => n.toLocaleString();

function CostTable({
  rows,
  labelCol,
}: {
  rows: { key: string; label: string; sub?: string; calls: number; estimatedCostUsd: number }[];
  labelCol: string;
}) {
  if (rows.length === 0) {
    return <div style={{ opacity: 0.6, marginBottom: 10 }}>No usage recorded yet.</div>;
  }
  return (
    <table style={{ width: '100%', borderCollapse: 'collapse', marginBottom: 12 }}>
      <thead>
        <tr style={{ opacity: 0.55, fontSize: 9, textTransform: 'uppercase', letterSpacing: '0.05em' }}>
          <th style={{ textAlign: 'left', padding: '0 0 4px', fontWeight: 600 }}>{labelCol}</th>
          <th style={{ textAlign: 'right', padding: '0 0 4px', fontWeight: 600 }}>Calls</th>
          <th style={{ textAlign: 'right', padding: '0 0 4px', fontWeight: 600 }}>Est.</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.key} style={{ borderTop: '1px solid rgba(255,255,255,0.06)' }}>
            <td style={{ padding: '5px 0', lineHeight: 1.35 }}>
              <div>{r.label}</div>
              {r.sub && (
                <div style={{ opacity: 0.5, fontSize: 9, fontFamily: 'var(--font-mono)' }}>{r.sub}</div>
              )}
            </td>
            <td style={{ padding: '5px 0', textAlign: 'right', verticalAlign: 'top' }}>{r.calls}</td>
            <td style={{ padding: '5px 0', textAlign: 'right', fontWeight: 600, verticalAlign: 'top' }}>
              {fmtUsd(r.estimatedCostUsd)}
            </td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function ClaudeUsageAnalyticsPanel({
  collapsed = false,
}: {
  collapsed?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [days, setDays] = useState(7);
  const [areaFilter, setAreaFilter] = useState('');
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<UsagePayload | null>(null);
  const [error, setError] = useState('');

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ days: String(days) });
      if (areaFilter) params.set('area', areaFilter);
      const res = await fetch(`/api/admin/claude-usage?${params}`, { cache: 'no-store' });
      const json = (await res.json()) as UsagePayload;
      if (!res.ok) throw new Error(json.error ?? `Failed (${res.status})`);
      setData(json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load usage');
    } finally {
      setLoading(false);
    }
  }, [days, areaFilter]);

  useEffect(() => {
    if (!open) return;
    void load();
  }, [open, load]);

  if (collapsed) {
    return (
      <button
        type="button"
        className="sb-persistence-push"
        title="Claude AI usage"
        onClick={() => setOpen(true)}
        style={{ marginTop: 6 }}
      >
        AI
      </button>
    );
  }

  return (
    <div className="sb-persistence" style={{ marginTop: 10 }}>
      <div className="sb-persistence-label">Claude AI usage</div>
      <button
        type="button"
        className="sb-persistence-push"
        onClick={() => setOpen((v) => !v)}
      >
        {open ? 'Hide analytics' : 'Open analytics'}
      </button>

      {open && (
        <div
          style={{
            marginTop: 10,
            padding: 10,
            borderRadius: 8,
            background: 'var(--panel-dark, #1a1a1a)',
            border: '1px solid rgba(255,255,255,0.08)',
            fontSize: 11,
            color: 'rgba(255,255,255,0.85)',
            maxHeight: 480,
            overflow: 'auto',
          }}
        >
          <div style={{ display: 'flex', gap: 6, marginBottom: 8, alignItems: 'center', flexWrap: 'wrap' }}>
            <select
              value={days}
              onChange={(e) => setDays(Number(e.target.value))}
              style={{ fontSize: 11, padding: '4px 6px', borderRadius: 4 }}
            >
              <option value={1}>Last 24h</option>
              <option value={7}>Last 7 days</option>
              <option value={30}>Last 30 days</option>
            </select>
            <select
              value={areaFilter}
              onChange={(e) => setAreaFilter(e.target.value)}
              style={{ fontSize: 11, padding: '4px 6px', borderRadius: 4 }}
            >
              <option value="">All areas</option>
              {(data?.areas ?? []).map((a) => (
                <option key={a} value={a}>
                  {a}
                </option>
              ))}
            </select>
            <button type="button" className="assist-mini-btn" disabled={loading} onClick={() => void load()}>
              {loading ? '…' : 'Refresh'}
            </button>
          </div>

          {error && <div style={{ color: '#f87171', marginBottom: 8 }}>{error}</div>}

          {data?.migrationRequired && (
            <div style={{ color: '#fbbf24', marginBottom: 8 }}>
              Apply migrations <code>0067_claude_usage_events.sql</code> and{' '}
              <code>0068_claude_usage_feature_context.sql</code> to start logging.
            </div>
          )}

          {data && !data.migrationRequired && (
            <>
              <div style={{ marginBottom: 10, lineHeight: 1.5 }}>
                <div>
                  <strong>{fmtN(data.totals.calls)}</strong> calls ·{' '}
                  <strong>{fmtUsd(data.totals.estimatedCostUsd)}</strong> est.
                </div>
                <div style={{ opacity: 0.75 }}>
                  In {fmtN(data.totals.inputTokens)} · Out {fmtN(data.totals.outputTokens)}
                </div>
                <div style={{ opacity: 0.75 }}>
                  Cache read {fmtN(data.totals.cacheReadTokens)} · write{' '}
                  {fmtN(data.totals.cacheWriteTokens)}
                </div>
                {data.pricing && (
                  <div style={{ opacity: 0.55, marginTop: 4, fontSize: 10 }}>
                    {data.pricing.model}: ${data.pricing.inputPerMTok}/M in · $
                    {data.pricing.outputPerMTok}/M out · cache read $
                    {data.pricing.cacheReadPerMTok}/M
                  </div>
                )}
              </div>

              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontSize: 10,
                  opacity: 0.6,
                }}
              >
                By product area
              </div>
              <CostTable
                labelCol="Area"
                rows={(data.byArea ?? []).map((r) => ({
                  key: r.area,
                  label: r.area,
                  calls: r.calls,
                  estimatedCostUsd: r.estimatedCostUsd,
                }))}
              />

              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontSize: 10,
                  opacity: 0.6,
                }}
              >
                By feature
              </div>
              <CostTable
                labelCol="Feature"
                rows={(data.byFeature ?? []).map((r) => ({
                  key: `${r.area}::${r.feature}`,
                  label: r.label,
                  sub: r.area,
                  calls: r.calls,
                  estimatedCostUsd: r.estimatedCostUsd,
                }))}
              />

              <div
                style={{
                  fontWeight: 700,
                  marginBottom: 4,
                  textTransform: 'uppercase',
                  letterSpacing: '0.06em',
                  fontSize: 10,
                  opacity: 0.6,
                }}
              >
                Recent
              </div>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
                {data.recent.slice(0, 12).map((r) => (
                  <div key={r.id} style={{ opacity: 0.8, lineHeight: 1.35 }}>
                    <span style={{ fontWeight: 600 }}>{r.label}</span>
                    {r.triggerLabel && (
                      <span style={{ opacity: 0.55 }}> · {r.triggerLabel}</span>
                    )}
                    {' · '}
                    {fmtUsd(r.estimatedCostUsd)}
                    {' · '}
                    {new Date(r.createdAt).toLocaleString(undefined, {
                      month: 'short',
                      day: 'numeric',
                      hour: 'numeric',
                      minute: '2-digit',
                    })}
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );
}
