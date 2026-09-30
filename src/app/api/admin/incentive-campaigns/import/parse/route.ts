import { NextResponse } from 'next/server';
import * as XLSX from 'xlsx';
import { getMyRole } from '@/lib/auth/roles';
import {
  LAYOUT_DEFAULT_PROGRAM,
  detectLayout,
  normalizeRows,
} from '@/lib/incentive-import/layouts';
import type { SpiffParseResult, SpiffParseSheet } from '@/lib/incentive-import/types';

export const dynamic = 'force-dynamic';

const MAX_BYTES = 15 * 1024 * 1024;

function sheetRecords(sheet: XLSX.WorkSheet): { headers: string[]; records: Record<string, unknown>[] } {
  const records = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: '' });
  const headerRow = XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1, blankrows: false })[0] ?? [];
  const headers = headerRow.map((h) => String(h ?? '').trim()).filter(Boolean);
  return { headers, records };
}

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  let form: FormData;
  try {
    form = await request.formData();
  } catch {
    return NextResponse.json({ error: 'Invalid form' }, { status: 400 });
  }
  const program = String(form.get('program') ?? '').trim() || undefined;
  const pasted = String(form.get('text') ?? '').trim();
  const file = form.get('file');

  if (!(file instanceof File) || file.size === 0) {
    if (!pasted) return NextResponse.json({ error: 'Upload a spreadsheet or paste SPIFF text.' }, { status: 400 });
    const result: SpiffParseResult = {
      sheets: [],
      sheetName: null,
      layout: 'pasted',
      sourceProgram: program,
      rows: [{ rowNumber: 1, description: pasted.slice(0, 20000), sourceProgram: program }],
    };
    return NextResponse.json(result);
  }
  if (file.size > MAX_BYTES) {
    return NextResponse.json({ error: 'File is larger than 15MB.' }, { status: 400 });
  }

  let wb: XLSX.WorkBook;
  try {
    wb = XLSX.read(Buffer.from(await file.arrayBuffer()), { type: 'buffer' });
  } catch {
    return NextResponse.json({ error: 'Could not read that file. Use .xlsx, .xls or .csv.' }, { status: 400 });
  }

  const parsed = wb.SheetNames.map((name) => {
    const { headers, records } = sheetRecords(wb.Sheets[name]!);
    return { name, headers, records, layout: detectLayout(headers) };
  });
  const sheets: SpiffParseSheet[] = parsed.map((s) => ({
    name: s.name,
    layout: s.layout,
    rowCount: s.records.length,
  }));

  const requested = String(form.get('sheet') ?? '').trim();
  const chosen =
    parsed.find((s) => s.name === requested) ??
    parsed.find((s) => s.layout === 'consolidated') ??
    parsed.find((s) => s.layout && s.layout !== 'generic') ??
    parsed.find((s) => s.layout) ??
    null;

  if (!chosen?.layout) {
    const result: SpiffParseResult = { sheets, sheetName: chosen?.name ?? null, layout: null, rows: [] };
    return NextResponse.json(result);
  }

  const sourceProgram = program ?? LAYOUT_DEFAULT_PROGRAM[chosen.layout];
  const result: SpiffParseResult = {
    sheets,
    sheetName: chosen.name,
    layout: chosen.layout,
    sourceProgram,
    rows: normalizeRows(chosen.records, chosen.headers, sourceProgram),
  };
  return NextResponse.json(result);
}
