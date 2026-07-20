'use client';

import { useMemo, useState } from 'react';
import type { Location } from '@/components/CustomersView';
import {
  applyPipelineExtrasToForm,
  buildCandidContractRecord,
  candidContractFormFromRecord,
  CandidContractDealFields,
  emptyCandidContractForm,
  type CandidContractFormState,
} from '@/components/customers/CandidContractDealFields';
import { updateCrmDeal } from '@/lib/crm/client-persist';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { PipelineContractExtras } from '@/lib/crm/contract-service-pricing';
import type { ContractSubmitActionRow } from '@/lib/services/contract-submit-actions';
import { dealAccountDisplayName } from '@/lib/services/contract-submit-actions';
import { setContractOverride } from '@/lib/customer-contract-overrides';

export type ConvertRegistrationPayload = {
  action: ContractSubmitActionRow;
  dealExternalId: string;
  pipelineExtras: PipelineContractExtras;
  contract: CandidContractRecord | null;
  locations: Location[];
};

type Props = {
  payload: ConvertRegistrationPayload;
  onClose: () => void;
  onSaved?: (contract: CandidContractRecord) => void;
};

function seedForm(payload: ConvertRegistrationPayload): CandidContractFormState {
  const locId =
    payload.locations.find((l) => l.isPrimary)?.id ?? payload.locations[0]?.id ?? '';
  if (payload.contract) {
    return candidContractFormFromRecord({
      ...payload.contract,
      locationId: payload.contract.locationId || locId,
      physicalLocationId: payload.contract.physicalLocationId || locId,
      billingLocationId: payload.contract.billingLocationId || locId,
    });
  }
  const base = emptyCandidContractForm(locId);
  return applyPipelineExtrasToForm(base, payload.pipelineExtras, {
    paySource: payload.action.pay_source,
    solution: payload.action.vendor_name,
    serviceLabel: payload.action.service_label,
  });
}

export function CompleteDealRegistrationModal({ payload, onClose, onSaved }: Props) {
  const [form, setForm] = useState<CandidContractFormState>(() => seedForm(payload));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const accountLabel = useMemo(() => dealAccountDisplayName(payload.action), [payload.action]);
  const customerId =
    payload.contract?.customerId ||
    payload.action.crm_customer_external_id?.trim() ||
    '';

  const save = async () => {
    if (!customerId) {
      setError('No CRM customer linked yet — open the account and edit the deal there.');
      return;
    }
    setSaving(true);
    setError('');
    try {
      const locId =
        form.physicalLocationId ||
        form.billingLocationId ||
        payload.locations.find((l) => l.isPrimary)?.id ||
        payload.locations[0]?.id ||
        '';
      const contract = buildCandidContractRecord(form, {
        id: payload.dealExternalId,
        customerId,
        locationId: locId,
      });
      await updateCrmDeal(customerId, contract);
      setContractOverride(contract.id, {
        dealStatus: contract.dealStatus,
        paySource: contract.paySource,
        serviceTypeId: contract.serviceTypeId,
        solution: contract.solution,
        service: contract.service,
        product: contract.product,
        solutionDescription: contract.solutionDescription,
        merchantPricing: contract.merchantPricing,
        pricingStructureId: contract.pricingStructureId,
        pricingLineItems: contract.pricingLineItems,
        mrr: contract.mrr,
        mrc: contract.mrc,
        taxRatePercent: contract.taxRatePercent,
        estimatedTotalBill: contract.estimatedTotalBill,
        monthly: contract.monthly,
        candidCommissionRate: contract.candidCommissionRate,
        commissionAmount: contract.commissionAmount,
        spiffExpected: contract.spiffExpected,
        contractStartDate: contract.contractStartDate,
        contractEndDate: contract.contractEndDate,
        contractTerms: contract.contractTerms,
        locationId: contract.locationId,
        physicalLocationId: contract.physicalLocationId,
        billingLocationId: contract.billingLocationId,
        vendor: contract.vendor,
        expires: contract.expires,
        autoRenews: contract.autoRenews,
      });
      onSaved?.(contract);
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save deal registration');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      className="modal-overlay open"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box"
        style={{
          width: 720,
          maxWidth: '96vw',
          maxHeight: 'min(92vh, 900px)',
          display: 'flex',
          flexDirection: 'column',
          overflow: 'hidden',
        }}
      >
        <div className="modal-header" style={{ flexShrink: 0 }}>
          <div style={{ minWidth: 0, flex: 1, paddingRight: 8 }}>
            <div className="modal-title">Complete deal registration</div>
            <div style={{ fontSize: 12, color: '#9CA3AF', marginTop: 4 }}>
              {accountLabel} — confirm service type, pricing, and deal details before finishing.
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        <div
          className="modal-body"
          style={{
            padding: '20px 24px',
            overflowY: 'auto',
            flex: 1,
            minHeight: 0,
          }}
        >
          <p style={{ margin: '0 0 16px', fontSize: 13, color: 'var(--gray-dark)', lineHeight: 1.5 }}>
            The deal is active. Review merchant volume / rate structure (or standard MRC) and save to
            finish registration. You can skip and edit later from the customer account.
          </p>
          <CandidContractDealFields
            value={form}
            onChange={setForm}
            locations={payload.locations}
          />
          {error ? (
            <p style={{ margin: '12px 0 0', fontSize: 12, color: 'var(--red)' }}>{error}</p>
          ) : null}
        </div>

        <div
          style={{
            display: 'flex',
            gap: 10,
            justifyContent: 'flex-end',
            flexWrap: 'wrap',
            padding: '14px 24px',
            borderTop: '1px solid var(--gray-border)',
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={saving}
            onClick={onClose}
          >
            Skip for now
          </button>
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={saving}
            onClick={() => void save()}
          >
            {saving ? 'Saving…' : 'Save deal registration'}
          </button>
        </div>
      </div>
    </div>
  );
}
