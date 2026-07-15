'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { MarketingAssetThumbnail } from '@/components/admin/MarketingAssetThumbnail';
import { listMarketingAssets } from '@/lib/marketing-hub';
import {
  MARKETING_CATEGORY_FILTER_OPTIONS,
  MARKETING_CATEGORY_LABELS,
  type MarketingAsset,
  type MarketingAssetCategory,
} from '@/lib/marketing-hub-types';

export function MarketingAssetPickerModal({
  onSelect,
  onClose,
}: {
  onSelect: (asset: MarketingAsset) => void;
  onClose: () => void;
}) {
  const [assets, setAssets] = useState<MarketingAsset[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<MarketingAssetCategory | 'all'>('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const list = await listMarketingAssets();
        if (!cancelled) setAssets(list);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return assets.filter((asset) => {
      if (filter !== 'all' && asset.category !== filter) return false;
      if (!q) return true;
      return [asset.title, asset.filename, asset.description ?? '', asset.tags.join(' ')].join(' ').toLowerCase().includes(q);
    });
  }, [assets, filter, search]);

  return (
    <div className="modal-overlay open">
      <div className="modal-box assist-modal" role="dialog" aria-label="Pick marketing asset" style={{ maxWidth: 720 }}>
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="image" size={14} /> Marketing Hub
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <div style={{ display: 'flex', gap: 12, marginBottom: 12 }}>
            <input
              type="search"
              placeholder="Search assets…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ flex: 1 }}
            />
            <select value={filter} onChange={(e) => setFilter(e.target.value as MarketingAssetCategory | 'all')}>
              {MARKETING_CATEGORY_FILTER_OPTIONS.map((opt) => (
                <option key={opt.id} value={opt.id}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>
          {loading ? (
            <p className="text-muted">Loading assets…</p>
          ) : filtered.length === 0 ? (
            <p className="text-muted">No marketing assets found.</p>
          ) : (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(140px, 1fr))', gap: 10, maxHeight: 360, overflow: 'auto' }}>
              {filtered.map((asset) => (
                <button
                  key={asset.id}
                  type="button"
                  className="card"
                  onClick={() => {
                    onSelect(asset);
                    onClose();
                  }}
                  style={{ padding: 0, overflow: 'hidden', textAlign: 'left', cursor: 'pointer' }}
                >
                  <div style={{ height: 80, overflow: 'hidden', background: 'var(--gray-pale)', borderBottom: '1px solid var(--gray-border)' }}>
                    <MarketingAssetThumbnail asset={asset} />
                  </div>
                  <div style={{ padding: '8px 10px' }}>
                    <div style={{ fontSize: 12, fontWeight: 600 }}>{asset.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray-mid)' }}>{MARKETING_CATEGORY_LABELS[asset.category]}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
