'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { PromoSlide } from '@/components/member/PromoSlide';
import { SearchableSelect } from '@/components/shared/SearchableSelect';
import {
  CAMPAIGN_CTA_MAX,
  CAMPAIGN_CRITERIA_MAX,
  CAMPAIGN_DETAILS_MAX,
  CAMPAIGN_SOURCE_LABEL,
  CAMPAIGN_STATUS_LABEL,
  CAMPAIGN_TITLE_MAX,
  DEFAULT_CAMPAIGN_CTA,
  campaignStatus,
  type CampaignCustomerFacing,
  type CampaignSource,
  type CampaignStructureType,
  type IncentiveCampaign,
} from '@/lib/incentive-campaigns';
import {
  createCampaign,
  deleteCampaign,
  removeCampaignBanner,
  updateCampaign,
  uploadCampaignBanner,
} from '@/lib/incentive-campaigns-client';
import type { SolutionProviderRecord } from '@/lib/solution-providers-types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '9px 11px',
  fontSize: 13,
  boxSizing: 'border-box',
  background: 'var(--page-bg-solid, #fff)',
  color: 'var(--gray-dark)',
};

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 700,
  color: 'var(--gray)',
  marginBottom: 5,
  letterSpacing: 0.2,
};

const sectionStyle: React.CSSProperties = { marginBottom: 14 };

const BANNER_ACCEPT = 'image/png,image/jpeg,image/webp';

