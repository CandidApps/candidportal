export const MARKETING_ASSET_CATEGORIES = [
  'logo',
  'branding',
  'pdf',
  'email_template',
  'marketing_content',
] as const;

export type MarketingAssetCategory = (typeof MARKETING_ASSET_CATEGORIES)[number];

/** Brand family for Logos (and optional Branding assets). */
export const MARKETING_BRANDS = ['candid', 'candid_pay', 'candid_iq'] as const;

export type MarketingBrand = (typeof MARKETING_BRANDS)[number];

export type MarketingAsset = {
  id: string;
  title: string;
  description?: string;
  category: MarketingAssetCategory;
  brand?: MarketingBrand;
  filename: string;
  storagePath: string;
  mimeType?: string;
  fileSizeLabel: string;
  tags: string[];
  uploadedBy: string;
  sourceAssetId?: string;
  createdAt: string;
  updatedAt: string;
};

export const MARKETING_CATEGORY_LABELS: Record<MarketingAssetCategory, string> = {
  logo: 'Logos',
  branding: 'Branding',
  pdf: 'PDFs',
  email_template: 'Email Templates',
  marketing_content: 'Marketing Content',
};

export const MARKETING_BRAND_LABELS: Record<MarketingBrand, string> = {
  candid: 'Candid',
  candid_pay: 'CandidPay',
  candid_iq: 'CandidIQ',
};

export const MARKETING_CATEGORY_FILTER_OPTIONS: Array<{
  id: MarketingAssetCategory | 'all';
  label: string;
}> = [
  { id: 'all', label: 'All assets' },
  { id: 'logo', label: MARKETING_CATEGORY_LABELS.logo },
  { id: 'branding', label: MARKETING_CATEGORY_LABELS.branding },
  { id: 'pdf', label: MARKETING_CATEGORY_LABELS.pdf },
  { id: 'email_template', label: MARKETING_CATEGORY_LABELS.email_template },
  { id: 'marketing_content', label: MARKETING_CATEGORY_LABELS.marketing_content },
];

export function categorySupportsBrand(category: MarketingAssetCategory): boolean {
  return category === 'logo' || category === 'branding';
}

export function guessMarketingBrand(filename: string): MarketingBrand | undefined {
  const lower = filename.toLowerCase();
  if (/candid[\s_-]?iq|candidiq/.test(lower)) return 'candid_iq';
  if (/candid[\s_-]?pay|candidpay/.test(lower)) return 'candid_pay';
  if (/candid/.test(lower)) return 'candid';
  return undefined;
}

export function formatMarketingFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function guessMarketingCategory(filename: string, mimeType?: string): MarketingAssetCategory {
  const lower = filename.toLowerCase();
  const ext = lower.includes('.') ? lower.slice(lower.lastIndexOf('.')) : '';
  const mime = (mimeType ?? '').toLowerCase();

  if (ext === '.html' || ext === '.htm' || mime.includes('text/html')) {
    return 'email_template';
  }
  if (ext === '.pdf' || mime === 'application/pdf') {
    return 'pdf';
  }
  if (/\.(png|jpe?g|webp|gif|svg)$/i.test(lower) || mime.startsWith('image/')) {
    if (/logo/i.test(lower)) return 'logo';
    return 'branding';
  }
  return 'marketing_content';
}

export function marketingAssetTitleFromFilename(filename: string): string {
  const base = filename.replace(/\.[^.]+$/, '').replace(/[-_]+/g, ' ').trim();
  if (!base) return filename;
  return base.replace(/\b\w/g, (c) => c.toUpperCase());
}

export function isMarketingImageAsset(asset: Pick<MarketingAsset, 'mimeType' | 'filename'>): boolean {
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime.startsWith('image/')) return true;
  return /\.(png|jpe?g|webp|gif|svg)$/i.test(asset.filename);
}

export type MarketingAssetSelectedDetail = {
  asset: MarketingAsset;
  /** When true, listeners like MarketingAssetComposeBridge open Zoho compose. */
  openCompose?: boolean;
};

export function isMarketingPdfAsset(asset: Pick<MarketingAsset, 'mimeType' | 'filename'>): boolean {
  const mime = (asset.mimeType ?? '').toLowerCase();
  return mime === 'application/pdf' || asset.filename.toLowerCase().endsWith('.pdf');
}

export function isMarketingHtmlAsset(asset: Pick<MarketingAsset, 'mimeType' | 'filename' | 'category'>): boolean {
  const mime = (asset.mimeType ?? '').toLowerCase();
  if (mime.includes('html')) return true;
  if (/\.html?$/i.test(asset.filename)) return true;
  return asset.category === 'email_template';
}

export type MarketingPreviewKind = 'image' | 'pdf' | 'html' | 'document';

export function marketingPreviewKindFromFile(file: File): MarketingPreviewKind {
  const mime = file.type.toLowerCase();
  const name = file.name.toLowerCase();
  if (mime.startsWith('image/') || /\.(png|jpe?g|webp|gif|svg)$/i.test(name)) return 'image';
  if (mime === 'application/pdf' || name.endsWith('.pdf')) return 'pdf';
  if (mime.includes('html') || /\.html?$/i.test(name)) return 'html';
  return 'document';
}

export function marketingPreviewKindFromAsset(
  asset: Pick<MarketingAsset, 'mimeType' | 'filename' | 'category'>,
): MarketingPreviewKind {
  if (isMarketingImageAsset(asset)) return 'image';
  if (isMarketingPdfAsset(asset)) return 'pdf';
  if (isMarketingHtmlAsset(asset)) return 'html';
  return 'document';
}
