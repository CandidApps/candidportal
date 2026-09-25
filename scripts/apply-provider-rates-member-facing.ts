#!/usr/bin/env npx tsx
/**
 * CR-0048 — Apply member-facing product rewrites + high-confidence supplier merges
 * to earnings_dry_run_* tables. Idempotent.
 *
 * Usage:
 *   npx tsx scripts/apply-provider-rates-member-facing.ts
 *   npx tsx scripts/apply-provider-rates-member-facing.ts --dry-run
 */
import { createClient } from '@supabase/supabase-js';
import { existsSync, readFileSync } from 'fs';
import { resolve } from 'path';
import {
  PROVIDER_RATE_MERGES,
  rewriteMemberProductName,
} from '../src/lib/provider-rates-member-copy';

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

async function main() {
  loadEnv();
  const dryRun = process.argv.includes('--dry-run');
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error('Need NEXT_PUBLIC_SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY');

  const admin = createClient(url, key, { auth: { persistSession: false } });

  const { data: products, error: prodErr } = await admin
    .from('earnings_dry_run_commission_products')
    .select('id, product_name, source_product_name, hide_from_member_view, provider_slug');
  if (prodErr) throw new Error(prodErr.message);

  let rewritten = 0;
  let hidden = 0;
  for (const row of products ?? []) {
    const source = (row.source_product_name || row.product_name || '').trim();
    const result = rewriteMemberProductName(source);
    const patch = {
      source_product_name: source,
      product_name: result.hideFromMemberView ? source : result.memberName,
      hide_from_member_view: result.hideFromMemberView,
    };
    const changed =
      patch.product_name !== row.product_name ||
      patch.hide_from_member_view !== Boolean(row.hide_from_member_view) ||
      patch.source_product_name !== (row.source_product_name || null);
    if (!changed) continue;
    if (result.hideFromMemberView) hidden++;
    else rewritten++;
    if (dryRun) {
      console.log(
        `[dry] #${row.id} hide=${result.hideFromMemberView} | ${source.slice(0, 60)} → ${patch.product_name.slice(0, 60)}`,
      );
      continue;
    }
    const { error } = await admin
      .from('earnings_dry_run_commission_products')
      .update(patch)
      .eq('id', row.id);
    if (error) throw new Error(`product ${row.id}: ${error.message}`);
  }

  console.log(`Products: rewritten=${rewritten} hidden=${hidden} dryRun=${dryRun}`);

  const { data: providers, error: provErr } = await admin
    .from('earnings_dry_run_providers')
    .select('slug, name, customer_facing, merged_into_slug, member_name, categories');
  if (provErr) throw new Error(provErr.message);
  const bySlug = new Map((providers ?? []).map((p) => [p.slug, p]));

  for (const merge of PROVIDER_RATE_MERGES) {
    const existingCanon = bySlug.get(merge.canonicalSlug);
    if (!existingCanon && !dryRun) {
      const cats = new Set<string>();
      for (const s of merge.sourceSlugs) {
        const row = bySlug.get(s);
        for (const c of row?.categories ?? []) cats.add(c);
      }
      const { error } = await admin.from('earnings_dry_run_providers').insert({
        slug: merge.canonicalSlug,
        name: merge.canonicalName,
        member_name: merge.canonicalName,
        categories: [...cats],
        customer_facing: true,
        merged_into_slug: null,
      });
      if (error && !/duplicate|unique/i.test(error.message)) {
        throw new Error(`create ${merge.canonicalSlug}: ${error.message}`);
      }
      console.log(`Created canonical provider ${merge.canonicalSlug}`);
    } else if (!existingCanon && dryRun) {
      console.log(`[dry] would create ${merge.canonicalSlug} (${merge.canonicalName})`);
    } else if (existingCanon && !dryRun) {
      await admin
        .from('earnings_dry_run_providers')
        .update({
          name: merge.canonicalName,
          member_name: merge.canonicalName,
          customer_facing: true,
          merged_into_slug: null,
        })
        .eq('slug', merge.canonicalSlug);
    }

    for (const sourceSlug of merge.sourceSlugs) {
      if (sourceSlug === merge.canonicalSlug) continue;
      if (!bySlug.has(sourceSlug)) {
        console.log(`Skip missing source ${sourceSlug}`);
        continue;
      }
      if (dryRun) {
        console.log(`[dry] merge ${sourceSlug} → ${merge.canonicalSlug}`);
        continue;
      }
      const { error: moveErr } = await admin
        .from('earnings_dry_run_commission_products')
        .update({ provider_slug: merge.canonicalSlug })
        .eq('provider_slug', sourceSlug);
      if (moveErr) throw new Error(`move ${sourceSlug}: ${moveErr.message}`);

      const { error: markErr } = await admin
        .from('earnings_dry_run_providers')
        .update({
          customer_facing: false,
          merged_into_slug: merge.canonicalSlug,
          member_name: merge.canonicalName,
        })
        .eq('slug', sourceSlug);
      if (markErr) throw new Error(`mark ${sourceSlug}: ${markErr.message}`);
      console.log(`Merged ${sourceSlug} → ${merge.canonicalSlug}`);
    }

    for (const keep of merge.keepSeparateSlugs ?? []) {
      if (!bySlug.has(keep) || dryRun) continue;
      await admin
        .from('earnings_dry_run_providers')
        .update({ customer_facing: true, merged_into_slug: null })
        .eq('slug', keep);
    }
  }

  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