export function CampaignEditorDrawer({
  campaign,
  defaultSource,
  defaultProviderDbId,
  providers,
  onClose,
  onSaved,
  onDeleted,
}: {
  /** Null when creating. */
  campaign: IncentiveCampaign | null;
  defaultSource?: CampaignSource;
  defaultProviderDbId?: number;
  providers: SolutionProviderRecord[];
  onClose: () => void;
  onSaved: (campaign: IncentiveCampaign) => void;
  onDeleted: (id: string) => void;
}) {
  const isNew = !campaign;
  const [source, setSource] = useState<CampaignSource>(campaign?.source ?? defaultSource ?? 'candid_promo');
  const [providerDbId, setProviderDbId] = useState<number | ''>(
    campaign?.providerDbId ?? defaultProviderDbId ?? '',
  );
  const [title, setTitle] = useState(campaign?.title ?? '');
  const [details, setDetails] = useState(campaign?.details ?? '');
  const [criteria, setCriteria] = useState(campaign?.criteria ?? '');
  const [structureType, setStructureType] = useState<CampaignStructureType | ''>(campaign?.structureType ?? '');
  const [structureValue, setStructureValue] = useState(
    campaign?.structureValue != null ? String(campaign.structureValue) : '',
  );
  const [startsOn, setStartsOn] = useState(campaign?.startsOn ?? '');
  const [endsOn, setEndsOn] = useState(campaign?.endsOn ?? '');
  const [customerFacing, setCustomerFacing] = useState<CampaignCustomerFacing>(
    campaign?.customerFacing ?? (source === 'candid_promo' ? 'yes' : 'review'),
  );
  const [ctaLabel, setCtaLabel] = useState(campaign?.ctaLabel ?? '');
  const [showInSlider, setShowInSlider] = useState(campaign?.showInSlider ?? false);
  const [slideOrder, setSlideOrder] = useState(String(campaign?.slideOrder ?? 0));
  const [bannerUrl, setBannerUrl] = useState(campaign?.bannerImageUrl ?? '');
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [pendingPreview, setPendingPreview] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!pendingFile) {
      setPendingPreview(null);
      return;
    }
    const url = URL.createObjectURL(pendingFile);
    setPendingPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [pendingFile]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !busy) onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [busy, onClose]);

  const providerOptions = useMemo(
    () =>
      providers
        .filter((p) => p.dbId != null)
        .map((p) => ({ dbId: p.dbId as number, label: p.displayName?.trim() || p.name }))
        .sort((a, b) => a.label.localeCompare(b.label)),
    [providers],
  );
  const provider = providers.find((p) => p.dbId === providerDbId);

  const previewImage = pendingPreview ?? (bannerUrl || undefined);

  const buildInput = () => ({
    providerDbId: providerDbId === '' ? undefined : providerDbId,
    source,
    title,
    details,
    criteria,
    structureType: structureType || null,
    structureValue: structureValue.trim() === '' ? null : Number(structureValue),
    startsOn: startsOn || null,
    endsOn: endsOn || null,
    customerFacing,
    ctaLabel,
    showInSlider,
    slideOrder: Number(slideOrder) || 0,
  });

  const save = async () => {
    setError(null);
    if (providerDbId === '') {
      setError('Choose a supplier.');
      return;
    }
    if (!title.trim()) {
      setError('Headline is required.');
      return;
    }
    setBusy('save');
    try {
      let saved = isNew
        ? await createCampaign(buildInput())
        : await updateCampaign(campaign.id, buildInput());
      if (pendingFile) saved = await uploadCampaignBanner(saved.id, pendingFile);
      onSaved(saved);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setBusy(null);
    }
  };

  const removeBanner = async () => {
    if (pendingFile) {
      setPendingFile(null);
      if (fileRef.current) fileRef.current.value = '';
      return;
    }
    if (!campaign) return;
    setBusy('banner');
    setError(null);
    try {
      const saved = await removeCampaignBanner(campaign.id);
      setBannerUrl('');
      onSaved(saved);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not remove image');
    } finally {
      setBusy(null);
    }
  };

  const toggleEnded = async () => {
    if (!campaign) return;
    setBusy('end');
    setError(null);
    try {
      onSaved(await updateCampaign(campaign.id, { action: campaign.endedEarlyAt ? 'reopen' : 'end_early' }));
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Update failed');
    } finally {
      setBusy(null);
    }
  };

  const remove = async () => {
    if (!campaign) return;
    if (!window.confirm(`Delete “${campaign.title}”? This can’t be undone.`)) return;
    setBusy('delete');
    setError(null);
    try {
      await deleteCampaign(campaign.id);
      onDeleted(campaign.id);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Delete failed');
      setBusy(null);
    }
  };

  const status = campaign ? campaignStatus(campaign) : null;

  return (
    <div
      role="dialog"
      aria-modal
      aria-label={isNew ? 'New promo or SPIFF' : 'Edit promo or SPIFF'}
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 80,
        background: 'rgba(15,23,42,0.35)',
        display: 'flex',
        justifyContent: 'flex-end',
      }}
      onClick={() => {
        if (!busy) onClose();
      }}
    >
      <div
        style={{
          width: 'min(620px, 100%)',
          height: '100%',
          background: 'var(--page-bg-solid)',
          borderLeft: '1px solid var(--gray-border)',
          padding: 24,
          overflow: 'auto',
          boxSizing: 'border-box',
        }}
        onClick={(e) => e.stopPropagation()}
      >
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
          <div>
            <h3 style={{ margin: 0, fontSize: 18 }}>
              {isNew ? `New ${source === 'candid_promo' ? 'Candid promo' : 'supplier SPIFF'}` : 'Edit promo / SPIFF'}
            </h3>
            {campaign && status ? (
              <div style={{ marginTop: 6, display: 'flex', gap: 8, alignItems: 'center' }}>
                <span className={`campaign-source-badge campaign-source-badge--${campaign.source}`}>
                  {CAMPAIGN_SOURCE_LABEL[campaign.source]}
                </span>
                <span className={`campaign-status campaign-status--${status}`}>{CAMPAIGN_STATUS_LABEL[status]}</span>
              </div>
            ) : null}
          </div>
          <button type="button" className="btn-secondary" onClick={onClose} disabled={Boolean(busy)}>
            Close
          </button>
        </div>

        <div style={{ margin: '18px 0 16px' }}>
          <div style={labelStyle}>Slide preview</div>
          <PromoSlide
            slide={{
              supplierName: provider ? provider.displayName?.trim() || provider.name : 'Supplier',
              supplierWebsite: provider?.website,
              supplierLogoUrl: provider?.logoUrl,
              title,
              details,
              endsOn: endsOn || undefined,
              ctaLabel,
              bannerImageUrl: previewImage,
            }}
          />
          <p style={{ margin: '6px 0 0', fontSize: 11, color: 'var(--gray)' }}>
            What members see in the Find Solutions slider. The supplier logo always shows; the image is optional.
          </p>
        </div>

        {isNew ? (
          <div style={sectionStyle}>
            <div style={labelStyle}>Source</div>
            <div className="comm-tabs" style={{ marginBottom: 0 }}>
              {(['candid_promo', 'supplier_spiff'] as CampaignSource[]).map((s) => (
                <button
                  key={s}
                  type="button"
                  className={`comm-tab${source === s ? ' active' : ''}`}
                  onClick={() => {
                    setSource(s);
                    setCustomerFacing(s === 'candid_promo' ? 'yes' : 'review');
                  }}
                >
                  {CAMPAIGN_SOURCE_LABEL[s]}
                </button>
              ))}
            </div>
          </div>
        ) : null}

        <div style={sectionStyle}>
          <label style={labelStyle}>Supplier</label>
          <SearchableSelect
            value={providerDbId === '' ? '' : String(providerDbId)}
            options={providerOptions.map((p) => ({ value: String(p.dbId), label: p.label }))}
            onChange={(v) => setProviderDbId(v ? Number(v) : '')}
            placeholder="Search suppliers…"
            emptyLabel="Choose a supplier…"
            inputStyle={inputStyle}
            aria-label="Supplier"
          />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle} htmlFor="campaign-title">Headline</label>
          <input
            id="campaign-title"
            value={title}
            maxLength={CAMPAIGN_TITLE_MAX}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="e.g. Free installation on 36-month fiber"
            style={inputStyle}
          />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle} htmlFor="campaign-details">Sub copy (optional)</label>
          <textarea
            id="campaign-details"
            value={details}
            maxLength={CAMPAIGN_DETAILS_MAX}
            onChange={(e) => setDetails(e.target.value)}
            rows={2}
            placeholder="Term, locations, fine print…"
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        <div style={sectionStyle}>
          <label style={labelStyle} htmlFor="campaign-criteria">Customer criteria (optional)</label>
          <textarea
            id="campaign-criteria"
            value={criteria}
            maxLength={CAMPAIGN_CRITERIA_MAX}
            onChange={(e) => setCriteria(e.target.value)}
            rows={2}
            placeholder="Requires a 36-month contract. Minimum $1,000 monthly charge."
            style={{ ...inputStyle, resize: 'vertical' }}
          />
        </div>

        {campaign?.internal ? (
          <details style={{ ...sectionStyle, fontSize: 12, lineHeight: 1.5 }}>
            <summary style={{ cursor: 'pointer', fontWeight: 600 }}>Supplier details (admin only)</summary>
            <div style={{ display: 'grid', gap: 6, marginTop: 8, whiteSpace: 'pre-wrap' }}>
              {[
                ['Program', campaign.internal.sourceProgram],
                ['Category', campaign.internal.category],
                ['Supplier name', campaign.internal.name],
                ['Payout', campaign.internal.payoutRaw],
                [
                  'Minimums',
                  [
                    campaign.internal.minTermMonths ? `${campaign.internal.minTermMonths}-month term` : null,
                    campaign.internal.minMonthlyCharge
                      ? `$${campaign.internal.minMonthlyCharge.toLocaleString()}/mo`
                      : null,
                  ]
                    .filter(Boolean)
                    .join(' · ') || undefined,
                ],
                ['Paid', campaign.internal.payoutTimeline],
                ['Description', campaign.internal.description],
                ['Terms', campaign.internal.terms],
                ['Notes', campaign.internal.adminNotes],
                ['Source', campaign.internal.externalLink],
              ]
                .filter(([, v]) => v)
                .map(([k, v]) => (
                  <div key={k}>
                    <strong>{k}:</strong> {v}
                  </div>
                ))}
            </div>
          </details>
        ) : null}

        <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="campaign-structure">Structure</label>
            <select
              id="campaign-structure"
              value={structureType}
              onChange={(e) => setStructureType(e.target.value as CampaignStructureType | '')}
              style={inputStyle}
            >
              <option value="">Display only (no payout change)</option>
              <option value="percent">% increase</option>
              <option value="dollar">$ amount</option>
              <option value="multiplier">Multiplier of MRC</option>
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="campaign-structure-value">Value</label>
            <input
              id="campaign-structure-value"
              type="number"
              min={0}
              step="0.01"
              value={structureValue}
              disabled={!structureType}
              onChange={(e) => setStructureValue(e.target.value)}
              placeholder={structureType === 'dollar' ? '200' : structureType === 'multiplier' ? '1.5' : '0.5'}
              style={inputStyle}
            />
          </div>
        </div>

        <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="campaign-starts">Starts (optional)</label>
            <input id="campaign-starts" type="date" value={startsOn} onChange={(e) => setStartsOn(e.target.value)} style={inputStyle} />
          </div>
          <div>
            <label style={labelStyle} htmlFor="campaign-ends">Ends (auto-ends after this date)</label>
            <input id="campaign-ends" type="date" value={endsOn} onChange={(e) => setEndsOn(e.target.value)} style={inputStyle} />
          </div>
        </div>

        <div style={{ ...sectionStyle, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <div>
            <label style={labelStyle} htmlFor="campaign-facing">Customer-facing</label>
            <select
              id="campaign-facing"
              value={customerFacing}
              onChange={(e) => setCustomerFacing(e.target.value as CampaignCustomerFacing)}
              style={inputStyle}
            >
              <option value="yes">Yes — show to members</option>
              <option value="review">Review — hidden until approved</option>
              <option value="no">No — internal only</option>
            </select>
          </div>
          <div>
            <label style={labelStyle} htmlFor="campaign-cta">Button label</label>
            <input
              id="campaign-cta"
              value={ctaLabel}
              maxLength={CAMPAIGN_CTA_MAX}
              onChange={(e) => setCtaLabel(e.target.value)}
              placeholder={DEFAULT_CAMPAIGN_CTA}
              style={inputStyle}
            />
          </div>
        </div>

        <div
          style={{
            ...sectionStyle,
            padding: 14,
            border: '1px solid var(--gray-border)',
            borderRadius: 10,
            background: 'var(--surface-muted)',
          }}
        >
          <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 4 }}>Find Solutions slider</div>
          <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 13, marginBottom: 10 }}>
            <input type="checkbox" checked={showInSlider} onChange={(e) => setShowInSlider(e.target.checked)} />
            Show in Find Solutions slider
          </label>
          <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr', gap: 12, alignItems: 'end' }}>
            <div>
              <label style={labelStyle} htmlFor="campaign-order">Slide order</label>
              <input
                id="campaign-order"
                type="number"
                min={0}
                step={1}
                value={slideOrder}
                onChange={(e) => setSlideOrder(e.target.value)}
                style={inputStyle}
              />
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray)', paddingBottom: 10 }}>
              Lower numbers show first. Only active, customer-facing promos appear.
            </div>
          </div>

          <div style={{ marginTop: 12 }}>
            <div style={labelStyle}>Banner image (optional)</div>
            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <input
                ref={fileRef}
                type="file"
                accept={BANNER_ACCEPT}
                style={{ display: 'none' }}
                onChange={(e) => setPendingFile(e.target.files?.[0] ?? null)}
              />
              <button
                type="button"
                className="btn-secondary"
                style={{ fontSize: 12, padding: '6px 12px' }}
                onClick={() => fileRef.current?.click()}
                disabled={Boolean(busy)}
              >
                {previewImage ? 'Replace image' : 'Upload image'}
              </button>
              {previewImage ? (
                <button
                  type="button"
                  className="btn-secondary"
                  style={{ fontSize: 12, padding: '6px 12px' }}
                  onClick={() => void removeBanner()}
                  disabled={Boolean(busy)}
                >
                  {busy === 'banner' ? 'Removing…' : 'Remove image'}
                </button>
              ) : null}
              <span style={{ fontSize: 11, color: 'var(--gray)' }}>
                {pendingFile ? `${pendingFile.name} — uploads on save` : 'Recommended 1600×500 · JPG, PNG, or WebP · up to 5MB'}
              </span>
            </div>
          </div>
        </div>

        {error ? (
          <div
            role="alert"
            style={{
              marginBottom: 12,
              padding: '10px 12px',
              borderRadius: 8,
              background: 'var(--amber-light)',
              color: 'var(--amber)',
              fontSize: 13,
            }}
          >
            {error}
          </div>
        ) : null}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', justifyContent: 'space-between' }}>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-primary" onClick={() => void save()} disabled={Boolean(busy)}>
              {busy === 'save' ? 'Saving…' : isNew ? 'Create' : 'Save changes'}
            </button>
            <button type="button" className="btn-secondary" onClick={onClose} disabled={Boolean(busy)}>
              Cancel
            </button>
          </div>
          {campaign ? (
            <div style={{ display: 'flex', gap: 8 }}>
              <button type="button" className="btn-secondary" onClick={() => void toggleEnded()} disabled={Boolean(busy)}>
                {busy === 'end' ? 'Updating…' : campaign.endedEarlyAt ? 'Reopen' : 'End early'}
              </button>
              <button
                type="button"
                className="btn-secondary"
                style={{ color: 'var(--red)' }}
                onClick={() => void remove()}
                disabled={Boolean(busy)}
              >
                {busy === 'delete' ? 'Deleting…' : 'Delete'}
              </button>
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
