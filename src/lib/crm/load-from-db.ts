import type { Customer } from '@/components/CustomersView';
import { createSupabaseAdminClient } from '@/lib/supabase/admin';
import {
  dealRowToContract,
  recordRowToDocument,
  rowsToCustomer,
  type DbContactRow,
  type DbCustomerRow,
  type DbDealRow,
  type DbLocationRow,
  type DbRecordRow,
} from '@/lib/crm/db-mapper';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { CrmSnapshot } from '@/lib/crm/snapshot';

export type CrmBootstrap = CrmSnapshot & {
  source: 'supabase';
  customerCount: number;
};

export async function loadCrmFromDatabase(): Promise<CrmBootstrap | null> {
  const admin = createSupabaseAdminClient();

  const { data: customerRows, error: customerError } = await admin
    .from('customers')
    .select('*')
    .order('company');

  if (customerError) throw new Error(customerError.message);
  if (!customerRows?.length) return null;

  const { data: locationRows, error: locationError } = await admin
    .from('customer_locations')
    .select('*');

  if (locationError) throw new Error(locationError.message);

  const { data: contactRows, error: contactError } = await admin
    .from('customer_contacts')
    .select('*');

  if (contactError) throw new Error(contactError.message);

  const { data: dealRows, error: dealError } = await admin.from('deals').select('*');

  if (dealError) throw new Error(dealError.message);

  const { data: recordRows, error: recordError } = await admin
    .from('customer_records')
    .select('*');

  if (recordError) throw new Error(recordError.message);

  const locationsByCustomer = groupBy(locationRows as DbLocationRow[], 'customer_id');
  const contactsByCustomer = groupBy(contactRows as DbContactRow[], 'customer_id');
  const dealsByCustomer = groupBy(dealRows as DbDealRow[], 'customer_id');
  const recordsByCustomer = groupBy(recordRows as DbRecordRow[], 'customer_id');

  const customers: Customer[] = [];
  const documentsByCustomerId: Record<string, CustomerDocument[]> = {};
  const contractsByCustomerId: Record<string, CandidContractRecord[]> = {};

  for (const row of customerRows as DbCustomerRow[]) {
    const customer = rowsToCustomer(
      row,
      locationsByCustomer.get(row.id) ?? [],
      contactsByCustomer.get(row.id) ?? [],
    );
    customers.push(customer);

    const externalId = row.external_id;
    documentsByCustomerId[externalId] = (recordsByCustomer.get(row.id) ?? []).map((r) =>
      recordRowToDocument(r, externalId),
    );
    contractsByCustomerId[externalId] = (dealsByCustomer.get(row.id) ?? []).map((d) =>
      dealRowToContract(d, externalId),
    );
  }

  customers.sort((a, b) => a.company.localeCompare(b.company));

  return {
    source: 'supabase',
    customerCount: customers.length,
    customers,
    documentsByCustomerId,
    contractsByCustomerId,
  };
}

function groupBy<T extends Record<string, unknown>>(rows: T[], key: keyof T): Map<string, T[]> {
  const map = new Map<string, T[]>();
  for (const row of rows) {
    const id = String(row[key]);
    const list = map.get(id) ?? [];
    list.push(row);
    map.set(id, list);
  }
  return map;
}

export async function getCrmCustomerUuid(externalId: string): Promise<string | null> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from('customers')
    .select('id')
    .eq('external_id', externalId)
    .maybeSingle();
  if (error || !data) return null;
  return data.id;
}

export function customerUuidMap(rows: DbCustomerRow[]): Map<string, string> {
  return new Map(rows.map((row) => [row.external_id, row.id]));
}
