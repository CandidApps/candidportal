import { NextResponse } from 'next/server';
import path from 'path';
import { canAccessMarketingHub, canManageMarketingHub } from '@/lib/auth/staff';
import {
  formatMarketingFileSize,
  guessMarketingBrand,
  guessMarketingCategory,
  marketingAssetTitleFromFilename,
  MARKETING_ASSET_CATEGORIES,
  MARKETING_BRANDS,
  categorySupportsBrand,
  type MarketingAsset,
  type MarketingAssetCategory,
  type MarketingBrand,
} from '@/lib/marketing-hub-types';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';

const BUCKET = 'marketing-assets';

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.html': 'text/html',
  '.htm': 'text/html',
  '.txt': 'text/plain',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.doc': 'application/msword',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
};

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
    brand: (row.brand as MarketingBrand | null) ?? undefined,
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

export async function GET(request: Request) {
  if (!(await canAccessMarketingHub())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(request.url);
  const assetId = searchParams.get('assetId')?.trim();
  const category = searchParams.get('category')?.trim() as MarketingAssetCategory | undefined;
  const brand = searchParams.get('brand')?.trim() as MarketingBrand | undefined;
  const download = searchParams.get('download') === '1';

  if (assetId) {
    return serveAsset(assetId, download);
  }

  try {
    const admin = createSupabaseAdminClient();
    let query = admin.from('marketing_assets').select('*').order('created_at', { ascending: false });
    if (category && MARKETING_ASSET_CATEGORIES.includes(category)) {
      query = query.eq('category', category);
    }
    if (brand && MARKETING_BRANDS.includes(brand)) {
      query = query.eq('brand', brand);
    }
    const { data, error } = await query;

    if (error) {
      if (error.message.includes('marketing_assets')) {
        return NextResponse.json({ assets: [] });
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      assets: (data as DbMarketingAssetRow[]).map(rowToAsset),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'List failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

async function serveAsset(assetId: string, download: boolean) {
  const admin = createSupabaseAdminClient();
  const { data: row, error } = await admin
    .from('marketing_assets')
    .select('filename, storage_path, mime_type')
    .eq('id', assetId)
    .maybeSingle();

  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  if (!row?.storage_path) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  const { data, error: downloadError } = await admin.storage.from(BUCKET).download(row.storage_path);
  if (downloadError || !data) {
    return NextResponse.json({ error: downloadError?.message ?? 'Download failed' }, { status: 404 });
  }

  const buffer = Buffer.from(await data.arrayBuffer());
  const ext = path.extname(row.filename).toLowerCase();
  const contentType = row.mime_type ?? MIME[ext] ?? 'application/octet-stream';
  const disposition = download ? 'attachment' : 'inline';

  return new NextResponse(new Uint8Array(buffer), {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `${disposition}; filename="${row.filename.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}

export async function POST(request: Request) {
  if (!(await canManageMarketingHub())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const form = await request.formData();
    const file = form.get('file');
    const titleInput = String(form.get('title') ?? '').trim();
    const description = String(form.get('description') ?? '').trim() || null;
    const categoryInput = String(form.get('category') ?? '').trim() as MarketingAssetCategory;
    const brandInput = String(form.get('brand') ?? '').trim() as MarketingBrand;
    const tagsRaw = String(form.get('tags') ?? '').trim();
    const uploadedBy = String(form.get('uploadedBy') ?? 'Candid Team').trim() || 'Candid Team';

    if (!(file instanceof File) || !file.size) {
      return NextResponse.json({ error: 'file required' }, { status: 400 });
    }

    const category =
      categoryInput && MARKETING_ASSET_CATEGORIES.includes(categoryInput)
        ? categoryInput
        : guessMarketingCategory(file.name, file.type);
    const brand =
      brandInput && MARKETING_BRANDS.includes(brandInput)
        ? brandInput
        : categorySupportsBrand(category)
          ? guessMarketingBrand(file.name)
          : undefined;
    const title = titleInput || marketingAssetTitleFromFilename(file.name);
    const tags = tagsRaw
      ? tagsRaw.split(',').map((t) => t.trim()).filter(Boolean)
      : [];

    const admin = createSupabaseAdminClient();
    const assetId = crypto.randomUUID();
    const safeName = path.basename(file.name).replace(/[^a-zA-Z0-9._-]+/g, '_');
    const storagePath = `${category}/${safeStorageSegment(assetId)}/${safeName}`;
    const mimeType = file.type || MIME[path.extname(safeName).toLowerCase()] || 'application/octet-stream';

    const fileBuffer = Buffer.from(await file.arrayBuffer());
    const { error: uploadError } = await admin.storage.from(BUCKET).upload(storagePath, fileBuffer, {
      contentType: mimeType,
      upsert: false,
    });
    if (uploadError) {
      return NextResponse.json({ error: uploadError.message }, { status: 500 });
    }

    const fileSizeLabel = formatMarketingFileSize(file.size);
    const { data, error } = await admin
      .from('marketing_assets')
      .insert({
        id: assetId,
        title,
        description,
        category,
        brand: categorySupportsBrand(category) ? brand ?? null : null,
        filename: file.name,
        storage_path: storagePath,
        mime_type: mimeType,
        file_size_label: fileSizeLabel,
        tags,
        uploaded_by: uploadedBy,
      })
      .select('*')
      .single();

    if (error) {
      await admin.storage.from(BUCKET).remove([storagePath]);
      if (error.message.includes('marketing_assets')) {
        return NextResponse.json(
          {
            error:
              'Marketing assets table is not set up yet. Run migration 0073_content_marketing_hub.sql in Supabase.',
          },
          { status: 503 },
        );
      }
      return NextResponse.json({ error: error.message }, { status: 500 });
    }

    return NextResponse.json({ asset: rowToAsset(data as DbMarketingAssetRow) });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Upload failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if (!(await canManageMarketingHub())) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const assetId = new URL(request.url).searchParams.get('assetId')?.trim();
  if (!assetId) {
    return NextResponse.json({ error: 'assetId required' }, { status: 400 });
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: row, error: lookupError } = await admin
      .from('marketing_assets')
      .select('storage_path')
      .eq('id', assetId)
      .maybeSingle();

    if (lookupError) return NextResponse.json({ error: lookupError.message }, { status: 500 });
    if (!row) return NextResponse.json({ ok: true });

    const { error: deleteError } = await admin.from('marketing_assets').delete().eq('id', assetId);
    if (deleteError) return NextResponse.json({ error: deleteError.message }, { status: 500 });

    if (row.storage_path) {
      await admin.storage.from(BUCKET).remove([row.storage_path]);
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
