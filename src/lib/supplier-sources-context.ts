import type { SupplierSource } from '@/lib/supplier-sources-types';

const MAX_SOURCES = 80;

export function formatSupplierSourcesForPrompt(
  sources: SupplierSource[],
  opts?: { portalOnly?: boolean },
): string {
  const list = (opts?.portalOnly ? sources.filter((s) => s.visibleInPortal) : sources).filter(
    (s) => s.frankUse !== 'ignore',
  );

  if (!list.length) {
    return opts?.portalOnly
      ? 'No supplier reference sources are published for this customer portal yet.'
      : 'No supplier reference sources have been added yet.';
  }

  const sorted = [...list].sort((a, b) => {
    const prov = a.providerName.localeCompare(b.providerName);
    if (prov !== 0) return prov;
    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  });

  return sorted
    .slice(0, MAX_SOURCES)
    .map((s) => {
      const portalTag = s.visibleInPortal ? ' [customer-visible]' : ' [admin only]';
      const frankTag =
        s.frankUse === 'fetch'
          ? ' [frank:fetch — use fetch_supplier_source]'
          : ' [frank:cite — link only, do not fetch]';
      const link = s.url ? ` — ${s.url}` : '';
      return `- id=${s.id} · ${s.providerName} · ${s.sourceType}: ${s.title}${link}${portalTag}${frankTag}`;
    })
    .join('\n');
}

export function appendSupplierSourcesToPrompt(basePrompt: string, sourcesBlock: string): string {
  if (!sourcesBlock.trim()) return basePrompt;
  return `${basePrompt}

## SUPPLIER REFERENCE SOURCES (secondary)
Priority: prefer **SUPPLIER GUIDES & DOCUMENTATION** above when they answer the question. Use these reference links second — for cites, URLs, or when you need live page content.

Rules:
1. Only use URLs listed here (or fetchable via fetch_supplier_source). Do **not** open or invent other websites.
2. If a source is marked [frank:fetch], call fetch_supplier_source with its id (or url) before answering from that page.
3. If marked [frank:cite], mention/link the URL only — do not fetch.
4. If a source is [admin only], do not share it with customers.
5. If the user asks about a site that is not in this list, refuse politely and point them to Partners → supplier Sources & references.

${sourcesBlock}`;
}
