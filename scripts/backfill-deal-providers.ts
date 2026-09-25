#!/usr/bin/env npx tsx
/**
 * CR-0050 — Backfill deal.solution / vendor free text onto unique solution provider names.
 * Unique-match only (exact or single contains). Dry-run by default.
 *
 *   npx tsx scripts/backfill-deal-providers.ts
 *   npx tsx scripts/backfill-deal-providers.ts --apply
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';

function loadEnv() {
  const envPath = resolve(process.cwd(), '.env.local');
  if (!existsSync(envPath)) throw new Error('Missing .env.local');
  for (const line of readFileSync(envPath, 'utf8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const idx = trimmed.indexOf('=');
    if (idx === -1) continue;
    const key = trimmed.slice(0, idx);
    const value = trimmed.slice(idx + 1);
    if (!process.env[key]) process.env[key] = value;
  }
}

function normName(s: string): string {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Strip common legal/marketing suffixes so "Vonage Business" ↔ "Vonage". */
function stripProviderNoise(s: string): string {
  return normName(s)
    .replace(
      /\b(inc|llc|ltd|corp|corporation|company|co|for business|business|communications|telecom|telecommunications|solutions|services)\b/g,
      '',
    )
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Unique safe match only — exact, normalized exact, or unique after stripping
 * common suffixes. No loose substring matches (avoids "Candid Contract" → "CANDID").
 */
function matchName(text: string, names: string[]): string | null {
  const needle = text.trim();
  if (!needle) return null;
  const exact = names.filter((n) => n.trim().toLowerCase() === needle.toLowerCase());
  if (exact.length === 1) return exact[0];
  const needleN = normName(needle);
  const exactNorm = names.filter((n) => normName(n) === needleN);
  if (exactNorm.length === 1) return exactNorm[0];
  const needleS = stripProviderNoise(needle);
  if (!needleS || needleS.length < 2) return null;
  const stripped = names.filter((n) => stripProviderNoise(n) === needleS);
  if (stripped.length === 1) return stripped[0];
  return null;
}

async function main() {
  loadEnv();
  const apply = process.argv.includes('--apply');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need Supabase env');

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: providers, error: pErr } = await admin
    .from('solution_providers')
    .select('name');
  if (pErr) throw new Error(pErr.message);
  const names = (providers ?? []).map((p) => String(p.name)).filter(Boolean);

  const { data: deals, error: dErr } = await admin
    .from('deals')
    .select('id, external_id, provider, product, contract_data');
  if (dErr) throw new Error(dErr.message);

  let matched = 0;
  let skipped = 0;
  let updated = 0;

  for (const deal of deals ?? []) {
    const data = (deal.contract_data ?? {}) as Record<string, unknown>;
    const current =
      String(data.solution ?? deal.provider ?? data.vendor ?? '').trim() ||
      String(deal.provider ?? '').trim();
    if (!current) {
      skipped++;
      continue;
    }
    const hit = matchName(current, names);
    if (!hit) {
      skipped++;
      continue;
    }
    if (hit === current) {
      matched++;
      continue;
    }
    matched++;
    console.log(`${deal.external_id}: "${current}" → "${hit}"`);
    if (!apply) continue;
    const nextData = { ...data, solution: hit, vendor: hit };
    const { error } = await admin
      .from('deals')
      .update({ provider: hit, contract_data: nextData })
      .eq('id', deal.id);
    if (error) throw new Error(error.message);
    updated++;
  }

  console.log({ matched, skipped, updated, apply });
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
