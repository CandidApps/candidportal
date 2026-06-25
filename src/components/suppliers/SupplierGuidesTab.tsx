'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  SUPPLIER_GUIDE_CATEGORY_LABELS,
  type SupplierGuide,
  type SupplierGuideCategory,
} from '@/lib/supplier-guides-types';
import {
  deleteSupplierGuide,
  fetchSupplierGuides,
  saveSupplierGuide,
} from '@/lib/supplier-guides';
import type { SupplierSource } from '@/lib/supplier-sources-types';
import { DEFAULT_SOURCE_TYPES } from '@/lib/supplier-sources-types';
import {
  deleteSupplierSource,
  fetchSupplierSources,
  saveSupplierSource,
} from '@/lib/supplier-sources';
import { isRichHtmlEmpty, richHtmlToPlainText } from '@/lib/rich-text';
import { RichTextEditor } from '@/components/RichTextEditor';
import { RichTextContent } from '@/components/RichTextContent';

const GUIDE_CATEGORIES = Object.keys(SUPPLIER_GUIDE_CATEGORY_LABELS) as SupplierGuideCategory[];

type CategoryFilter = 'all' | SupplierGuideCategory;

function guideMatchesSearch(guide: SupplierGuide, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  const plainContent = richHtmlToPlainText(guide.content).toLowerCase();
  return (
    guide.title.toLowerCase().includes(q) ||
    plainContent.includes(q) ||
    SUPPLIER_GUIDE_CATEGORY_LABELS[guide.category].toLowerCase().includes(q)
  );
}

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontSize: 13,
  boxSizing: 'border-box',
};

