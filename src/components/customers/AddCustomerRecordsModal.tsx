'use client';

import React, { useRef, useState } from 'react';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  RECORD_KIND_OPTIONS,
  parseContractHintsFromFile,
  type CandidContractRecord,
  type CustomerDocument,
  type DealStatus,
  type RecordKind,
} from '@/lib/customer-records';
import type { Location } from '@/components/CustomersView';

const BRAND = {
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  grayDark: '#1E1E1E',
  gray: '#6B6B6B',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
} as const;

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: `1px solid ${BRAND.grayBorder}`,
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 13,
  color: BRAND.grayDark,
  outline: 'none',
  boxSizing: 'border-box',
};

const FieldLabel: React.FC<{ children: React.ReactNode }> = ({ children }) => (
  <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: BRAND.gray, letterSpacing: '0.06em', marginBottom: 5 }}>
    {children}
  </label>
);

export type AddCustomerRecordsResult =
  | { type: 'document'; doc: CustomerDocument }
  | { type: 'candid_contract'; doc: CustomerDocument; contract: CandidContractRecord };

type Props = {
  customerId: string;
  locations: Location[];
  defaultLocationId: string;
  uploadedBy: string;
  onClose: () => void;
  onSave: (result: AddCustomerRecordsResult) => void;
};

const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

