'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  convertPdfToEmailTemplate,
  deleteMarketingAsset,
  launchMarketingAssetEmail,
  listMarketingAssets,
  marketingAssetDownloadUrl,
  selectMarketingAssetForUse,
  uploadMarketingAsset,
} from '@/lib/marketing-hub';
import { MarketingAssetThumbnail } from '@/components/admin/MarketingAssetThumbnail';
import {
  categorySupportsBrand,
  guessMarketingBrand,
  guessMarketingCategory,
  isMarketingPdfAsset,
  MARKETING_ASSET_CATEGORIES,
  MARKETING_BRANDS,
  MARKETING_BRAND_LABELS,
  MARKETING_CATEGORY_FILTER_OPTIONS,
  MARKETING_CATEGORY_LABELS,
  marketingAssetTitleFromFilename,
  type MarketingAsset,
  type MarketingAssetCategory,
  type MarketingBrand,
} from '@/lib/marketing-hub-types';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--gray-dark)',
  outline: 'none',
  boxSizing: 'border-box',
};

function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function AssetPreview({ asset }: { asset: MarketingAsset }) {
  return (
    <div
      style={{
        height: 360,
        border: '1px solid var(--gray-border)',
        borderRadius: 8,
        overflow: 'hidden',
        background: '#fff',
      }}
    >
      <MarketingAssetThumbnail asset={asset} label={asset.title} fit="contain" />
    </div>
  );
}

