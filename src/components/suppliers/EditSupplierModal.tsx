'use client';

import { useRef, useState } from 'react';
import { SupplierLogo } from '@/components/SupplierLogo';
import { TagMultiInput } from '@/components/suppliers/TagMultiInput';
import {
  saveSolutionProvider,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';
import { PROVIDER_CATEGORY_OPTIONS, type ProviderCategory } from '@/lib/provider-categories';
import {
  FIND_SOLUTIONS_CAPABILITY_SUGGESTIONS,
  FIND_SOLUTIONS_SERVICE_SUGGESTIONS,
} from '@/lib/solutions/find-solutions-tags';

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
  const [logoUrl, setLogoUrl] = useState(provider?.logoUrl ?? '');
  const [logoStoragePath, setLogoStoragePath] = useState(provider?.logoStoragePath ?? '');
  const [description, setDescription] = useState(provider?.description ?? '');
  const [candidRecommended, setCandidRecommended] = useState(provider?.candidRecommended ?? false);
  const [findCapabilities, setFindCapabilities] = useState<string[]>(provider?.findCapabilities ?? []);
  const [findServices, setFindServices] = useState<string[]>(provider?.findServices ?? []);
  const [providerCategory, setProviderCategory] = useState<ProviderCategory | ''>(provider?.providerCategory ?? '');
  const [includeRatesInAnalysis, setIncludeRatesInAnalysis] = useState(provider?.includeRatesInAnalysis ?? false);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [uploadingLogo, setUploadingLogo] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const canUploadLogo = Boolean(provider?.dbId);

  const uploadLogo = async (file: File) => {
    if (!provider?.dbId) {
      setError('Save the supplier first, then upload a logo.');
      return;
    }
    setUploadingLogo(true);
    setError(null);
    try {
      const form = new FormData();
      form.set('file', file);
      form.set('providerDbId', String(provider.dbId));
      form.set('providerSlug', provider.id);
      form.set('providerName', provider.name);
      const res = await fetch('/api/admin/solution-providers/logo', {
        method: 'POST',
        body: form,
      });
      const data = (await res.json()) as {
        logoUrl?: string;
        logoStoragePath?: string;
        error?: string;
      };
      if (!res.ok || !data.logoUrl) throw new Error(data.error ?? 'Logo upload failed');
      setLogoUrl(data.logoUrl);
      setLogoStoragePath(data.logoStoragePath ?? '');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Logo upload failed');
    } finally {
      setUploadingLogo(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const removeLogo = async () => {
    if (!provider?.dbId) {
      setLogoUrl('');
      setLogoStoragePath('');
      return;
    }
    setUploadingLogo(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/solution-providers/logo', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          providerDbId: provider.dbId,
          providerSlug: provider.id,
          providerName: provider.name,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(data.error ?? 'Failed to remove logo');
      setLogoUrl('');
      setLogoStoragePath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to remove logo');
    } finally {
      setUploadingLogo(false);
    }
  };

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
        logoUrl: logoUrl.trim() || undefined,
        logoStoragePath: logoStoragePath.trim() || undefined,
        description: description.trim() || undefined,
        candidRecommended,
        findCapabilities,
        findServices,
        providerCategory: providerCategory || undefined,
        includeRatesInAnalysis: includeRatesInAnalysis || undefined,
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
      style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.65)', zIndex: 750, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 16 }}
    >
      <div style={{ background: 'var(--white)', borderRadius: 14, width: 520, maxWidth: '95vw', boxShadow: '0 24px 80px rgba(0,0,0,0.28)', maxHeight: '92vh', overflowY: 'auto' }}>
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
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Provider type</label>
            <select
              value={providerCategory}
              onChange={(e) => setProviderCategory(e.target.value as ProviderCategory | '')}
              style={inputStyle}
            >
              <option value="">— Select category —</option>
              {PROVIDER_CATEGORY_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </div>
          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 13,
              marginBottom: 14,
              cursor: 'pointer',
              color: 'var(--gray-dark)',
            }}
          >
            <input
              type="checkbox"
              checked={includeRatesInAnalysis}
              onChange={(e) => setIncludeRatesInAnalysis(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>Include rates in customer analysis</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', marginTop: 4, fontWeight: 400 }}>
                When enabled, this supplier&apos;s solution rates can feed member savings analysis.
                {providerCategory === 'merchant_services' && ' Merchant services vendors also get an Our rate tab.'}
              </span>
            </span>
          </label>
          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Website</label>
            <input value={website} onChange={(e) => setWebsite(e.target.value)} style={inputStyle} />
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 5 }}>
              Used for favicon lookup when no custom logo is uploaded.
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
              Find Solutions description
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={3}
              placeholder="Short customer-facing pitch for this supplier on Find Solutions…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>

          <label
            style={{
              display: 'flex',
              alignItems: 'flex-start',
              gap: 8,
              fontSize: 13,
              marginBottom: 14,
              cursor: 'pointer',
              color: 'var(--gray-dark)',
            }}
          >
            <input
              type="checkbox"
              checked={candidRecommended}
              onChange={(e) => setCandidRecommended(e.target.checked)}
              style={{ marginTop: 2 }}
            />
            <span>
              <strong>Candid recommended</strong>
              <span style={{ display: 'block', fontSize: 11, color: 'var(--gray)', marginTop: 4, fontWeight: 400 }}>
                Highlight this supplier on the customer Find Solutions page.
              </span>
            </span>
          </label>

          <TagMultiInput
            label="Capabilities (Find Solutions)"
            hint="Shown as checklist bullets and used in the Capabilities filter."
            value={findCapabilities}
            onChange={setFindCapabilities}
            suggestions={FIND_SOLUTIONS_CAPABILITY_SUGGESTIONS}
          />

          <TagMultiInput
            label="Products & services (Find Solutions)"
            hint="Shown as chips and used in the Products & services filter."
            value={findServices}
            onChange={setFindServices}
            suggestions={FIND_SOLUTIONS_SERVICE_SUGGESTIONS}
          />

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 8 }}>
              Logo
            </label>
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                padding: 12,
                border: '1px solid var(--gray-border)',
                borderRadius: 10,
                background: 'var(--surface-muted)',
              }}
            >
              <SupplierLogo
                vendor={displayName || name}
                website={website}
                logoUrl={logoUrl || null}
                size={48}
                variant="row"
              />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, color: 'var(--gray-dark)', fontWeight: 600, marginBottom: 6 }}>
                  {logoUrl ? 'Custom logo' : 'Using website favicon / initials'}
                </div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                  <button
                    type="button"
                    className="btn-secondary"
                    style={{ fontSize: 12, padding: '6px 12px' }}
                    disabled={uploadingLogo || (!canUploadLogo && isNew)}
                    onClick={() => fileInputRef.current?.click()}
                  >
                    {uploadingLogo ? 'Uploading…' : logoUrl ? 'Replace logo' : 'Upload logo'}
                  </button>
                  {logoUrl && (
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 12, padding: '6px 12px' }}
                      disabled={uploadingLogo}
                      onClick={() => void removeLogo()}
                    >
                      Remove
                    </button>
                  )}
                </div>
                {!canUploadLogo && (
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 6 }}>
                    Save this supplier once, then reopen to upload a logo.
                  </div>
                )}
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,image/x-icon,.png,.jpg,.jpeg,.webp,.svg,.ico"
                  style={{ display: 'none' }}
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (file) void uploadLogo(file);
                  }}
                />
              </div>
            </div>
          </div>

          <div style={{ marginBottom: 14 }}>
            <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>Notes</label>
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={3} style={{ ...inputStyle, resize: 'vertical' }} />
          </div>
          {error && <p style={{ color: 'var(--red)', fontSize: 13 }}>{error}</p>}
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 18 }}>
            <button type="button" onClick={onClose} className="btn-secondary" disabled={saving || uploadingLogo}>Cancel</button>
            <button type="button" onClick={() => void submit()} className="btn-primary" disabled={saving || uploadingLogo}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

export default EditSupplierModal;