export function AddCustomerRecordsModal({
  customerId,
  locations,
  defaultLocationId,
  uploadedBy,
  onClose,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [recordKind, setRecordKind] = useState<RecordKind>('statement');
  const [locationId, setLocationId] = useState(defaultLocationId);

  const [dealId, setDealId] = useState('');
  const [agentOfRecord, setAgentOfRecord] = useState('');
  const [paySource, setPaySource] = useState('');
  const [solution, setSolution] = useState('');
  const [service, setService] = useState('');
  const [product, setProduct] = useState('');
  const [solutionDescription, setSolutionDescription] = useState('');
  const [commissionAmount, setCommissionAmount] = useState('');
  const [mrr, setMrr] = useState('');
  const [mrc, setMrc] = useState('');
  const [estimatedTotalBill, setEstimatedTotalBill] = useState('');
  const [dealStatus, setDealStatus] = useState<DealStatus>('active');
  const [contractTerms, setContractTerms] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [physicalLocationId, setPhysicalLocationId] = useState(defaultLocationId);
  const [billingLocationId, setBillingLocationId] = useState(defaultLocationId);

  const isCandidContract = recordKind === 'candid_contract';

  const applyFileHints = (f: File) => {
    setFile(f);
    if (recordKind === 'candid_contract' || f.name.toLowerCase().includes('contract')) {
      const hints = parseContractHintsFromFile(f);
      if (hints.dealId) setDealId(hints.dealId);
      if (hints.mrr != null) setMrr(String(hints.mrr));
      if (hints.contractStartDate) setContractStartDate(hints.contractStartDate);
    }
  };

  const submit = () => {
    const loc = locationId || defaultLocationId;
    const filename = file?.name ?? `${recordKindLabel()}-${Date.now()}`;
    const doc: CustomerDocument = {
      id: newId(),
      customerId,
      locationId: loc,
      filename,
      recordKind,
      uploadedBy,
      date: new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' }),
      size: file ? `${Math.max(1, Math.round(file.size / 1024))} KB` : '—',
    };

    if (isCandidContract) {
      const contractId = newId();
      const mrrNum = mrr.trim() ? Number(mrr) : 0;
      const contract: CandidContractRecord = {
        id: contractId,
        customerId,
        locationId: loc,
        dealId: dealId.trim() || undefined,
        agentOfRecord: agentOfRecord.trim() || undefined,
        paySource: paySource || undefined,
        solution: solution.trim() || undefined,
        service: service.trim() || undefined,
        product: product.trim() || undefined,
        solutionDescription: solutionDescription.trim() || undefined,
        commissionAmount: commissionAmount.trim() ? Number(commissionAmount) : undefined,
        mrr: mrrNum || undefined,
        mrc: mrc.trim() ? Number(mrc) : undefined,
        estimatedTotalBill: estimatedTotalBill.trim() ? Number(estimatedTotalBill) : undefined,
        dealStatus,
        contractTerms: contractTerms.trim() || undefined,
        contractStartDate: contractStartDate || undefined,
        contractEndDate: contractEndDate || undefined,
        physicalLocationId: physicalLocationId || loc,
        billingLocationId: billingLocationId || loc,
        vendor: [solution, service, product].filter(Boolean).join(' · ') || 'Candid Contract',
        monthly: mrrNum,
        expires: contractEndDate || '—',
        autoRenews: false,
      };
      onSave({ type: 'candid_contract', doc: { ...doc, contractId }, contract });
      return;
    }

    onSave({ type: 'document', doc });
  };

  function recordKindLabel() {
    return RECORD_KIND_OPTIONS.find((o) => o.value === recordKind)?.label ?? recordKind;
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', backdropFilter: 'blur(4px)', padding: 16 }}
    >
      <div style={{ background: BRAND.white, borderRadius: 14, width: 760, maxWidth: '95vw', maxHeight: '92vh', display: 'flex', flexDirection: 'column', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
        <div style={{ background: BRAND.grayDark, padding: '20px 26px', flexShrink: 0, position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${BRAND.redDark},${BRAND.redLight})` }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: BRAND.white }}>Add Customer Record</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Upload a file and classify it, or enter Candid contract details</div>
            </div>
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
          </div>
        </div>

        <div style={{ padding: 24, overflowY: 'auto', flex: 1 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
            <div>
              <FieldLabel>Record type *</FieldLabel>
              <select value={recordKind} onChange={(e) => setRecordKind(e.target.value as RecordKind)} style={inputStyle}>
                {['Billing', 'Sales', 'Contracts', 'Other'].map((group) => (
                  <optgroup key={group} label={group}>
                    {RECORD_KIND_OPTIONS.filter((o) => o.group === group).map((o) => (
                      <option key={o.value} value={o.value}>{o.label}</option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>
            <div>
              <FieldLabel>Location</FieldLabel>
              <select value={locationId} onChange={(e) => setLocationId(e.target.value)} style={inputStyle}>
                {locations.map((l) => (
                  <option key={l.id} value={l.id}>{l.label}{l.isPrimary ? ' (Primary)' : ''}</option>
                ))}
              </select>
            </div>
          </div>

          <div
            onClick={() => fileRef.current?.click()}
            style={{ border: `2px dashed ${BRAND.grayBorder}`, borderRadius: 10, padding: 24, textAlign: 'center', cursor: 'pointer', marginBottom: 18, background: BRAND.grayLight }}
          >
            <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) applyFileHints(f); }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>{file ? file.name : 'Drop a file or click to browse'}</div>
            <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 4 }}>PDF, Excel, images — we&apos;ll try to extract contract fields when applicable</div>
          </div>

          {isCandidContract && (
            <>
              <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: BRAND.gray, marginBottom: 10 }}>Candid contract details</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div><FieldLabel>Deal ID</FieldLabel><input value={dealId} onChange={(e) => setDealId(e.target.value)} style={inputStyle} /></div>
                <div><FieldLabel>Agent of Record</FieldLabel><input value={agentOfRecord} onChange={(e) => setAgentOfRecord(e.target.value)} style={inputStyle} /></div>
                <div>
                  <FieldLabel>Pay Source</FieldLabel>
                  <select value={paySource} onChange={(e) => setPaySource(e.target.value)} style={inputStyle}>
                    <option value="">Select…</option>
                    {PAY_SOURCE_OPTIONS.map((p) => <option key={p} value={p}>{p}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Deal Status</FieldLabel>
                  <select value={dealStatus} onChange={(e) => setDealStatus(e.target.value as DealStatus)} style={inputStyle}>
                    {DEAL_STATUS_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                  </select>
                </div>
                <div><FieldLabel>Solution</FieldLabel><input value={solution} onChange={(e) => setSolution(e.target.value)} style={inputStyle} /></div>
                <div><FieldLabel>Service</FieldLabel><input value={service} onChange={(e) => setService(e.target.value)} style={inputStyle} /></div>
                <div><FieldLabel>Product</FieldLabel><input value={product} onChange={(e) => setProduct(e.target.value)} style={inputStyle} /></div>
                <div style={{ gridColumn: '1 / -1' }}>
                  <FieldLabel>Solution Description</FieldLabel>
                  <textarea value={solutionDescription} onChange={(e) => setSolutionDescription(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
                </div>
                <div><FieldLabel>Commission Amount (manual)</FieldLabel><input value={commissionAmount} onChange={(e) => setCommissionAmount(e.target.value)} type="number" style={inputStyle} /></div>
                <div><FieldLabel>MRR</FieldLabel><input value={mrr} onChange={(e) => setMrr(e.target.value)} type="number" style={inputStyle} /></div>
                <div><FieldLabel>MRC</FieldLabel><input value={mrc} onChange={(e) => setMrc(e.target.value)} type="number" style={inputStyle} /></div>
                <div><FieldLabel>Estimated Total Bill</FieldLabel><input value={estimatedTotalBill} onChange={(e) => setEstimatedTotalBill(e.target.value)} type="number" style={inputStyle} /></div>
                <div><FieldLabel>Contract Start</FieldLabel><input value={contractStartDate} onChange={(e) => setContractStartDate(e.target.value)} type="date" style={inputStyle} /></div>
                <div><FieldLabel>Contract End</FieldLabel><input value={contractEndDate} onChange={(e) => setContractEndDate(e.target.value)} type="date" style={inputStyle} /></div>
                <div style={{ gridColumn: '1 / -1' }}><FieldLabel>Contract Terms</FieldLabel><textarea value={contractTerms} onChange={(e) => setContractTerms(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} /></div>
                <div>
                  <FieldLabel>Physical Location</FieldLabel>
                  <select value={physicalLocationId} onChange={(e) => setPhysicalLocationId(e.target.value)} style={inputStyle}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
                <div>
                  <FieldLabel>Billing Location</FieldLabel>
                  <select value={billingLocationId} onChange={(e) => setBillingLocationId(e.target.value)} style={inputStyle}>
                    {locations.map((l) => <option key={l.id} value={l.id}>{l.label}</option>)}
                  </select>
                </div>
              </div>
            </>
          )}

          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 22 }}>
            <button type="button" onClick={onClose} style={{ background: BRAND.grayLight, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 7, padding: '11px 18px', fontSize: 13, cursor: 'pointer' }}>Cancel</button>
            <button type="button" onClick={submit} style={{ background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`, color: BRAND.white, border: 'none', borderRadius: 7, padding: '11px 22px', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>Save Record</button>
          </div>
        </div>
      </div>
    </div>
  );
}
