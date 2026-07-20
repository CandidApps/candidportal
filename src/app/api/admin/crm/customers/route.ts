import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { Customer, Location } from '@/components/CustomersView';
import type { CustomerDocument } from '@/lib/customer-records';
import {
  archiveCustomer,
  createCrmCustomer,
  persistCustomerRecord,
  restoreCustomer,
  updateCustomerProfile,
  type CustomerProfilePersistPatch,
} from '@/lib/crm/persist';
import { CUSTOMER_ENRICHMENT_FIELD_META } from '@/lib/crm/customer-enrichment';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customer?: Customer;
      document?: CustomerDocument;
      contract?: import('@/lib/customer-records').CandidContractRecord;
    };

    if (!body.customer?.id || !body.customer.company?.trim()) {
      return NextResponse.json({ error: 'customer with id and company required' }, { status: 400 });
    }

    await createCrmCustomer(body.customer);

    if (body.document || body.contract) {
      await persistCustomerRecord({
        customerExternalId: body.customer.id,
        document: body.document,
        contract: body.contract,
      });
    }

    return NextResponse.json({ ok: true, customerId: body.customer.id });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Create failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function PATCH(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      op?: 'archive' | 'restore';
      website?: string;
      altWebsite?: string | null;
      linkedinUrl?: string;
      mccCode?: string;
      companyLegal?: string | null;
      corpType?: string | null;
      location?: Location;
      company?: string;
      industry?: string | null;
      description?: string | null;
      taxId?: string | null;
      agent?: string;
      status?: import('@/components/CustomersView').Customer['status'];
      notes?: string | null;
      savings?: number;
      since?: string;
    } & Partial<import('@/lib/crm/customer-enrichment').CustomerEnrichmentFields>;

    if (!body.customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 });
    }

    if (body.op === 'archive') {
      await archiveCustomer(body.customerId);
      return NextResponse.json({ ok: true });
    }

    if (body.op === 'restore') {
      await restoreCustomer(body.customerId);
      return NextResponse.json({ ok: true });
    }

    const patch: CustomerProfilePersistPatch = {};
    if (body.website !== undefined) patch.website = body.website;
    if (body.altWebsite !== undefined) patch.altWebsite = body.altWebsite;
    if (body.linkedinUrl !== undefined) patch.linkedinUrl = body.linkedinUrl;
    if (body.mccCode !== undefined) patch.mccCode = body.mccCode;
    if (body.companyLegal !== undefined) patch.companyLegal = body.companyLegal;
    if (body.corpType !== undefined) patch.corpType = body.corpType;
    if (body.location) patch.location = body.location;
    if (body.company !== undefined) patch.company = body.company;
    if (body.industry !== undefined) patch.industry = body.industry;
    if (body.description !== undefined) patch.description = body.description;
    if (body.taxId !== undefined) patch.taxId = body.taxId;
    if (body.agent !== undefined) patch.agent = body.agent;
    if (body.status !== undefined) patch.status = body.status;
    if (body.notes !== undefined) patch.notes = body.notes;
    if (body.savings !== undefined) patch.savings = body.savings;
    if (body.since !== undefined) patch.since = body.since;
    for (const meta of CUSTOMER_ENRICHMENT_FIELD_META) {
      const value = body[meta.key];
      if (typeof value === 'string') {
        patch[meta.key] = value;
      }
    }

    if (!Object.keys(patch).length) {
      return NextResponse.json({ error: 'No profile fields to update' }, { status: 400 });
    }

    await updateCustomerProfile(body.customerId, patch);
    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