/** Admin Content Marketing Hub — centralized marketing assets with upload, filter, preview, and actions. */
export function AdminMarketingHubView({ mode = 'admin' }: { mode?: 'admin' | 'agent' }) {
  const canManage = mode === 'admin';
  const fileRef = useRef<HTMLInputElement>(null);
  const [assets, setAssets] = useState<MarketingAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<MarketingAssetCategory | 'all'>('all');
  const [brandFilter, setBrandFilter] = useState<MarketingBrand | 'all'>('all');
  const [logosOpen, setLogosOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState<MarketingAssetCategory>('logo');
  const [brand, setBrand] = useState<MarketingBrand>('candid');
  const [tags, setTags] = useState('');
  const [previewAsset, setPreviewAsset] = useState<MarketingAsset | null>(null);
  const [actionMsg, setActionMsg] = useState('');
  const [convertingId, setConvertingId] = useState<string | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const list = await listMarketingAssets();
      setAssets(list);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load assets');
      setAssets([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  const filteredAssets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (filter !== 'all' && asset.category !== filter) return false;
      if (filter === 'logo' && brandFilter !== 'all' && asset.brand !== brandFilter) return false;
      if (!q) return true;
      const hay = [
        asset.title,
        asset.filename,
        asset.description ?? '',
        asset.tags.join(' '),
        MARKETING_CATEGORY_LABELS[asset.category],
        asset.brand ? MARKETING_BRAND_LABELS[asset.brand] : '',
      ]
        .join(' ')
        .toLowerCase();
      return hay.includes(q);
    });
  }, [assets, filter, brandFilter, search]);

  const logoBrandCounts = useMemo(() => {
    const logos = assets.filter((a) => a.category === 'logo');
    return {
      all: logos.length,
      candid: logos.filter((a) => a.brand === 'candid').length,
      candid_pay: logos.filter((a) => a.brand === 'candid_pay').length,
      candid_iq: logos.filter((a) => a.brand === 'candid_iq').length,
    };
  }, [assets]);

  const resetUploadForm = () => {
    setSelectedFile(null);
    setTitle('');
    setDescription('');
    setCategory('logo');
    setBrand('candid');
    setTags('');
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFilePick = (file: File | null) => {
    setSelectedFile(file);
    if (file) {
      const guessed = guessMarketingCategory(file.name, file.type);
      setCategory(guessed);
      const guessedBrand = guessMarketingBrand(file.name);
      if (guessedBrand) setBrand(guessedBrand);
      if (!title.trim()) setTitle(marketingAssetTitleFromFilename(file.name));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Choose a file to upload.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const asset = await uploadMarketingAsset({
        file: selectedFile,
        title: title.trim() || undefined,
        description: description.trim() || undefined,
        category,
        brand: categorySupportsBrand(category) ? brand : undefined,
        tags: tags
          .split(',')
          .map((t) => t.trim())
          .filter(Boolean),
      });
      setAssets((prev) => [asset, ...prev]);
      setUploadOpen(false);
      resetUploadForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (asset: MarketingAsset) => {
    if (!window.confirm(`Delete "${asset.title}"?`)) return;
    setAssets((prev) => prev.filter((a) => a.id !== asset.id));
    if (previewAsset?.id === asset.id) setPreviewAsset(null);
    try {
      await deleteMarketingAsset(asset.id);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
      void reload();
    }
  };

  const handleSendEmail = (asset: MarketingAsset) => {
    void launchMarketingAssetEmail(asset).then(() => {
      setActionMsg('Opened in-app email compose with asset attached.');
    });
  };

  const handleConvertPdf = async (asset: MarketingAsset) => {
    setConvertingId(asset.id);
    setError('');
    try {
      const converted = await convertPdfToEmailTemplate(asset.id);
      setAssets((prev) => [converted, ...prev]);
      setPreviewAsset(converted);
      setActionMsg(`Created email template "${converted.title}" from PDF.`);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Conversion failed');
    } finally {
      setConvertingId(null);
    }
  };

  const handleUseElsewhere = (asset: MarketingAsset) => {
    selectMarketingAssetForUse(asset);
    void navigator.clipboard.writeText(asset.id).catch(() => {});
    setActionMsg(`Asset "${asset.title}" is ready to use elsewhere (ID copied). Team Message Center and other tools listen for candid-marketing-asset-selected.`);
  };

  return (
    <div className="greeting" style={{ display: 'flex', flexDirection: 'column', gap: 12, marginBottom: 0 }}>
      <div style={{ marginBottom: 4 }}>
        <h2 style={{ margin: 0, fontSize: 22, fontFamily: 'var(--font-display)', fontWeight: 700, letterSpacing: '-0.03em' }}>
          Content Marketing Hub
        </h2>
        <p style={{ margin: '4px 0 0', fontSize: 13, color: 'var(--gray-mid)', maxWidth: 560 }}>
          Logos, PDFs, email templates, and marketing content — preview, download, and share from one place.
        </p>
      </div>

      {error && (
        <div className="card" style={{ borderColor: 'var(--red-light)', padding: '10px 14px', fontSize: 13, color: 'var(--red-dark)' }}>
          {error}
        </div>
      )}
      {actionMsg && (
        <div className="card" style={{ padding: '10px 14px', fontSize: 13, color: 'var(--gray-mid)' }}>
          {actionMsg}
        </div>
      )}

      <div className="marketing-hub-layout">
        <div className="marketing-hub-main">
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <input
              type="search"
              placeholder="Search assets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ ...inputStyle, flex: 1, marginBottom: 0 }}
            />
            {canManage && (
              <button
                type="button"
                className="btn-primary"
                style={{
                  flex: 'none',
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 6,
                  padding: '10px 16px',
                  fontSize: 13,
                  whiteSpace: 'nowrap',
                  alignSelf: 'stretch',
                }}
                onClick={() => {
                  setUploadOpen(true);
                  setError('');
                }}
              >
                <AppIcon name="add" size={14} /> Upload asset
              </button>
            )}
          </div>

          {loading ? (
            <div className="card card-body" style={{ color: 'var(--gray-mid)', fontSize: 13 }}>Loading assets…</div>
          ) : filteredAssets.length === 0 ? (
            <div className="card card-body" style={{ color: 'var(--gray-mid)', fontSize: 13 }}>
              {assets.length === 0
                ? 'No assets yet. Upload logos and branding files to get started.'
                : 'No assets match your filters.'}
            </div>
          ) : (
            <div
              style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))',
                gap: 12,
              }}
            >
              {filteredAssets.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="card"
                  onClick={() => {
                    setPreviewAsset(asset);
                    setActionMsg('');
                  }}
                  style={{
                    padding: 0,
                    overflow: 'hidden',
                    textAlign: 'left',
                    cursor: 'pointer',
                    border: previewAsset?.id === asset.id ? '2px solid var(--red-light)' : undefined,
                  }}
                >
                  <div
                    style={{
                      height: 140,
                      background: 'var(--gray-pale)',
                      borderBottom: '1px solid var(--gray-border)',
                      overflow: 'hidden',
                    }}
                  >
                    <MarketingAssetThumbnail asset={asset} />
                  </div>
                  <div style={{ padding: '10px 12px' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)', lineHeight: 1.3 }}>
                      {asset.title}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray-mid)', marginTop: 4 }}>
                      {MARKETING_CATEGORY_LABELS[asset.category]}
                      {asset.brand ? ` · ${MARKETING_BRAND_LABELS[asset.brand]}` : ''}
                      {' · '}
                      {asset.fileSizeLabel}
                    </div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>

        <aside className="card marketing-hub-filters">
          <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: 'var(--gray-mid)', marginBottom: 10 }}>
            Filter by type
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
            {MARKETING_CATEGORY_FILTER_OPTIONS.map((opt) => (
              <div key={opt.id}>
                {opt.id === 'logo' ? (
                  <>
                    <div
                      style={{
                        display: 'flex',
                        alignItems: 'center',
                        borderRadius: 6,
                        background: filter === 'logo' ? 'var(--red-pale)' : 'transparent',
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => {
                          setFilter('logo');
                          setLogosOpen(true);
                        }}
                        style={{
                          flex: 1,
                          textAlign: 'left',
                          border: 'none',
                          borderRadius: 6,
                          padding: '8px 10px',
                          fontSize: 13,
                          cursor: 'pointer',
                          background: 'transparent',
                          color: filter === 'logo' ? 'var(--red-dark)' : 'var(--gray-dark)',
                          fontWeight: filter === 'logo' ? 600 : 400,
                        }}
                      >
                        {opt.label}
                        <span style={{ float: 'right', color: 'var(--gray-mid)', fontWeight: 400, marginRight: 4 }}>
                          {logoBrandCounts.all}
                        </span>
                      </button>
                      <button
                        type="button"
                        aria-label={logosOpen ? 'Collapse logos' : 'Expand logos'}
                        aria-expanded={logosOpen}
                        onClick={() => {
                          setLogosOpen((open) => {
                            const next = !open;
                            if (next) setFilter('logo');
                            return next;
                          });
                        }}
                        style={{
                          border: 'none',
                          background: 'transparent',
                          cursor: 'pointer',
                          padding: '8px 10px',
                          color: filter === 'logo' ? 'var(--red-dark)' : 'var(--gray-mid)',
                          fontSize: 11,
                          lineHeight: 1,
                          transform: logosOpen ? 'rotate(180deg)' : 'none',
                          transition: 'transform 0.15s ease',
                        }}
                      >
                        ▾
                      </button>
                    </div>
                    {logosOpen && (
                      <div style={{ display: 'flex', flexDirection: 'column', gap: 2, margin: '2px 0 6px 10px', paddingLeft: 8, borderLeft: '2px solid var(--gray-border)' }}>
                        {([
                          { id: 'all' as const, label: 'All logos', count: logoBrandCounts.all },
                          ...MARKETING_BRANDS.map((b) => ({
                            id: b,
                            label: MARKETING_BRAND_LABELS[b],
                            count: logoBrandCounts[b],
                          })),
                        ]).map((sub) => (
                          <button
                            key={sub.id}
                            type="button"
                            onClick={() => {
                              setFilter('logo');
                              setBrandFilter(sub.id);
                            }}
                            style={{
                              textAlign: 'left',
                              border: 'none',
                              borderRadius: 5,
                              padding: '6px 8px',
                              fontSize: 12,
                              cursor: 'pointer',
                              background: filter === 'logo' && brandFilter === sub.id ? 'var(--red-pale)' : 'transparent',
                              color: filter === 'logo' && brandFilter === sub.id ? 'var(--red-dark)' : 'var(--gray-mid)',
                              fontWeight: filter === 'logo' && brandFilter === sub.id ? 600 : 400,
                            }}
                          >
                            {sub.label}
                            <span style={{ float: 'right', opacity: 0.8 }}>{sub.count}</span>
                          </button>
                        ))}
                      </div>
                    )}
                  </>
                ) : (
                  <button
                    type="button"
                    onClick={() => {
                      setFilter(opt.id);
                      setBrandFilter('all');
                      if (opt.id !== 'all') setLogosOpen(false);
                    }}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      border: 'none',
                      borderRadius: 6,
                      padding: '8px 10px',
                      fontSize: 13,
                      cursor: 'pointer',
                      background: filter === opt.id ? 'var(--red-pale)' : 'transparent',
                      color: filter === opt.id ? 'var(--red-dark)' : 'var(--gray-dark)',
                      fontWeight: filter === opt.id ? 600 : 400,
                    }}
                  >
                    {opt.label}
                    {opt.id !== 'all' && (
                      <span style={{ float: 'right', color: 'var(--gray-mid)', fontWeight: 400 }}>
                        {assets.filter((a) => a.category === opt.id).length}
                      </span>
                    )}
                  </button>
                )}
              </div>
            ))}
          </div>
        </aside>
      </div>

      {uploadOpen && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => {
            if (!uploading) {
              setUploadOpen(false);
              resetUploadForm();
            }
          }}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 520, padding: 20 }}
            onClick={(e) => e.stopPropagation()}
          >
            <h3 style={{ margin: '0 0 14px', fontSize: 16 }}>Upload marketing asset</h3>
            <div
              onDragOver={(e) => {
                e.preventDefault();
                setDragOver(true);
              }}
              onDragLeave={() => setDragOver(false)}
              onDrop={(e) => {
                e.preventDefault();
                setDragOver(false);
                handleFilePick(e.dataTransfer.files?.[0] ?? null);
              }}
              onClick={() => fileRef.current?.click()}
              style={{
                border: `2px dashed ${dragOver ? 'var(--red-light)' : 'var(--gray-border)'}`,
                borderRadius: 8,
                padding: 24,
                textAlign: 'center',
                cursor: 'pointer',
                marginBottom: 14,
                background: dragOver ? 'var(--red-pale)' : 'var(--gray-pale)',
              }}
            >
              <AppIcon name="paperclip" size={24} />
              <p style={{ margin: '8px 0 0', fontSize: 13, color: 'var(--gray-mid)' }}>
                {selectedFile ? selectedFile.name : 'Drop a file here or click to browse'}
              </p>
              {selectedFile ? (
                <div
                  style={{
                    marginTop: 14,
                    height: 160,
                    borderRadius: 8,
                    overflow: 'hidden',
                    border: '1px solid var(--gray-border)',
                    background: '#fff',
                  }}
                  onClick={(e) => e.stopPropagation()}
                >
                  <MarketingAssetThumbnail file={selectedFile} label={selectedFile.name} />
                </div>
              ) : null}
              <input
                ref={fileRef}
                type="file"
                hidden
                accept=".png,.jpg,.jpeg,.webp,.gif,.svg,.pdf,.html,.htm,.doc,.docx,.txt"
                onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
              />
            </div>

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Title</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)} style={{ ...inputStyle, marginBottom: 10 }} />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Category</label>
            <select
              value={category}
              onChange={(e) => setCategory(e.target.value as MarketingAssetCategory)}
              style={{ ...inputStyle, marginBottom: 10 }}
            >
              {MARKETING_ASSET_CATEGORIES.map((cat) => (
                <option key={cat} value={cat}>
                  {MARKETING_CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>

            {categorySupportsBrand(category) && (
              <>
                <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Brand</label>
                <select
                  value={brand}
                  onChange={(e) => setBrand(e.target.value as MarketingBrand)}
                  style={{ ...inputStyle, marginBottom: 10 }}
                >
                  {MARKETING_BRANDS.map((b) => (
                    <option key={b} value={b}>
                      {MARKETING_BRAND_LABELS[b]}
                    </option>
                  ))}
                </select>
              </>
            )}

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Description (optional)</label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              rows={2}
              style={{ ...inputStyle, marginBottom: 10, resize: 'vertical' }}
            />

            <label style={{ display: 'block', fontSize: 12, fontWeight: 600, marginBottom: 4 }}>Tags (comma-separated)</label>
            <input value={tags} onChange={(e) => setTags(e.target.value)} style={{ ...inputStyle, marginBottom: 16 }} placeholder="brand, launch, q1" />

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
              <button
                type="button"
                className="btn"
                disabled={uploading}
                onClick={() => {
                  setUploadOpen(false);
                  resetUploadForm();
                }}
              >
                Cancel
              </button>
              <button type="button" className="btn btn-primary" disabled={uploading || !selectedFile} onClick={() => void handleUpload()}>
                {uploading ? 'Uploading…' : 'Upload'}
              </button>
            </div>
          </div>
        </div>
      )}

      {previewAsset && (
        <div
          role="dialog"
          aria-modal
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.45)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 1000,
            padding: 20,
          }}
          onClick={() => setPreviewAsset(null)}
        >
          <div
            className="card"
            style={{ width: '100%', maxWidth: 720, padding: 20, maxHeight: '90vh', overflow: 'auto' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, marginBottom: 14 }}>
              <div>
                <h3 style={{ margin: 0, fontSize: 17 }}>{previewAsset.title}</h3>
                <p style={{ margin: '4px 0 0', fontSize: 12, color: 'var(--gray-mid)' }}>
                  {MARKETING_CATEGORY_LABELS[previewAsset.category]}
                  {previewAsset.brand ? ` · ${MARKETING_BRAND_LABELS[previewAsset.brand]}` : ''}
                  {' · '}
                  {previewAsset.fileSizeLabel} · Uploaded {formatDisplayDate(previewAsset.createdAt)}
                </p>
              </div>
              <button type="button" className="btn" onClick={() => setPreviewAsset(null)} aria-label="Close">
                <AppIcon name="close" size={14} />
              </button>
            </div>

            <AssetPreview asset={previewAsset} />

            {previewAsset.description && (
              <p style={{ fontSize: 13, color: 'var(--gray-mid)', margin: '14px 0 0' }}>{previewAsset.description}</p>
            )}

            {previewAsset.tags.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 10 }}>
                {previewAsset.tags.map((tag) => (
                  <span
                    key={tag}
                    style={{
                      fontSize: 11,
                      padding: '3px 8px',
                      borderRadius: 999,
                      background: 'var(--gray-pale)',
                      color: 'var(--gray-mid)',
                    }}
                  >
                    {tag}
                  </span>
                ))}
              </div>
            )}

            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 16 }}>
              <a className="btn btn-primary" href={marketingAssetDownloadUrl(previewAsset.id)} download={previewAsset.filename}>
                <AppIcon name="download" size={14} /> Download
              </a>
              <button type="button" className="btn" onClick={() => handleSendEmail(previewAsset)}>
                <AppIcon name="email" size={14} /> Send via email
              </button>
              {canManage && isMarketingPdfAsset(previewAsset) && (
                <button
                  type="button"
                  className="btn"
                  disabled={convertingId === previewAsset.id}
                  onClick={() => void handleConvertPdf(previewAsset)}
                >
                  <AppIcon name="sparkles" size={14} />{' '}
                  {convertingId === previewAsset.id ? 'Converting…' : 'Convert to email template'}
                </button>
              )}
              <button type="button" className="btn" onClick={() => handleUseElsewhere(previewAsset)}>
                <AppIcon name="link" size={14} /> Use elsewhere
              </button>
              {canManage && (
                <button type="button" className="btn" onClick={() => void handleDelete(previewAsset)} style={{ marginLeft: 'auto', color: 'var(--red-dark)' }}>
                  Delete
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
