'use client';

import React, { useMemo, useRef, useState } from 'react';
import {
  DEAL_STATUS_OPTIONS,
  PAY_SOURCE_OPTIONS,
  RECORD_KIND_OPTIONS,
  calcCandidCommissionAmount,
  type CandidContractRecord,
  type CustomerDocument,
  type DealStatus,
  type RecordKind,
} from '@/lib/customer-records';
import {
  parseContractDocumentFromFile,
  type ContractDocumentExtractResult,
} from '@/lib/contract-document-extract';
import {
  buildCustomerProfilePatchFromExtract,
  describeCustomerProfilePatch,
  guessRecordKindFromFile,
  mediaTypeForCustomerDocument,
  parseCustomerDocumentFromFile,
  type CustomerProfilePatch,
} from '@/lib/customer-document-extract';
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
  | { type: 'document'; doc: CustomerDocument; profilePatch?: CustomerProfilePatch }
  | {
      type: 'candid_contract';
      doc: CustomerDocument;
      contract: CandidContractRecord;
      profilePatch?: CustomerProfilePatch;
    };

type Props = {
  customerId: string;
  locations: Location[];
  defaultLocationId: string;
  uploadedBy: string;
  customerWebsite?: string;
  customerMccCode?: string;
  primaryLocation?: Location | null;
  onClose: () => void;
  onSave: (result: AddCustomerRecordsResult) => void;
};

const newId = () => `id-${Math.random().toString(36).slice(2, 10)}`;

