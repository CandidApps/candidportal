export type SheetRow = Record<string, string | number | boolean | null>;

export type WorkbookSheetLink = {
  row: number;
  col: number;
  targetSheet: string;
  tooltip?: string;
};

export type StructuredWorkbookSheet = {
  name: string;
  rows: (string | number | null)[][];
  links?: WorkbookSheetLink[];
  /** 0-based row indexes styled as supplier subheaders */
  subheaderRows?: number[];
  currencyCols?: number[];
  percentCols?: number[];
  columnWidths?: number[];
};

export function sanitizeSheetName(name: string, maxLen = 31): string {
  const cleaned = name.replace(/[\\/*?:\[\]]/g, '').trim() || 'Sheet';
  return cleaned.length <= maxLen ? cleaned : cleaned.slice(0, maxLen);
}

function escapeSheetLinkTarget(sheetName: string): string {
  const escaped = sheetName.replace(/'/g, "''");
  return `#'${escaped}'!A1`;
}

function escapeHyperlinkString(value: string): string {
  return value.replace(/"/g, '""');
}

function applySheetHyperlink(
  cell: import('xlsx').CellObject,
  targetSheet: string,
  tooltip?: string,
): void {
  const display =
    typeof cell.v === 'string' ? cell.v : cell.v == null ? '' : String(cell.v);
  const target = escapeSheetLinkTarget(targetSheet);
  cell.f = `HYPERLINK("${target}","${escapeHyperlinkString(display)}")`;
  cell.t = 's';
  cell.v = display;
  cell.l = {
    Target: target,
    Tooltip: tooltip ?? `Open ${targetSheet}`,
  };
}

function resolveWorkbookTabNames(sheets: StructuredWorkbookSheet[]): string[] {
  const used = new Set<string>();
  const resolved: string[] = [];

  for (const spec of sheets) {
    let tab = sanitizeSheetName(spec.name);
    let n = 2;
    while (used.has(tab)) {
      const suffix = ` (${n})`;
      tab = sanitizeSheetName(spec.name, 31 - suffix.length) + suffix;
      n += 1;
    }
    used.add(tab);
    resolved.push(tab);
  }

  return resolved;
}

function applyWorksheetFormattingSync(
  XLSX: typeof import('xlsx'),
  ws: import('xlsx').WorkSheet,
  spec: StructuredWorkbookSheet,
): void {
  const ref = ws['!ref'];
  if (!ref) return;

  const range = XLSX.utils.decode_range(ref);
  const currencyCols = new Set(spec.currencyCols ?? []);
  const percentCols = new Set(spec.percentCols ?? []);
  const subheaderRows = new Set(spec.subheaderRows ?? []);

  for (let row = range.s.r; row <= range.e.r; row += 1) {
    for (let col = range.s.c; col <= range.e.c; col += 1) {
      const address = XLSX.utils.encode_cell({ r: row, c: col });
      const cell = ws[address];
      if (!cell) continue;

      if (typeof cell.v === 'number') {
        if (currencyCols.has(col)) cell.z = '$#,##0.00';
        if (percentCols.has(col)) cell.z = '0.0%';
      }

      if (subheaderRows.has(row)) {
        cell.s = {
          font: { bold: true },
          fill: { patternType: 'solid', fgColor: { rgb: 'DCE6F1' } },
        };
      }
    }
  }

  if (spec.columnWidths?.length) {
    ws['!cols'] = spec.columnWidths.map((wch) => ({ wch }));
  }

  if (spec.rows.length > 1) {
    ws['!views'] = [{ state: 'frozen', ySplit: 1, activeCell: 'A2' }];
  }
}

/** Download a workbook built from row arrays with optional hyperlinks and light formatting. */
export async function downloadStructuredWorkbookXlsx(
  filename: string,
  sheets: StructuredWorkbookSheet[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const tabNames = resolveWorkbookTabNames(sheets);
  const tabNameBySpecName = new Map<string, string>();
  sheets.forEach((spec, index) => {
    tabNameBySpecName.set(spec.name, tabNames[index]!);
    tabNameBySpecName.set(tabNames[index]!, tabNames[index]!);
  });

  sheets.forEach((spec, index) => {
    const tab = tabNames[index]!;

    const ws = XLSX.utils.aoa_to_sheet(
      spec.rows.length ? spec.rows : [['No data for this period']],
    );

    for (const link of spec.links ?? []) {
      const address = XLSX.utils.encode_cell({ r: link.row, c: link.col });
      const cell = ws[address] ?? { t: 's', v: '' };
      const targetSheet = tabNameBySpecName.get(link.targetSheet) ?? link.targetSheet;
      applySheetHyperlink(cell, targetSheet, link.tooltip ?? `Open ${targetSheet}`);
      ws[address] = cell;
    }

    applyWorksheetFormattingSync(XLSX, ws, spec);
    XLSX.utils.book_append_sheet(wb, ws, tab);
  });

  const buffer = XLSX.write(wb, { bookType: 'xlsx', type: 'array', cellStyles: true });
  const blob = new Blob([buffer], {
    type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  triggerDownload(filename.endsWith('.xlsx') ? filename : `${filename}.xlsx`, blob);
}

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

export async function parseMultiSheetSpreadsheetFile(
  file: File,
): Promise<Record<string, SheetRow[]>> {
  const XLSX = await import('xlsx');
  const buffer = await file.arrayBuffer();
  const wb = XLSX.read(buffer, { type: 'array' });
  const out: Record<string, SheetRow[]> = {};

  for (const sheetName of wb.SheetNames) {
    const sheet = wb.Sheets[sheetName];
    if (!sheet) continue;
    const parsed = XLSX.utils.sheet_to_json(sheet, { defval: null }) as Record<string, unknown>[];
    const rows: SheetRow[] = parsed.map((row) => {
      const mapped: SheetRow = {};
      for (const [key, value] of Object.entries(row)) {
        if (value == null || value === '') {
          mapped[key] = null;
        } else if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') {
          mapped[key] = value;
        } else {
          mapped[key] = String(value);
        }
      }
      return mapped;
    });
    out[normalizeHeader(sheetName)] = rows;
  }

  return out;
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

/** Download a workbook with one sheet per tab (sheet names truncated to Excel's 31-char limit). */
export async function downloadMultiSheetXlsx(
  filename: string,
  sheets: { name: string; rows: SheetRow[] }[],
): Promise<void> {
  const XLSX = await import('xlsx');
  const wb = XLSX.utils.book_new();
  const used = new Set<string>();

  for (const { name, rows } of sheets) {
    let tab = sanitizeSheetName(name);
    let n = 2;
    while (used.has(tab)) {
      const suffix = ` (${n})`;
      tab = sanitizeSheetName(name, 31 - suffix.length) + suffix;
      n += 1;
    }
    used.add(tab);
    const sheet = XLSX.utils.json_to_sheet(rows.length ? rows : [{ Note: 'No data for this period' }]);
    XLSX.utils.book_append_sheet(wb, sheet, tab);
  }

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