function GuideEditor({
  initial,
  defaultCategory,
  onSave,
  onCancel,
}: {
  initial?: Partial<SupplierGuide>;
  defaultCategory?: SupplierGuideCategory;
  onSave: (draft: {
    title: string;
    content: string;
    category: SupplierGuideCategory;
    visibleInPortal: boolean;
    sortOrder: number;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [content, setContent] = useState(initial?.content ?? '');
  const [category, setCategory] = useState<SupplierGuideCategory>(
    initial?.category ?? defaultCategory ?? 'guide',
  );
  const [visibleInPortal, setVisibleInPortal] = useState(initial?.visibleInPortal ?? false);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  return (
    <div style={{ padding: 16, background: 'var(--gray-light)', borderRadius: 8, marginTop: 12 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Category</label>
            <select value={category} onChange={(e) => setCategory(e.target.value as SupplierGuideCategory)} style={inputStyle}>
              {(Object.keys(SUPPLIER_GUIDE_CATEGORY_LABELS) as SupplierGuideCategory[]).map((k) => (
                <option key={k} value={k}>{SUPPLIER_GUIDE_CATEGORY_LABELS[k]}</option>
              ))}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Sort</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Content</label>
          <RichTextEditor
            key={initial?.id ?? 'new'}
            initialValue={initial?.content ?? ''}
            onChange={setContent}
            placeholder="Ordering steps, provisioning notes, support contacts, escalation paths…"
            minHeight={200}
          />
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={visibleInPortal} onChange={(e) => setVisibleInPortal(e.target.checked)} />
          Show in customer portal — customers can read this guide and Hank can reference it on the member side
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: '8px 14px', fontSize: 12 }}
          onClick={() =>
            onSave({
              title: title.trim(),
              content: isRichHtmlEmpty(content) ? '' : content.trim(),
              category,
              visibleInPortal,
              sortOrder: Number(sortOrder) || 0,
            })
          }
        >
          Save guide
        </button>
        <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

function normalizeUrl(raw: string): string {
  const v = raw.trim();
  if (!v) return '';
  if (/^https?:\/\//i.test(v) || /^mailto:/i.test(v)) return v;
  return `https://${v}`;
}

function TypeCombobox({
  value,
  options,
  onChange,
}: {
  value: string;
  options: string[];
  onChange: (next: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    function onDocClick(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    }
    document.addEventListener('mousedown', onDocClick);
    return () => document.removeEventListener('mousedown', onDocClick);
  }, []);

  const query = value.trim().toLowerCase();
  const filtered = options.filter((o) => o.toLowerCase().includes(query));
  const exactMatch = options.some((o) => o.toLowerCase() === query);
  const canAddNew = value.trim().length > 0 && !exactMatch;

  return (
    <div ref={wrapRef} style={{ position: 'relative' }}>
      <input
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        placeholder="Search or add a type…"
        style={inputStyle}
      />
      {open && (filtered.length > 0 || canAddNew) && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 4px)',
            left: 0,
            right: 0,
            zIndex: 20,
            background: 'var(--white)',
            border: '1px solid var(--gray-border)',
            borderRadius: 6,
            boxShadow: '0 6px 20px rgba(0,0,0,0.12)',
            maxHeight: 200,
            overflowY: 'auto',
          }}
        >
          {filtered.map((o) => (
            <button
              key={o}
              type="button"
              onClick={() => {
                onChange(o);
                setOpen(false);
              }}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                fontSize: 13,
                background: o === value ? 'var(--gray-light)' : 'transparent',
                border: 'none',
                cursor: 'pointer',
              }}
            >
              {o}
            </button>
          ))}
          {canAddNew && (
            <button
              type="button"
              onClick={() => setOpen(false)}
              style={{
                display: 'block',
                width: '100%',
                textAlign: 'left',
                padding: '8px 10px',
                fontSize: 13,
                color: 'var(--brand, #2563eb)',
                fontWeight: 600,
                background: 'transparent',
                border: 'none',
                borderTop: filtered.length ? '1px solid var(--gray-border)' : 'none',
                cursor: 'pointer',
              }}
            >
              + Add new type “{value.trim()}”
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function SourceEditor({
  initial,
  typeOptions,
  onSave,
  onCancel,
}: {
  initial?: Partial<SupplierSource>;
  typeOptions: string[];
  onSave: (draft: {
    title: string;
    url: string;
    sourceType: string;
    visibleInPortal: boolean;
    sortOrder: number;
  }) => void;
  onCancel: () => void;
}) {
  const [title, setTitle] = useState(initial?.title ?? '');
  const [url, setUrl] = useState(initial?.url ?? '');
  const [sourceType, setSourceType] = useState(initial?.sourceType ?? '');
  const [visibleInPortal, setVisibleInPortal] = useState(initial?.visibleInPortal ?? false);
  const [sortOrder, setSortOrder] = useState(String(initial?.sortOrder ?? 0));

  return (
    <div style={{ padding: 16, background: 'var(--gray-light)', borderRadius: 8, marginTop: 12 }}>
      <div style={{ display: 'grid', gap: 10 }}>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Title</label>
          <input value={title} onChange={(e) => setTitle(e.target.value)} style={inputStyle} placeholder="e.g. 2026 wholesale rate card" />
        </div>
        <div>
          <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Link</label>
          <input value={url} onChange={(e) => setUrl(e.target.value)} style={inputStyle} placeholder="https://…" />
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px', gap: 10 }}>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Type</label>
            <TypeCombobox value={sourceType} options={typeOptions} onChange={setSourceType} />
          </div>
          <div>
            <label style={{ fontSize: 10, fontWeight: 600, color: 'var(--gray)' }}>Sort</label>
            <input type="number" value={sortOrder} onChange={(e) => setSortOrder(e.target.value)} style={inputStyle} />
          </div>
        </div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
          <input type="checkbox" checked={visibleInPortal} onChange={(e) => setVisibleInPortal(e.target.checked)} />
          Show in customer portal — customers and Hank can reference this source on the member side
        </label>
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 14 }}>
        <button
          type="button"
          className="btn-primary"
          style={{ padding: '8px 14px', fontSize: 12 }}
          onClick={() =>
            onSave({
              title: title.trim(),
              url: normalizeUrl(url),
              sourceType: sourceType.trim() || 'Reference',
              visibleInPortal,
              sortOrder: Number(sortOrder) || 0,
            })
          }
        >
          Save source
        </button>
        <button type="button" className="btn-secondary" style={{ padding: '8px 14px', fontSize: 12 }} onClick={onCancel}>
          Cancel
        </button>
      </div>
    </div>
  );
}

export function SupplierGuidesTab({
  providerId,
  providerDbId,
  providerName,
  fromBmwOnly,
}: {
  providerId: string;
  providerDbId?: number;
  providerName: string;
  fromBmwOnly?: boolean;
}) {
  const [guides, setGuides] = useState<SupplierGuide[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<'add' | string | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [categoryFilter, setCategoryFilter] = useState<CategoryFilter>('all');
  const [searchQuery, setSearchQuery] = useState('');

  const [sources, setSources] = useState<SupplierSource[]>([]);
  const [sourceTypes, setSourceTypes] = useState<string[]>([]);
  const [editingSource, setEditingSource] = useState<'add' | string | null>(null);
  const [sourceSaving, setSourceSaving] = useState(false);

  const typeOptions = useMemo(() => {
    const set = new Set<string>([...DEFAULT_SOURCE_TYPES, ...sourceTypes]);
    return [...set].sort((a, b) => a.localeCompare(b));
  }, [sourceTypes]);

  const categoryCounts = useMemo(() => {
    const counts: Record<CategoryFilter, number> = {
      all: guides.length,
      guide: 0,
      documentation: 0,
      faq: 0,
      process: 0,
    };
    for (const g of guides) {
      counts[g.category] += 1;
    }
    return counts;
  }, [guides]);

  const filteredGuides = useMemo(() => {
    return guides.filter((g) => {
      if (categoryFilter !== 'all' && g.category !== categoryFilter) return false;
      return guideMatchesSearch(g, searchQuery);
    });
  }, [guides, categoryFilter, searchQuery]);

  const addGuideDefaultCategory: SupplierGuideCategory =
    categoryFilter === 'all' ? 'guide' : categoryFilter;

  const reload = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setGuides(await fetchSupplierGuides(providerId));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load guides');
    } finally {
      setLoading(false);
    }
  }, [providerId]);

  const reloadSources = useCallback(async () => {
    try {
      const { sources: rows, types } = await fetchSupplierSources(providerId);
      setSources(rows);
      setSourceTypes(types);
    } catch {
      // Sources are supplementary; surface guide errors only.
    }
  }, [providerId]);

  useEffect(() => {
    void reload();
    void reloadSources();
  }, [reload, reloadSources]);

  const handleSaveSource = async (
    draft: {
      title: string;
      url: string;
      sourceType: string;
      visibleInPortal: boolean;
      sortOrder: number;
    },
    sourceId?: string,
  ) => {
    setSourceSaving(true);
    setError(null);
    try {
      await saveSupplierSource({ providerId, id: sourceId, ...draft });
      setEditingSource(null);
      await reloadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save source');
    } finally {
      setSourceSaving(false);
    }
  };

  const handleDeleteSource = async (id: string) => {
    if (!window.confirm('Delete this source?')) return;
    setSourceSaving(true);
    try {
      await deleteSupplierSource(id);
      await reloadSources();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete source');
    } finally {
      setSourceSaving(false);
    }
  };

  const handleSave = async (
    draft: {
      title: string;
      content: string;
      category: SupplierGuideCategory;
      visibleInPortal: boolean;
      sortOrder: number;
    },
    guideId?: string,
  ) => {
    setSaving(true);
    setError(null);
    try {
      await saveSupplierGuide({
        providerId,
        id: guideId,
        ...draft,
      });
      setEditing(null);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save guide');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async (id: string) => {
    if (!window.confirm('Delete this guide?')) return;
    setSaving(true);
    try {
      await deleteSupplierGuide(id);
      await reload();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete guide');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
        <div>
          <div style={{ fontSize: 15, fontWeight: 600 }}>Guides & guidance</div>
          <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
            Internal playbooks for {providerName}. Portal-visible guides can be read by customers and used by Hank on the member portal.
          </div>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ fontSize: 12, whiteSpace: 'nowrap' }}
          onClick={() => setEditing('add')}
          disabled={saving || editing === 'add' || (fromBmwOnly && !providerDbId)}
        >
          + Add guide
        </button>
      </div>

      {fromBmwOnly && !providerDbId && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--amber-light)', color: 'var(--amber)', fontSize: 12 }}>
          This vendor is from BMW data only. Save it from the <strong>Overview</strong> tab (Edit provider) before adding guides.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 12, padding: '10px 12px', borderRadius: 6, background: '#FEF2F2', color: 'var(--red)', fontSize: 13 }}>
          {error}
        </div>
      )}

      {!loading && guides.length > 0 && (
        <div style={{ marginBottom: 16, display: 'flex', flexWrap: 'wrap', gap: 12, alignItems: 'center', justifyContent: 'space-between' }}>
          <div className="comm-tabs" style={{ marginBottom: 0, flexWrap: 'wrap' }}>
            <button
              type="button"
              className={`comm-tab${categoryFilter === 'all' ? ' active' : ''}`}
              onClick={() => setCategoryFilter('all')}
            >
              All ({categoryCounts.all})
            </button>
            {GUIDE_CATEGORIES.map((cat) => (
              <button
                key={cat}
                type="button"
                className={`comm-tab${categoryFilter === cat ? ' active' : ''}`}
                onClick={() => setCategoryFilter(cat)}
              >
                {SUPPLIER_GUIDE_CATEGORY_LABELS[cat]} ({categoryCounts[cat]})
              </button>
            ))}
          </div>
          <input
            type="search"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search guides…"
            style={{
              border: '1px solid var(--gray-border)',
              borderRadius: 6,
              padding: '8px 12px',
              fontSize: 13,
              width: '100%',
              maxWidth: 260,
              boxSizing: 'border-box',
            }}
          />
        </div>
      )}

      {loading ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>Loading guides…</p>
      ) : guides.length === 0 && editing !== 'add' ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>No guides yet. Add ordering steps, support contacts, or provisioning documentation.</p>
      ) : filteredGuides.length === 0 && editing !== 'add' ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>
          No guides match{searchQuery.trim() ? ` "${searchQuery.trim()}"` : ''}
          {categoryFilter !== 'all' ? ` in ${SUPPLIER_GUIDE_CATEGORY_LABELS[categoryFilter]}` : ''}.
        </p>
      ) : (
        <div style={{ display: 'grid', gap: 10 }}>
          {filteredGuides.map((g) => (
            <div key={g.id} style={{ border: '1px solid var(--gray-border)', borderRadius: 8, overflow: 'hidden' }}>
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '12px 14px',
                  background: 'var(--white)',
                  cursor: 'pointer',
                }}
                onClick={() => setExpandedId(expandedId === g.id ? null : g.id)}
              >
                <div>
                  <div style={{ fontWeight: 600, fontSize: 13 }}>{g.title}</div>
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>
                    {SUPPLIER_GUIDE_CATEGORY_LABELS[g.category]}
                    {g.visibleInPortal ? (
                      <span style={{ marginLeft: 8, color: 'var(--green)', fontWeight: 600 }}>· Customer portal</span>
                    ) : (
                      <span style={{ marginLeft: 8 }}>· Admin only</span>
                    )}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 6 }} onClick={(e) => e.stopPropagation()}>
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setEditing(g.id)}>Edit</button>
                  <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={saving} onClick={() => void handleDelete(g.id)}>Delete</button>
                </div>
              </div>
              {expandedId === g.id && (
                <div style={{ padding: '12px 14px', borderTop: '1px solid var(--gray-border)', fontSize: 13, lineHeight: 1.55, background: 'var(--gray-light)' }}>
                  <RichTextContent content={g.content} />
                </div>
              )}
              {editing === g.id && (
                <div style={{ padding: '0 14px 14px' }}>
                  <GuideEditor
                    initial={g}
                    onCancel={() => setEditing(null)}
                    onSave={(draft) => void handleSave(draft, g.id)}
                  />
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {editing === 'add' && (
        <GuideEditor
          defaultCategory={addGuideDefaultCategory}
          onCancel={() => setEditing(null)}
          onSave={(draft) => void handleSave(draft)}
        />
      )}

      <div style={{ marginTop: 32, paddingTop: 24, borderTop: '1px solid var(--gray-border)' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16, gap: 12 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Sources &amp; references</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              Titled links (rate cards, contracts, docs, support portals) for {providerName}. These are reused across the site and given to Hank as references.
            </div>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: 12, whiteSpace: 'nowrap' }}
            onClick={() => setEditingSource('add')}
            disabled={sourceSaving || editingSource === 'add' || (fromBmwOnly && !providerDbId)}
          >
            + Add source
          </button>
        </div>

        {sources.length === 0 && editingSource !== 'add' ? (
          <p style={{ fontSize: 13, color: 'var(--gray)' }}>
            No sources yet. Add links to pricing sheets, agreements, documentation, or support portals.
          </p>
        ) : (
          <div style={{ display: 'grid', gap: 10 }}>
            {sources.map((s) => (
              <div key={s.id} style={{ border: '1px solid var(--gray-border)', borderRadius: 8, overflow: 'hidden' }}>
                <div
                  style={{
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    padding: '12px 14px',
                    background: 'var(--white)',
                    gap: 12,
                  }}
                >
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: 13 }}>
                      {s.url ? (
                        <a href={s.url} target="_blank" rel="noopener noreferrer" style={{ color: 'var(--brand, #2563eb)' }}>
                          {s.title}
                        </a>
                      ) : (
                        s.title
                      )}
                    </div>
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      <span style={{ fontWeight: 600 }}>{s.sourceType}</span>
                      {s.url ? <span> · {s.url}</span> : null}
                      {s.visibleInPortal ? (
                        <span style={{ marginLeft: 8, color: 'var(--green)', fontWeight: 600 }}>· Customer portal</span>
                      ) : (
                        <span style={{ marginLeft: 8 }}>· Admin only</span>
                      )}
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} onClick={() => setEditingSource(s.id)}>Edit</button>
                    <button type="button" className="btn-secondary" style={{ fontSize: 11, padding: '4px 10px' }} disabled={sourceSaving} onClick={() => void handleDeleteSource(s.id)}>Delete</button>
                  </div>
                </div>
                {editingSource === s.id && (
                  <div style={{ padding: '0 14px 14px' }}>
                    <SourceEditor
                      initial={s}
                      typeOptions={typeOptions}
                      onCancel={() => setEditingSource(null)}
                      onSave={(draft) => void handleSaveSource(draft, s.id)}
                    />
                  </div>
                )}
              </div>
            ))}
          </div>
        )}

        {fromBmwOnly && !providerDbId && editingSource === 'add' && (
          <div style={{ marginTop: 12, padding: '10px 12px', borderRadius: 6, background: 'var(--amber-light)', color: 'var(--amber)', fontSize: 12 }}>
            Save this vendor from the <strong>Overview</strong> tab before adding sources.
          </div>
        )}

        {editingSource === 'add' && (
          <SourceEditor
            typeOptions={typeOptions}
            onCancel={() => setEditingSource(null)}
            onSave={(draft) => void handleSaveSource(draft)}
          />
        )}
      </div>
    </div>
  );
}
