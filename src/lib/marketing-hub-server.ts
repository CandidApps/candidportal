import 'server-only';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'marketing-assets';

export type MarketingAssetFile = {
  id: string;
  filename: string;
  mimeType: string;
  buffer: Buffer;
};

export async function fetchMarketingAssetFiles(assetIds: string[]): Promise<MarketingAssetFile[]> {
  if (!assetIds.length) return [];
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin.from('marketing_assets').select('id, filename, mime_type, storage_path').in('id', assetIds);
  if (error) throw new Error(error.message);
  if (!data?.length) return [];

  const files: MarketingAssetFile[] = [];
  for (const row of data) {
    if (!row.storage_path) continue;
    const { data: blob, error: downloadError } = await admin.storage.from(BUCKET).download(row.storage_path);
    if (downloadError || !blob) continue;
    files.push({
      id: row.id,
      filename: row.filename,
      mimeType: row.mime_type ?? 'application/octet-stream',
      buffer: Buffer.from(await blob.arrayBuffer()),
    });
  }
  return files;
}

export async function fetchMarketingAssetHtml(assetId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data: row } = await admin
    .from('marketing_assets')
    .select('storage_path, mime_type, category, filename')
    .eq('id', assetId)
    .maybeSingle();
  if (!row?.storage_path) return null;
  const isHtml =
    row.category === 'email_template' ||
    row.mime_type === 'text/html' ||
    row.filename.toLowerCase().endsWith('.html');
  if (!isHtml) return null;
  const { data: blob } = await admin.storage.from(BUCKET).download(row.storage_path);
  if (!blob) return null;
  return await blob.text();
}
