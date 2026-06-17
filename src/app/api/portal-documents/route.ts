import { NextResponse } from 'next/server';
import fs from 'fs';
import path from 'path';
import portalImportData from '@/data/portal-import/index.json';

const DOCS_DIR = path.join(process.cwd(), 'candid_portal_all_docs');
const ALLOWED = new Set(portalImportData.documentFilenames as string[]);

const MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.doc': 'application/msword',
};

export async function GET(request: Request) {
  const file = new URL(request.url).searchParams.get('file');
  if (!file || !ALLOWED.has(file)) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 });
  }

  const fullPath = path.join(DOCS_DIR, file);
  if (!fullPath.startsWith(DOCS_DIR) || !fs.existsSync(fullPath)) {
    return NextResponse.json({ error: 'File missing' }, { status: 404 });
  }

  const ext = path.extname(file).toLowerCase();
  const contentType = MIME[ext] ?? 'application/octet-stream';
  const buffer = fs.readFileSync(fullPath);

  return new NextResponse(buffer, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `inline; filename="${file.replace(/"/g, '')}"`,
      'Cache-Control': 'private, max-age=3600',
    },
  });
}