export function AddCustomerRecordsModal({
  customerId,
  locations,
  defaultLocationId,
  uploadedBy,
  customerWebsite,
  customerMccCode,
  primaryLocation,
  onClose,
  onSave,
}: Props) {
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [dragOver, setDragOver] = useState(false);
  const [recordKind, setRecordKind] = useState<RecordKind>('statement');
  const [locationId, setLocationId] = useState(defaultLocationId);

  const [dealId, setDealId] = useState('');
  const [agentOfRecord, setAgentOfRecord] = useState('');
  const [paySource, setPaySource] = useState('');
  const [solution, setSolution] = useState('');
  const [service, setService] = useState('');
  const [product, setProduct] = useState('');
  const [solutionDescription, setSolutionDescription] = useState('');
  const [candidCommissionRate, setCandidCommissionRate] = useState('');
  const [spiffExpected, setSpiffExpected] = useState('');
  const [mrr, setMrr] = useState('');
  const [mrc, setMrc] = useState('');
  const [estimatedTotalBill, setEstimatedTotalBill] = useState('');
  const [dealStatus, setDealStatus] = useState<DealStatus>('active');
  const [contractTerms, setContractTerms] = useState('');
  const [contractStartDate, setContractStartDate] = useState('');
  const [contractEndDate, setContractEndDate] = useState('');
  const [physicalLocationId, setPhysicalLocationId] = useState(defaultLocationId);
  const [billingLocationId, setBillingLocationId] = useState(defaultLocationId);
  const [parsing, setParsing] = useState(false);
  const [parseNote, setParseNote] = useState('');
  const [profilePatch, setProfilePatch] = useState<CustomerProfilePatch | undefined>();

  const isCandidContract = recordKind === 'candid_contract';

  const computedCommissionAmount = useMemo(() => {
    const mrrNum = mrr.trim() ? Number(mrr) : undefined;
    const rateNum = candidCommissionRate.trim() ? Number(candidCommissionRate) : undefined;
    if (mrrNum == null || rateNum == null || !Number.isFinite(mrrNum) || !Number.isFinite(rateNum)) {
      return undefined;
    }
    return calcCandidCommissionAmount(mrrNum, rateNum);
  }, [mrr, candidCommissionRate]);

  const applyContractExtract = (result: ContractDocumentExtractResult) => {
    const setIfEmpty = (current: string, value: string | undefined, setter: (v: string) => void) => {
      if (value?.trim() && !current.trim()) setter(value.trim());
    };
    const setNumIfEmpty = (current: string, value: number | undefined, setter: (v: string) => void) => {
      if (value != null && Number.isFinite(value) && !current.trim()) setter(String(value));
    };

    setIfEmpty(dealId, result.dealId, setDealId);
    setIfEmpty(paySource, result.paySource, setPaySource);
    setIfEmpty(solution, result.provider, setSolution);
    setIfEmpty(product, result.product, setProduct);
    if (result.serviceDescription) {
      setIfEmpty(solutionDescription, result.serviceDescription, setSolutionDescription);
      setIfEmpty(service, result.serviceDescription, setService);
    }
    setNumIfEmpty(mrr, result.mrr, setMrr);
    setNumIfEmpty(mrc, result.mrc ?? result.mrr, setMrc);
    setIfEmpty(contractStartDate, result.contractStartDate, setContractStartDate);
    setIfEmpty(contractEndDate, result.contractEndDate, setContractEndDate);
  };

  const handleFile = async (f: File) => {
    setFile(f);
    setParseNote('');
    setProfilePatch(undefined);

    const guessedKind = guessRecordKindFromFile(f);
    const looksLikeContract =
      guessedKind === 'candid_contract' ||
      guessedKind === 'external_contract' ||
      /contract|agreement|msa|sow|order\s*form/i.test(f.name);
    const shouldParseContract = looksLikeContract || recordKind === 'candid_contract';

    if (looksLikeContract) {
      setRecordKind('candid_contract');
    }

    const canParseDocument = Boolean(mediaTypeForCustomerDocument(f));
    if (!canParseDocument && !shouldParseContract) return;

    setParsing(true);
    const notes: string[] = [];
    try {
      if (canParseDocument) {
        try {
          const customerResult = await parseCustomerDocumentFromFile(f);
          const patch = buildCustomerProfilePatchFromExtract(customerResult, {
            website: customerWebsite,
            mccCode: customerMccCode,
            primaryLocation,
          });
          if (patch) {
            setProfilePatch(patch);
            const profileNote = describeCustomerProfilePatch(patch);
            if (profileNote) notes.push(profileNote);
          }
        } catch (err) {
          notes.push(err instanceof Error ? err.message : 'Could not read company profile from document.');
        }
      }

      if (shouldParseContract) {
        try {
          const result = await parseContractDocumentFromFile(f);
          applyContractExtract(result);
          if (result.source === 'ai') {
            notes.push('Contract fields prefilled from document — please verify before saving.');
          } else if (result.source === 'filename') {
            notes.push('Limited contract hints from filename only — enter details manually or try a PDF/image.');
          } else {
            notes.push('Could not extract contract fields. Enter details manually.');
          }
        } catch (err) {
          notes.push(err instanceof Error ? err.message : 'Could not parse contract.');
        }
      } else if (canParseDocument && notes.length === 0) {
        notes.push('No empty profile fields found to update from this document.');
      }

      setParseNote(notes.join(' '));
    } finally {
      setParsing(false);
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
      const candidRateNum = candidCommissionRate.trim() ? Number(candidCommissionRate) : undefined;
      const spiffNum = spiffExpected.trim() ? Number(spiffExpected) : undefined;
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
        candidCommissionRate: candidRateNum,
        commissionAmount:
          candidRateNum != null && mrrNum > 0
            ? calcCandidCommissionAmount(mrrNum, candidRateNum)
            : undefined,
        spiffExpected: spiffNum,
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
      onSave({ type: 'candid_contract', doc: { ...doc, contractId }, contract, profilePatch });
      return;
    }

    onSave({ type: 'document', doc, profilePatch });
  };

  function recordKindLabel() {
    return RECORD_KIND_OPTIONS.find((o) => o.value === recordKind)?.label ?? recordKind;
  }

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      onDragOver={(e) => { e.preventDefault(); }}
      onDrop={(e) => { e.preventDefault(); }}
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
              <select
                value={recordKind}
                onChange={(e) => {
                  const kind = e.target.value as RecordKind;
                  setRecordKind(kind);
                  if (kind === 'candid_contract' && file) {
                    void handleFile(file);
                  }
                }}
                style={inputStyle}
              >
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
            onDragEnter={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragOver={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(true);
            }}
            onDragLeave={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
            }}
            onDrop={(e) => {
              e.preventDefault();
              e.stopPropagation();
              setDragOver(false);
              const f = e.dataTransfer.files?.[0];
              if (f) void handleFile(f);
            }}
            style={{
              border: `2px dashed ${dragOver ? BRAND.red : BRAND.grayBorder}`,
              borderRadius: 10,
              padding: 24,
              textAlign: 'center',
              cursor: 'pointer',
              marginBottom: 18,
              background: dragOver ? 'var(--red-light, #FEE2E2)' : BRAND.grayLight,
            }}
          >
            <input ref={fileRef} type="file" hidden onChange={(e) => { const f = e.target.files?.[0]; if (f) void handleFile(f); }} />
            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>
              {parsing ? 'Reading document…' : file ? file.name : 'Drop a file or click to browse'}
            </div>
            <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 4 }}>
              PDF or image — AI will extract contract and profile fields when applicable
            </div>
            {parseNote && (
              <div style={{ fontSize: 11, color: parseNote.includes('prefilled') || parseNote.includes('Will update') ? '#1A7A4A' : BRAND.gray, marginTop: 8 }}>
                {parseNote}
              </div>
            )}
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
                <div><FieldLabel>MRR ($)</FieldLabel><input value={mrr} onChange={(e) => setMrr(e.target.value)} type="number" min={0} step={0.01} style={inputStyle} /></div>
                <div>
                  <FieldLabel>Candid commission rate (%)</FieldLabel>
                  <input
                    value={candidCommissionRate}
                    onChange={(e) => setCandidCommissionRate(e.target.value)}
                    type="number"
                    min={0}
                    max={100}
                    step={0.01}
                    placeholder="e.g. 12"
                    style={inputStyle}
                  />
                </div>
                <div>
                  <FieldLabel>Commission amount ($)</FieldLabel>
                  <input
                    readOnly
                    value={computedCommissionAmount != null ? String(computedCommissionAmount) : ''}
                    placeholder="Auto from MRR × rate"
                    type="number"
                    style={{ ...inputStyle, background: BRAND.grayLight, color: BRAND.gray }}
                  />
                </div>
                <div>
                  <FieldLabel>SPIFF expected ($)</FieldLabel>
                  <input
                    value={spiffExpected}
                    onChange={(e) => setSpiffExpected(e.target.value)}
                    type="number"
                    min={0}
                    step={0.01}
                    placeholder="One-time SPIFF"
                    style={inputStyle}
                  />
                </div>
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
