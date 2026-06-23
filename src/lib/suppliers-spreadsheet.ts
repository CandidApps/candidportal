import { paySourceKey } from '@/lib/commission-partners';
import { slugifyProviderName } from '@/lib/solution-providers-db';
import type {
  SolutionProviderRecord,
  SupplierContact,
  SupplierSolution,
} from '@/lib/solution-providers-types';
import {
  cell,
  cellNumber,
  downloadCsv,
  downloadXlsx,
  parseSpreadsheetFile,
  rowsToObjects,
  type SheetRow,
} from '@/lib/spreadsheet-io';

function providerKey(name: string, slug?: string): string {
  const s = slug?.trim() || slugifyProviderName(name);
  return paySourceKey(s || name);
}

export function solutionProvidersToExportSheet(providers: SolutionProviderRecord[]): SheetRow[] {
  const rows: SheetRow[] = [];

  for (const provider of providers) {
    const primaryContact =
      provider.contacts.find((c) => c.isPrimary) ?? provider.contacts[0] ?? null;

    if (!provider.solutions.length) {
      rows.push(providerRow(provider, primaryContact, null, null));
      continue;
    }

    for (const solution of provider.solutions) {
      const rateEntries = Object.entries(solution.partnerRates);
      if (!rateEntries.length) {
        rows.push(providerRow(provider, primaryContact, solution, null));
        continue;
      }
      for (const [paySource, rate] of rateEntries) {
        rows.push(providerRow(provider, primaryContact, solution, { paySource, rate }));
      }
    }
  }

  return rows;
}

function providerRow(
  provider: SolutionProviderRecord,
  contact: SupplierContact | null,
  solution: SupplierSolution | null,
  rate: { paySource: string; rate: number } | null,
): SheetRow {
  return {
    'Provider Name': provider.name,
    'Display Name': provider.displayName ?? null,
    'Provider ID': provider.id,
    'DB ID': provider.dbId ?? null,
    Website: provider.website ?? null,
    'Provider Notes': provider.notes ?? null,
    'Contact Name': contact?.name ?? null,
    'Contact Role': contact?.role ?? null,
    'Contact Email': contact?.email ?? null,
    'Contact Phone': contact?.phone ?? null,
    'Solution Name': solution?.name ?? null,
    'Solution Description': solution?.description ?? null,
    'Commission Partner': rate?.paySource ?? null,
    'Rate %': rate?.rate ?? null,
  };
}

type ProviderDraft = {
  record: SolutionProviderRecord;
  solutions: Map<string, SupplierSolution>;
};

function getOrCreateDraft(
  drafts: Map<string, ProviderDraft>,
  row: SheetRow,
  existing: SolutionProviderRecord[],
): ProviderDraft {
  const name = cell(row, 'Provider Name', 'provider_name', 'name');
  const slug = cell(row, 'Provider ID', 'provider_id', 'slug');
  const dbId = cellNumber(row, 'DB ID', 'db_id', 'db id');

  const key = providerKey(name || slug, slug);
  const found = drafts.get(key);
  if (found) return found;

  const match =
    (dbId ? existing.find((p) => p.dbId === dbId) : null) ??
    existing.find((p) => p.id === slug) ??
    existing.find((p) => paySourceKey(p.name) === paySourceKey(name)) ??
    null;

  const record: SolutionProviderRecord = match
    ? { ...match }
    : {
        id: slug || slugifyProviderName(name) || `provider-${Date.now()}`,
        name: name || slug,
        displayName: cell(row, 'Display Name', 'display_name') || undefined,
        website: cell(row, 'Website', 'website') || undefined,
        notes: cell(row, 'Provider Notes', 'provider_notes', 'notes') || undefined,
        contacts: [],
        solutions: [],
        fromBmwOnly: true,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

  if (cell(row, 'Display Name', 'display_name')) {
    record.displayName = cell(row, 'Display Name', 'display_name');
  }
  if (cell(row, 'Website', 'website')) record.website = cell(row, 'Website', 'website');
  if (cell(row, 'Provider Notes', 'provider_notes', 'notes')) {
    record.notes = cell(row, 'Provider Notes', 'provider_notes', 'notes');
  }

  const contactName = cell(row, 'Contact Name', 'contact_name');
  if (contactName && !record.contacts.some((c) => c.name === contactName)) {
    record.contacts.push({
      id: `import-contact-${record.contacts.length + 1}`,
      name: contactName,
      role: cell(row, 'Contact Role', 'contact_role') || '',
      email: cell(row, 'Contact Email', 'contact_email') || '',
      phone: cell(row, 'Contact Phone', 'contact_phone') || '',
      isPrimary: record.contacts.length === 0,
    });
  }

  const draft: ProviderDraft = { record, solutions: new Map() };
  drafts.set(key, draft);
  return draft;
}

export function parseSolutionProvidersFromSheet(
  rows: SheetRow[],
  existing: SolutionProviderRecord[],
): SolutionProviderRecord[] {
  const drafts = new Map<string, ProviderDraft>();

  for (const row of rows) {
    const providerName = cell(row, 'Provider Name', 'provider_name', 'name');
    const providerId = cell(row, 'Provider ID', 'provider_id', 'slug');
    if (!providerName && !providerId) continue;

    const draft = getOrCreateDraft(drafts, row, existing);
    const solutionName = cell(row, 'Solution Name', 'solution_name');
    if (!solutionName) continue;

    const solKey = solutionName.toLowerCase();
    let solution = draft.solutions.get(solKey);
    if (!solution) {
      solution = {
        id: `import-sol-${draft.solutions.size + 1}`,
        name: solutionName,
        description: cell(row, 'Solution Description', 'solution_description') || undefined,
        partnerRates: {},
      };
      draft.solutions.set(solKey, solution);
    }

    const paySource = cell(row, 'Commission Partner', 'commission_partner', 'pay_source');
    const rate = cellNumber(row, 'Rate %', 'rate', 'rate_pct');
    if (paySource && rate != null) {
      solution.partnerRates[paySourceKey(paySource)] = rate;
    }
  }

  return [...drafts.values()].map(({ record, solutions }) => ({
    ...record,
    solutions: [...solutions.values()],
    fromBmwOnly: false,
  }));
}

export async function importSolutionProvidersFromFile(
  file: File,
  existing: SolutionProviderRecord[],
): Promise<{ imported: number; records: SolutionProviderRecord[] }> {
  const parsed = rowsToObjects(await parseSpreadsheetFile(file));
  const records = parseSolutionProvidersFromSheet(parsed, existing);
  if (!records.length) {
    return { imported: 0, records: existing };
  }

  const res = await fetch('/api/admin/solution-providers', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ records, includeBmwStubs: true }),
  });
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? 'Failed to import suppliers');
  }

  const body = (await res.json()) as { imported?: number; records?: SolutionProviderRecord[] };
  return {
    imported: body.imported ?? records.length,
    records: body.records ?? records,
  };
}

export async function exportSolutionProvidersCsv(
  providers: SolutionProviderRecord[],
  filename = 'suppliers-vendors',
): Promise<void> {
  await downloadCsv(filename, solutionProvidersToExportSheet(providers));
}

export async function exportSolutionProvidersXlsx(
  providers: SolutionProviderRecord[],
  filename = 'suppliers-vendors',
): Promise<void> {
  await downloadXlsx(filename, solutionProvidersToExportSheet(providers), 'Suppliers');
}
