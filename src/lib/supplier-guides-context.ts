import type { SupplierGuide } from '@/lib/supplier-guides-types';
import { richHtmlToPlainText } from '@/lib/rich-text';

const MAX_GUIDE_CHARS = 6000;
const MAX_GUIDES = 40;

function trimContent(text: string): string {
  const t = text.trim();
  if (t.length <= MAX_GUIDE_CHARS) return t;
  return `${t.slice(0, MAX_GUIDE_CHARS)}…`;
}

export function formatSupplierGuidesForPrompt(
  guides: SupplierGuide[],
  opts?: { portalOnly?: boolean },
): string {
  const list = opts?.portalOnly
    ? guides.filter((g) => g.visibleInPortal)
    : guides;

  if (!list.length) {
    return opts?.portalOnly
      ? 'No supplier guides are published for this customer portal yet.'
      : 'No supplier guides have been added yet.';
  }

  const sorted = [...list].sort((a, b) => {
    const prov = a.providerName.localeCompare(b.providerName);
    if (prov !== 0) return prov;
    return a.sortOrder - b.sortOrder || a.title.localeCompare(b.title);
  });

  const chunks = sorted.slice(0, MAX_GUIDES).map((g) => {
    const portalTag = g.visibleInPortal ? ' [customer-visible]' : ' [admin only]';
    return `### ${g.providerName} — ${g.title} (${g.category})${portalTag}\n${trimContent(richHtmlToPlainText(g.content))}`;
  });

  return chunks.join('\n\n');
}

export function appendSupplierGuidesToPrompt(basePrompt: string, guidesBlock: string): string {
  if (!guidesBlock.trim()) return basePrompt;
  return `${basePrompt}\n\n## SUPPLIER GUIDES & DOCUMENTATION\nUse the following internal supplier guidance when answering questions about vendors, ordering, provisioning, or support processes. If a guide is marked [admin only], do not quote it to customers.\n\n${guidesBlock}`;
}
