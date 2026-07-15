'use client';

import { useEffect, useState } from 'react';
import {
  SUPPLIER_GUIDE_CATEGORY_LABELS,
  type SupplierGuide,
} from '@/lib/supplier-guides-types';
import { fetchPortalSupplierGuides } from '@/lib/supplier-guides';
import { fetchPortalSupplierSources } from '@/lib/supplier-sources';
import type { SupplierSource } from '@/lib/supplier-sources-types';
import { RichTextContent } from '@/components/RichTextContent';
import { AppIcon } from '@/components/AppIcon';

type ProviderBundle = {
  guides: SupplierGuide[];
  sources: SupplierSource[];
};

export function MemberSupplierGuidesPanel({ vendors }: { vendors: string[] }) {
  const [guides, setGuides] = useState<SupplierGuide[]>([]);
  const [sources, setSources] = useState<SupplierSource[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const [guideData, sourceData] = await Promise.all([
        fetchPortalSupplierGuides(vendors),
        fetchPortalSupplierSources(vendors),
      ]);
      if (!cancelled) {
        setGuides(guideData);
        setSources(sourceData);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendors.join('|')]);

  if (loading) return null;
  if (!guides.length && !sources.length) return null;

  const byProvider = [...guides, ...sources].reduce<Record<string, ProviderBundle>>((acc, item) => {
    const key = item.providerName || 'Supplier';
    const bucket = acc[key] ?? { guides: [], sources: [] };
    if ('content' in item) bucket.guides.push(item);
    else bucket.sources.push(item);
    acc[key] = bucket;
    return acc;
  }, {});

  return (
    <div style={{ marginTop: 28 }}>
      <div className="services-section-title">Supplier resources</div>
      <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
        Guides and documentation from your technology vendors.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {Object.entries(byProvider).map(([providerName, bundle]) => (
          <div key={providerName} className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: 14 }}>{providerName}</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {bundle.sources.map((s) => (
                <div
                  key={`src-${s.id}`}
                  style={{ borderTop: '1px solid var(--gray-border)', paddingTop: 12, marginTop: 12 }}
                >
                  <a
                    href={s.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{
                      display: 'flex',
                      alignItems: 'flex-start',
                      gap: 8,
                      textDecoration: 'none',
                      color: 'inherit',
                    }}
                  >
                    <AppIcon name="link" size={12} />
                    <span style={{ minWidth: 0 }}>
                      <div style={{ fontWeight: 600, fontSize: 13, color: 'var(--accent-cool, #4f46e5)' }}>
                        {s.title}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                        {s.sourceType || 'Documentation'} · Opens in new tab
                      </div>
                    </span>
                  </a>
                </div>
              ))}
              {bundle.guides.map((g) => (
                <div
                  key={`guide-${g.id}`}
                  style={{ borderTop: '1px solid var(--gray-border)', paddingTop: 12, marginTop: 12 }}
                >
                  <button
                    type="button"
                    onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
                    style={{
                      width: '100%',
                      textAlign: 'left',
                      background: 'none',
                      border: 'none',
                      cursor: 'pointer',
                      padding: 0,
                    }}
                  >
                    <div style={{ fontWeight: 600, fontSize: 13 }}>{g.title}</div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                      {SUPPLIER_GUIDE_CATEGORY_LABELS[g.category]}
                    </div>
                  </button>
                  {expandedId === g.id && (
                    <div style={{ fontSize: 13, lineHeight: 1.55, marginTop: 10, color: 'var(--gray-dark)' }}>
                      <RichTextContent content={g.content} />
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
