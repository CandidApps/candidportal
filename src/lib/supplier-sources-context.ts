import type { SupplierSource } from '@/lib/supplier-sources-types';

const MAX_SOURCES = 80;

export function formatSupplierSourcesForPrompt(
  sources: SupplierSource[],
  opts?: { portalOnly?: boolean },
): string {
  const list = opts?.portalOnly ? sources.filter((s) => s.visibleInPortal) : sources;

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
      const link = s.url ? ` — ${s.url}` : '';
      return `- ${s.providerName} · ${s.sourceType}: ${s.title}${link}${portalTag}`;
    })
    .join('\n');
}

export function appendSupplierSourcesToPrompt(basePrompt: string, sourcesBlock: string): string {
  if (!sourcesBlock.trim()) return basePrompt;
  return `${basePrompt}\n\n## SUPPLIER REFERENCE SOURCES\nThe following are titled reference links for vendors (pricing sheets, contracts, documentation, support portals, etc.). Cite or link to them when relevant. If a source is marked [admin only], do not share it with customers.\n\n${sourcesBlock}`;
}
