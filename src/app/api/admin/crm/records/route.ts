import { NextResponse } from 'next/server';
import { getMyRole } from '@/lib/auth/roles';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import {
  deleteCustomerDeal,
  deleteCustomerDocument,
  persistCustomerRecord,
  updateCustomerDeal,
  updateCustomerDocument,
} from '@/lib/crm/persist';

export async function POST(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const body = (await request.json()) as {
      customerId?: string;
      document?: CustomerDocument;
      contract?: CandidContractRecord;
    };

    if (!body.customerId || !body.document) {
      return NextResponse.json({ error: 'customerId and document required' }, { status: 400 });
    }

    await persistCustomerRecord({
      customerExternalId: body.customerId,
      document: body.document,
      contract: body.contract,
    });

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Save failed';
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
      contract?: CandidContractRecord;
      document?: CustomerDocument;
    };

    if (!body.customerId) {
      return NextResponse.json({ error: 'customerId required' }, { status: 400 });
    }

    if (body.contract) {
      await updateCustomerDeal(body.customerId, body.contract);
    }
    if (body.document) {
      await updateCustomerDocument(body.customerId, body.document);
    }

    if (!body.contract && !body.document) {
      return NextResponse.json({ error: 'contract or document required' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Update failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function DELETE(request: Request) {
  if ((await getMyRole()) !== 'admin') {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const { searchParams } = new URL(request.url);
    let contractId = searchParams.get('contractId')?.trim() ?? undefined;
    let customerId = searchParams.get('customerId')?.trim() ?? undefined;
    let documentId = searchParams.get('documentId')?.trim() ?? undefined;

    if (!contractId && !documentId) {
      try {
        const body = (await request.json()) as {
          customerId?: string;
          documentId?: string;
          contractId?: string;
        };
        contractId = body.contractId?.trim() || contractId;
        customerId = body.customerId?.trim() || customerId;
        documentId = body.documentId?.trim() || documentId;
      } catch {
        // DELETE bodies are often stripped by proxies — query params are preferred.
      }
    }

    if (contractId) {
      await deleteCustomerDeal(contractId);
    }
    if (customerId && documentId) {
      await deleteCustomerDocument(customerId, documentId);
    }

    if (!contractId && !(customerId && documentId)) {
      return NextResponse.json({ error: 'contractId or documentId required' }, { status: 400 });
    }

    return NextResponse.json({ ok: true });
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Delete failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
