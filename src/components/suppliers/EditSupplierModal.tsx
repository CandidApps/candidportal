'use client';

import { useState } from 'react';
import {
  saveSolutionProvider,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontSize: 13,
  boxSizing: 'border-box',
};

export function EditSupplierModal({
  provider,
  initialName,
  onClose,
  onSave,
}: {
  provider: SolutionProviderRecord | null;
  /** Pre-fill provider name when adding (e.g. from search box). */
  initialName?: string;
  onClose: () => void;
  onSave: (record: SolutionProviderRecord) => void | Promise<void>;
}) {
  const isNew = !provider;
  const [name, setName] = useState(provider?.name ?? initialName?.trim() ?? '');
  const [displayName, setDisplayName] = useState(provider?.displayName ?? '');
  const [website, setWebsite] = useState(provider?.website ?? '');
  const [notes, setNotes] = useState(provider?.notes ?? '');
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    const trimmed = name.trim();
    if (!trimmed) {
      setError('Provider name is required.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      const now = new Date().toISOString();
      const record: SolutionProviderRecord = {
        id: provider?.id ?? trimmed.toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        dbId: provider?.dbId,
        name: trimmed,
        displayName: displayName.trim() || undefined,
        website: website.trim() || undefined,
        notes: notes.trim() || undefined,
        contacts: provider?.contacts ?? [],
        solutions: provider?.solutions ?? [],
        createdAt: provider?.createdAt ?? now,
        updatedAt: now,
      };
      await onSave(await saveSolutionProvider(record));
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
      <div style={{ background: 'var(--white)', borderRadius: 14, width: 520, maxWidth: '95vw', boxShadow: '0 24px 80px rgba(0,0,0,0.28)' }}>
        <div style={{ background: 'var(--gray-dark)', padding: '20px 26px', position: 'relative' }}>
          <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: 'linear-gradient(90deg,var(--red-dark),var(--red-light))' }} />
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontFamily: 'var(--font-display)', fontSize: 17, fontWeight: 600, color: 'var(--white)' }}>
              {isNew ? 'Add Supplier / Vendor' : 'Edit Supplier / Vendor'}
            </div>
            <button type="button" onClick={onClose} style={{ width: 30, height: 30, background: 'rgba(255,255,255,0.08)', border: 'none', borderRadius: 6, cursor: 'pointer', color: '#9CA3AF' }}>✕</button>
          </div>
        </div>
        <div style={{ padding: 24 }}>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Provider name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Comcast, Dialpad, Vonage" style={inputStyle} disabled={!isNew} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Display name (optional)</label>
            <input value={displayName} onChange={(e) => setDisplayName(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving}>Cancel</button>
            <button type="button" onClick={() => void submit()} className="btn-primary" disabled={saving}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditSupplierModal;
