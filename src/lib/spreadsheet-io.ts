export type SheetRow = Record<string, string | number | boolean | null>;

export function normalizeHeader(value: string): string {
  return value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_');
}

export function cell(row: SheetRow, ...aliases: string[]): string {
  const keys = Object.keys(row);
  for (const alias of aliases) {
    const target = normalizeHeader(alias);
    const match = keys.find((k) => normalizeHeader(k) === target);
    if (!match) continue;
    const value = row[match];
    if (value == null) continue;
    return String(value).trim();
  }
  return '';
}

export function cellNumber(row: SheetRow, ...aliases: string[]): number | null {
  const raw = cell(row, ...aliases);
  if (!raw) return null;
  const n = Number(raw.replace(/[^0-9.-]/g, ''));
  return Number.isFinite(n) ? n : null;
}

export async function parseSpreadsheetFile(file: File): Promise<SheetRow[]> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const sheet = wb.Sheets[wb.SheetNames[0]!];
  if (!sheet) return [];
  const parsed = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
  return parsed.map((row) => {
    const out: SheetRow = {};
    for (const [key, value] of Object.entries(row)) {
      if (value == null || value === '') {
        out[key] = null;
      } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
        out[key] = value;
      } else {
        out[key] = String(value);
      }
    }
    return out;
  });
}

export function rowsToObjects<T extends SheetRow>(rows: T[]): T[] {
  return rows.filter((row) => Object.values(row).some((v) => v != null && String(v).trim() !== ''));
}

export async function downloadCsv(filename: string, rows: SheetRow[]): Promise<void> {
  const XLSX = await import('xlsx');
  const sheet = XLSX.utils.json_to_sheet(rows);
  const csv = XLSX.utils.sheet_to_csv(sheet);
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' });
  triggerDownload(filename.endsWith('.csv') ? filename : `${filename}.csv`, blob);
}

export async function downloadXlsx(filename: string, rows: SheetRow[], sheetName = 'Sheet1'): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const sheet = XLSX.utils.json_to_sheet(rows);
  XLSX.utils.book_append_sheet(wb, sheet, sheetName);
  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array' });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, blob);
}

function triggerDownload(filename: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  anchor.click();
  URL.revokeObjectURL(url);
}

export function splitList(value: string, separators = /[;|,]/): string[] {
  return value
    .split(separators)
    .map((part) => part.trim())
    .filter(Boolean);
}
