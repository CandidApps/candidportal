import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import { CLAUDE_SONNET_PRICING, resolveClaudeRoute } from '@/lib/claude-usage';

export const dynamic = 'force-dynamic';

type UsageRow = {
  id: string;
  created_at: string;
  route_label: string;
  feature_area: string | null;
  feature_name: string | null;
  usage_trigger: string | null;
  user_id: string | null;
  model: string;
  input_tokens: number;
  output_tokens: number;
  cache_creation_input_tokens: number;
  cache_read_input_tokens: number;
  max_tokens: number | null;
  estimated_cost_usd: number;
};

type UsageTotals = {
  calls: number;
  inputTokens: number;
  outputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  estimatedCostUsd: number;
};

function sinceIso(days: number): string {
  const d = new Date();
  d.setUTCDate(d.getUTCDate() - days);
  return d.toISOString();
}

function roundUsd(n: number): number {
  return Math.round(n * 1_000_000) / 1_000_000;
}

function emptyTotals(): UsageTotals {
  return {
    calls: 0,
    inputTokens: 0,
    outputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    estimatedCostUsd: 0,
  };
}

function addRowToTotals(totals: UsageTotals, row: UsageRow): void {
  totals.calls += 1;
  totals.inputTokens += row.input_tokens || 0;
  totals.outputTokens += row.output_tokens || 0;
  totals.cacheReadTokens += row.cache_read_input_tokens || 0;
  totals.cacheWriteTokens += row.cache_creation_input_tokens || 0;
  totals.estimatedCostUsd += Number(row.estimated_cost_usd) || 0;
}

function routeMeta(row: UsageRow) {
  const resolved = resolveClaudeRoute(row.route_label);
  return {
    route: row.route_label,
    area: row.feature_area ?? resolved.area,
    feature: row.feature_name ?? resolved.feature,
    label: resolved.label,
    description: resolved.description,
    trigger: row.usage_trigger,
  };
}

const TRIGGER_LABELS: Record<string, string> = {
  manual_sync: 'Manual sync',
  auto_refresh: 'Auto refresh',
  contract: 'Contract mode',
  customer: 'Customer mode',
};

function triggerLabel(trigger: string | null | undefined): string | null {
  if (!trigger) return null;
  return TRIGGER_LABELS[trigger] ?? trigger.replace(/_/g, ' ');
}

export async function GET(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const days = Math.min(90, Math.max(1, Number(searchParams.get('days')) || 7));
  const areaFilter = searchParams.get('area')?.trim() || null;

  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('claude_usage_events')
    .select('*')
    .gte('created_at', sinceIso(days))
    .order('created_at', { ascending: false })
    .limit(2000);

  if (error) {
    if (/claude_usage_events/.test(error.message)) {
      return NextResponse.json({
        migrationRequired: true,
        days,
        pricing: CLAUDE_SONNET_PRICING,
        totals: emptyTotals(),
        byArea: [],
        byFeature: [],
        byRoute: [],
        recent: [],
        areas: [],
      });
    }
    return NextResponse.json({ error: error.message }, { status: 500 });
  }

  let rows = (data ?? []) as UsageRow[];
  if (areaFilter) {
    rows = rows.filter((row) => routeMeta(row).area === areaFilter);
  }

  const totals = emptyTotals();
  const byAreaMap = new Map<string, UsageTotals & { area: string }>();
  const byFeatureMap = new Map<string, UsageTotals & { area: string; feature: string; label: string }>();
  const byRouteMap = new Map<string, UsageTotals & { route: string; label: string; area: string }>();

  for (const row of rows) {
    addRowToTotals(totals, row);
    const meta = routeMeta(row);

    const areaEntry = byAreaMap.get(meta.area) ?? { area: meta.area, ...emptyTotals() };
    addRowToTotals(areaEntry, row);
    byAreaMap.set(meta.area, areaEntry);

    const featureKey = `${meta.area}::${meta.feature}`;
    const featureEntry = byFeatureMap.get(featureKey) ?? {
      area: meta.area,
      feature: meta.feature,
      label: meta.label,
      ...emptyTotals(),
    };
    addRowToTotals(featureEntry, row);
    byFeatureMap.set(featureKey, featureEntry);

    const routeEntry = byRouteMap.get(row.route_label) ?? {
      route: row.route_label,
      label: meta.label,
      area: meta.area,
      ...emptyTotals(),
    };
    addRowToTotals(routeEntry, row);
    byRouteMap.set(row.route_label, routeEntry);
  }

  const sortByCost = <T extends { estimatedCostUsd: number; calls: number }>(a: T, b: T) =>
    b.estimatedCostUsd - a.estimatedCostUsd || b.calls - a.calls;

  const byArea = [...byAreaMap.values()]
    .map((r) => ({ ...r, estimatedCostUsd: roundUsd(r.estimatedCostUsd) }))
    .sort(sortByCost);

  const byFeature = [...byFeatureMap.values()]
    .map((r) => ({ ...r, estimatedCostUsd: roundUsd(r.estimatedCostUsd) }))
    .sort(sortByCost);

  const byRoute = [...byRouteMap.values()]
    .map((r) => ({ ...r, estimatedCostUsd: roundUsd(r.estimatedCostUsd) }))
    .sort(sortByCost);

  const areas = [...new Set([...byAreaMap.keys()].sort())];

  const recent = rows.slice(0, 40).map((r) => {
    const meta = routeMeta(r);
    return {
      id: r.id,
      createdAt: r.created_at,
      route: r.route_label,
      label: meta.label,
      area: meta.area,
      feature: meta.feature,
      trigger: meta.trigger,
      triggerLabel: triggerLabel(meta.trigger),
      inputTokens: r.input_tokens,
      outputTokens: r.output_tokens,
      cacheReadTokens: r.cache_read_input_tokens,
      cacheWriteTokens: r.cache_creation_input_tokens,
      estimatedCostUsd: roundUsd(Number(r.estimated_cost_usd) || 0),
    };
  });

  return NextResponse.json({
    days,
    areaFilter,
    pricing: CLAUDE_SONNET_PRICING,
    totals: { ...totals, estimatedCostUsd: roundUsd(totals.estimatedCostUsd) },
    areas,
    byArea,
    byFeature,
    byRoute,
    recent,
  });
}
