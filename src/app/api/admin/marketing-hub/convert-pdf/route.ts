import { NextResponse } from 'next/server';
import path from 'path';
import { canManageMarketingHub } from '@/lib/auth/staff';
import { convertPdfBufferToEmailHtml } from '@/lib/marketing-pdf-convert';
import {
  formatMarketingFileSize,
  type MarketingAsset,
  type MarketingAssetCategory,
} from '@/lib/marketing-hub-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'marketing-assets';

type DbMarketingAssetRow = {
  id: string;
  title: string;
  description: string | null;
  category: string;
  brand: string | null;
  filename: string;
  storage_path: string;
  mime_type: string | null;
  file_size_label: string | null;
  tags: string[] | null;
  uploaded_by: string;
  source_asset_id: string | null;
  created_at: string;
  updated_at: string;
};

function rowToAsset(row: DbMarketingAssetRow): MarketingAsset {
  return {
    id: row.id,
    title: row.title,
    description: row.description ?? undefined,
    category: row.category as MarketingAssetCategory,
    brand: (row.brand as import('@/lib/marketing-hub-types').MarketingBrand | null) ?? undefined,
    filename: row.filename,
    storagePath: row.storage_path,
    mimeType: row.mime_type ?? undefined,
    fileSizeLabel: row.file_size_label ?? '—',
    tags: row.tags ?? [],
    uploadedBy: row.uploaded_by,
    sourceAssetId: row.source_asset_id ?? undefined,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function safeStorageSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]+/g, '_').slice(0, 120);
}

export async function POST(request: Request) {
  if (!(await canManageMarketingHub())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const body = (await request.json().catch(() => ({}))) as { assetId?: string; title?: string };
  const assetId = body.assetId?.trim();
  if (!assetId) {
    return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: source, error: lookupError } = await admin
      .from('marketing_assets')
      .select('*')
      .eq('id', assetId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!source) return NextResponse.json({ error: 'Asset not found' }, { status: 404 });

    const isPdf =
      source.category === 'pdf' ||
      source.mime_type === 'application/pdf' ||
      source.filename.toLowerCase().endsWith('.pdf');
    if (!isPdf) {
      return NextResponse.json({ error: 'Only PDF assets can be converted to email templates' }, { status: 400 });
    }

    const { data: fileData, error: downloadError } = await admin.storage
      .from(BUCKET)
      .download(source.storage_path);
    if (downloadError || !fileData) {
      return NextResponse.json({ error: downloadError?.message ?? 'Download failed' }, { status: 404 });
    }

    const buffer = Buffer.from(await fileData.arrayBuffer());
    const html = await convertPdfBufferToEmailHtml(buffer, source.filename);

    const newId = crypto.randomUUID();
    const htmlFilename = `${path.basename(source.filename, path.extname(source.filename))}-email.html`;
    const storagePath = `email_template/${safeStorageSegment(newId)}/${htmlFilename}`;
    const htmlBuffer = Buffer.from(html, 'utf8');

    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, htmlBuffer, {
      contentType: 'text/html',
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const title = body.title?.trim() || `${source.title} (Email Template)`;
    const { data, error } = await admin
      .from('marketing_assets')
      .insert({
        id: newId,
        title,
        description: `Converted from PDF: ${source.title}`,
        category: 'email_template',
        filename: htmlFilename,
        storage_path: storagePath,
        mime_type: 'text/html',
        file_size_label: formatMarketingFileSize(htmlBuffer.length),
        tags: ['converted-from-pdf', ...(source.tags ?? [])],
        uploaded_by: source.uploaded_by || 'Candid Team',
        source_asset_id: source.id,
      })
      .select('*')
      .single();

    if (error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ asset: rowToAsset(data as DbMarketingAssetRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Conversion failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
