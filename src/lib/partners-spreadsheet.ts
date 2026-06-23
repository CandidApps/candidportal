import {
  buildCommissionPartnerRows,
  commissionSourceKey,
  dealsForPaySource,
} from '@/lib/commission-partners';
import type { PartnerSupplierRecord } from '@/lib/bank-deposits/source-match';
import {
  createPartnerSupplier,
  updatePartnerSupplier,
} from '@/lib/services/bank-deposits';
import {
  cell,
  cellNumber,
  downloadCsv,
  downloadXlsx,
  parseSpreadsheetFile,
  rowsToObjects,
  splitList,
  type SheetRow,
} from '@/lib/spreadsheet-io';

export function commissionPartnersToExportSheet(partners: PartnerSupplierRecord[]): SheetRow[] {
  return buildCommissionPartnerRows(partners).map((row) => ({
    'Pay Source': row.paySource,
    'Display Name': row.partner?.display_name ?? row.paySource,
    'Partner DB ID': row.partner?.id ?? null,
    'Supplier Key': row.partner?.supplier_key ?? null,
    'Bank ORIG Co Name': row.bankOrigCoName,
    'Bank ORIG ID': row.bankOrigId,
    'Bank Source Aliases': (row.partner?.bank_source_aliases ?? [row.paySource]).join('; '),
    'Commission Rate %': row.commissionRate,
    'Contact Name': row.contactName,
    'Contact Email': row.contactEmail,
    'Contact Phone': row.contactPhone,
    Website: row.partner?.website ?? null,
    Notes: row.partner?.notes ?? null,
    'Customer Deals': dealsForPaySource(row.paySource).length,
  }));
}

function findPartnerForImportRow(
  partners: PartnerSupplierRecord[],
  paySource: string,
  dbId: number | null,
): PartnerSupplierRecord | null {
  if (dbId) {
    const byId = partners.find((p) => p.id === dbId);
    if (byId) return byId;
  }
  const key = commissionSourceKey(paySource);
  return (
    partners.find((p) => commissionSourceKey(p.display_name ?? p.name) === key) ??
    partners.find((p) => p.bank_source_aliases.some((a) => commissionSourceKey(a) === key)) ??
    partners.find((p) => commissionSourceKey(p.name) === key) ??
    null
  );
}

export async function importCommissionPartnersFromFile(
  file: File,
  partners: PartnerSupplierRecord[],
): Promise<{ imported: number; updated: number; created: number }> {
  const parsed = rowsToObjects(await parseSpreadsheetFile(file));
  let imported = 0;
  let updated = 0;
  let created = 0;

  for (const row of parsed) {
    const paySource = cell(row, 'Pay Source', 'pay_source', 'pay source');
    if (!paySource) continue;

    const dbId = cellNumber(row, 'Partner DB ID', 'partner_db_id', 'id');
    const existing = findPartnerForImportRow(partners, paySource, dbId);
    const displayName = cell(row, 'Display Name', 'display_name') || paySource;
    const aliasesRaw = cell(row, 'Bank Source Aliases', 'bank_source_aliases');
    const bankSourceAliases = aliasesRaw
      ? splitList(aliasesRaw)
      : [paySource, displayName].filter(Boolean);
    if (!bankSourceAliases.some((a) => commissionSourceKey(a) === commissionSourceKey(paySource))) {
      bankSourceAliases.unshift(paySource);
    }

    const payload = {
      displayName,
      supplierKey: cell(row, 'Supplier Key', 'supplier_key') || null,
      bankOrigCoName: cell(row, 'Bank ORIG Co Name', 'bank_orig_co_name') || null,
      bankOrigId: cell(row, 'Bank ORIG ID', 'bank_orig_id') || null,
      bankSourceAliases,
      commissionRate: cellNumber(row, 'Commission Rate %', 'commission_rate', 'commission rate'),
      contactName: cell(row, 'Contact Name', 'contact_name') || null,
      contactEmail: cell(row, 'Contact Email', 'contact_email') || null,
      contactPhone: cell(row, 'Contact Phone', 'contact_phone') || null,
      website: cell(row, 'Website', 'website') || null,
      notes: cell(row, 'Notes', 'notes') || null,
    };

    if (existing) {
      const saved = await updatePartnerSupplier({ id: existing.id, ...payload });
      const idx = partners.findIndex((p) => p.id === saved.id);
      if (idx >= 0) partners[idx] = saved;
      else partners.push(saved);
      updated += 1;
    } else {
      const saved = await createPartnerSupplier({
        name: paySource,
        ...payload,
      });
      partners.push(saved);
      created += 1;
    }
    imported += 1;
  }

  return { imported, updated, created };
}

export async function exportCommissionPartnersCsv(
  partners: PartnerSupplierRecord[],
  filename = 'commission-partners',
): Promise<void> {
  await downloadCsv(filename, commissionPartnersToExportSheet(partners));
}

export async function exportCommissionPartnersXlsx(
  partners: PartnerSupplierRecord[],
  filename = 'commission-partners',
): Promise<void> {
  await downloadXlsx(filename, commissionPartnersToExportSheet(partners), 'Commission Partners');
}
