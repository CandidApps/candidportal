import type { MarketingAsset, MarketingAssetSelectedDetail } from '@/lib/marketing-hub-types';
import { MARKETING_CATEGORY_LABELS } from '@/lib/marketing-hub-types';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';

export const MARKETING_ASSET_SELECTED_EVENT = 'candid-marketing-asset-selected';
export const MARKETING_ASSET_PICKER_EVENT = 'candid-marketing-asset-picker-open';

export type { MarketingAssetSelectedDetail } from '@/lib/marketing-hub-types';

export type MarketingAssetPickerLaunch = {
  onSelect: (asset: MarketingAsset) => void;
};

async function parseError(res: Response): Promise<string> {
  try {
    const data = (await res.json()) as { error?: string };
    return data.error ?? res.statusText;
  } catch {
    return res.statusText;
  }
}

export function marketingAssetViewUrl(assetId: string): string {
  return `/api/admin/marketing-hub?assetId=${encodeURIComponent(assetId)}`;
}

export function marketingAssetDownloadUrl(assetId: string): string {
  return `/api/admin/marketing-hub?assetId=${encodeURIComponent(assetId)}&download=1`;
}

export async function listMarketingAssets(options?: {
  category?: import('@/lib/marketing-hub-types').MarketingAssetCategory;
  brand?: import('@/lib/marketing-hub-types').MarketingBrand;
}): Promise<MarketingAsset[]> {
  const params = new URLSearchParams();
  if (options?.category) params.set('category', options.category);
  if (options?.brand) params.set('brand', options.brand);
  const qs = params.toString();
  const res = await fetch(`/api/admin/marketing-hub${qs ? `?${qs}` : ''}`);
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { assets?: MarketingAsset[] };
  return data.assets ?? [];
}

export async function uploadMarketingAsset(params: {
  file: File;
  title?: string;
  description?: string;
  category?: import('@/lib/marketing-hub-types').MarketingAssetCategory;
  brand?: import('@/lib/marketing-hub-types').MarketingBrand;
  tags?: string[];
  uploadedBy?: string;
}): Promise<MarketingAsset> {
  const form = new FormData();
  form.set('file', params.file);
  if (params.title) form.set('title', params.title);
  if (params.description) form.set('description', params.description);
  if (params.category) form.set('category', params.category);
  if (params.brand) form.set('brand', params.brand);
  if (params.tags?.length) form.set('tags', params.tags.join(','));
  if (params.uploadedBy) form.set('uploadedBy', params.uploadedBy);

  const res = await fetch('/api/admin/marketing-hub', { method: 'POST', body: form });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { asset?: MarketingAsset };
  if (!data.asset) throw new Error('Upload failed');
  return data.asset;
}

function emailTemplateFilename(title: string): string {
  const base = title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return `${base || 'email-template'}.html`;
}

/** Create a new email template from HTML body (no separate file upload required). */
export async function createEmailTemplate(params: {
  html: string;
  title: string;
  description?: string;
  tags?: string[];
}): Promise<MarketingAsset> {
  const filename = emailTemplateFilename(params.title);
  const file = new File([params.html], filename, { type: 'text/html' });
  return uploadMarketingAsset({
    file,
    title: params.title,
    description: params.description,
    category: 'email_template',
    tags: params.tags,
  });
}

/** Replace HTML for an existing email template asset. */
export async function updateEmailTemplate(params: {
  assetId: string;
  html: string;
  title?: string;
  description?: string;
  tags?: string[];
}): Promise<MarketingAsset> {
  const res = await fetch('/api/admin/marketing-hub', {
    method: 'PATCH',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(params),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { asset?: MarketingAsset };
  if (!data.asset) throw new Error('Update failed');
  return data.asset;
}

export async function deleteMarketingAsset(assetId: string): Promise<void> {
  const params = new URLSearchParams({ assetId });
  const res = await fetch(`/api/admin/marketing-hub?${params.toString()}`, { method: 'DELETE' });
  if (!res.ok) throw new Error(await parseError(res));
}

export async function convertPdfToEmailTemplate(assetId: string, title?: string): Promise<MarketingAsset> {
  const res = await fetch('/api/admin/marketing-hub/convert-pdf', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ assetId, title }),
  });
  if (!res.ok) throw new Error(await parseError(res));
  const data = (await res.json()) as { asset?: MarketingAsset };
  if (!data.asset) throw new Error('Conversion failed');
  return data.asset;
}

export async function loadMarketingAssetText(asset: MarketingAsset): Promise<string | null> {
  if (asset.category !== 'email_template' && !asset.filename.toLowerCase().endsWith('.html')) {
    return null;
  }
  const res = await fetch(marketingAssetViewUrl(asset.id));
  if (!res.ok) return null;
  return res.text();
}

export function marketingAssetShareLine(asset: MarketingAsset): string {
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  return `${asset.title} (${MARKETING_CATEGORY_LABELS[asset.category]}): ${origin}${marketingAssetDownloadUrl(asset.id)}`;
}

/** Dispatch when another part of the app should consume a marketing asset. */
export function selectMarketingAssetForUse(
  asset: MarketingAsset,
  options?: { openCompose?: boolean },
): void {
  window.dispatchEvent(
    new CustomEvent<MarketingAssetSelectedDetail>(MARKETING_ASSET_SELECTED_EVENT, {
      detail: { asset, openCompose: options?.openCompose },
    }),
  );
}

export function openMarketingAssetPicker(onSelect: (asset: MarketingAsset) => void): void {
  window.dispatchEvent(
    new CustomEvent<MarketingAssetPickerLaunch>(MARKETING_ASSET_PICKER_EVENT, {
      detail: { onSelect },
    }),
  );
}

/** Open in-app Zoho compose prefilled from a marketing asset. */
export async function launchMarketingAssetEmail(asset: MarketingAsset, to = ''): Promise<void> {
  const subject = `Candid marketing asset: ${asset.title}`;
  if (asset.category === 'email_template') {
    const html = await loadMarketingAssetText(asset);
    launchAdminZohoCompose({
      to,
      subject,
      html: html ?? undefined,
      body: html ? undefined : `Sharing "${asset.title}".`,
      contextLabel: 'Marketing Hub',
      marketingAssetIds: [asset.id],
    });
    return;
  }

  launchAdminZohoCompose({
    to,
    subject,
    body: `Hi,\n\nSharing our "${asset.title}" asset (${MARKETING_CATEGORY_LABELS[asset.category]}).\n\n— Candid Team`,
    contextLabel: 'Marketing Hub',
    marketingAssetIds: [asset.id],
  });
}

/** Map a selected asset into compose launch fields (for bridges/pickers). */
export async function composeLaunchFromMarketingAsset(
  asset: MarketingAsset,
  to = '',
): Promise<import('@/lib/email/admin-compose').AdminComposeLaunch> {
  const subject = `Candid marketing asset: ${asset.title}`;
  if (asset.category === 'email_template') {
    const html = await loadMarketingAssetText(asset);
    return {
      to,
      subject,
      html: html ?? undefined,
      body: html ? undefined : `Sharing "${asset.title}".`,
      contextLabel: 'Marketing Hub',
      marketingAssetIds: [asset.id],
    };
  }
  return {
    to,
    subject,
    body: `Hi,\n\nSharing our "${asset.title}" asset (${MARKETING_CATEGORY_LABELS[asset.category]}).\n\n— Candid Team`,
    contextLabel: 'Marketing Hub',
    marketingAssetIds: [asset.id],
  };
}
