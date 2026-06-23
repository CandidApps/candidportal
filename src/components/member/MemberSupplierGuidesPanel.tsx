'use client';

import { useEffect, useState } from 'react';
import {
  SUPPLIER_GUIDE_CATEGORY_LABELS,
  type SupplierGuide,
} from '@/lib/supplier-guides-types';
import { fetchPortalSupplierGuides } from '@/lib/supplier-guides';
import { RichTextContent } from '@/components/RichTextContent';

export function MemberSupplierGuidesPanel({ vendors }: { vendors: string[] }) {
  const [guides, setGuides] = useState<SupplierGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedId, setExpandedId] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoading(true);
      const data = await fetchPortalSupplierGuides(vendors);
      if (!cancelled) {
        setGuides(data);
        setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [vendors.join('|')]);

  if (loading) return null;
  if (!guides.length) return null;

  const byProvider = guides.reduce<Record<string, SupplierGuide[]>>((acc, g) => {
    const list = acc[g.providerName] ?? [];
    list.push(g);
    acc[g.providerName] = list;
    return acc;
  }, {});

  return (
    <div style={{ marginTop: 28 }}>
      <div className="services-section-title">Supplier resources</div>
      <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 14 }}>
        Guides and documentation from your technology vendors.
      </p>
      <div style={{ display: 'grid', gap: 12 }}>
        {Object.entries(byProvider).map(([providerName, list]) => (
          <div key={providerName} className="card">
            <div className="card-header">
              <div className="card-title" style={{ fontSize: 14 }}>{providerName}</div>
            </div>
            <div className="card-body" style={{ paddingTop: 0 }}>
              {list.map((g) => (
                <div key={g.id} style={{ borderTop: '1px solid var(--gray-border)', paddingTop: 12, marginTop: 12 }}>
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
