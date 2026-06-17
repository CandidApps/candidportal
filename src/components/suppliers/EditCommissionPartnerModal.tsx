'use client';

import { useState } from 'react';
import type { CommissionPartnerRow } from '@/lib/commission-partners';
import { createPartnerSupplier, updatePartnerSupplier } from '@/lib/services/bank-deposits';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

export function EditCommissionPartnerModal({
  row,
  onClose,
  onSave,
}: {
  row: CommissionPartnerRow;
  onClose: () => void;
  onSave: () => void;
}) {
  const [displayName, setDisplayName] = useState(row.partner?.display_name ?? row.paySource);
  const [bankOrigCoName, setBankOrigCoName] = useState(row.bankOrigCoName ?? '');
  const [bankOrigId, setBankOrigId] = useState(row.bankOrigId ?? '');
  const [commissionRate, setCommissionRate] = useState(
    row.commissionRate != null ? String(row.commissionRate) : '',
  );
  const [contactName, setContactName] = useState(row.contactName ?? '');
  const [contactEmail, setContactEmail] = useState(row.contactEmail ?? '');
  const [contactPhone, setContactPhone] = useState(row.contactPhone ?? '');
  const [website, setWebsite] = useState(row.partner?.website ?? '');
  const [notes, setNotes] = useState(row.partner?.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    setSaving(true);
    setError(null);
    try {
      const rate = commissionRate.trim() ? Number(commissionRate) : null;
      if (row.partner) {
        await updatePartnerSupplier({
          id: row.partner.id,
          displayName: displayName.trim() || row.paySource,
          bankOrigCoName: bankOrigCoName.trim() || null,
          bankOrigId: bankOrigId.trim() || null,
          bankSourceAliases: [row.paySource, displayName.trim()].filter(Boolean),
          commissionRate: rate,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          website: website.trim() || null,
          notes: notes.trim() || null,
        });
      } else {
        await createPartnerSupplier({
          name: row.paySource,
          displayName: displayName.trim() || row.paySource,
          bankOrigCoName: bankOrigCoName.trim() || null,
          bankOrigId: bankOrigId.trim() || null,
          bankSourceAliases: [row.paySource],
          commissionRate: rate,
          contactName: contactName.trim() || null,
          contactEmail: contactEmail.trim() || null,
          contactPhone: contactPhone.trim() || null,
          website: website.trim() || null,
          notes: notes.trim() || null,
        });
      }
      onSave();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div
      onClick={(e) => { if (e.target === e.currentTarget) onClose(); }}
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--white)', borderRadius: 14, width: 560, maxWidth: '95vw', maxHeight: '92vh', overflow: 'auto', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
        <div style={{ background: 'var(--gray-dark)', padding: '20px 26px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,var(--red-dark),var(--red-light))' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--white)' }}>Edit Commission Partner</div>
              <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2 }}>Pay source: {row.paySource}</div>
            </div>
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Display name</label>
              <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Bank ORIG name</label>
              <input value={bankOrigCoName} onChange={(e) => setBankOrigCoName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Bank ORIG ID</label>
              <input value={bankOrigId} onChange={(e) => setBankOrigId(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Candid commission rate (%)</label>
              <input type="number" min={0} max={100} step={0.5} value={commissionRate} onChange={(e) => setCommissionRate(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Website</label>
              <input value={website} onChange={(e) => setWebsite(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Contact name</label>
              <input value={contactName} onChange={(e) => setContactName(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Contact email</label>
              <input value={contactEmail} onChange={(e) => setContactEmail(e.target.value)} style={inputStyle} />
            </div>
            <div>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Contact phone</label>
              <input value={contactPhone} onChange={(e) => setContactPhone(e.target.value)} style={inputStyle} />
            </div>
            <div style={{ gridColumn: '1 / -1' }}>
              <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Notes</label>
              <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} style={{ ...inputStyle, resize: 'vertical' }} />
            </div>
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: 13, marginTop: 12 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
            <button type="button" onClick={() => void submit()} className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save Partner'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditCommissionPartnerModal;
