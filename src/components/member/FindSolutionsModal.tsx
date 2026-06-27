'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { callHankAPI, HANK_SYSTEM_PROMPT } from '@/lib/candid-data';
import {
  CATALOG_SUPPLIERS,
  SOLUTION_CATEGORIES,
  solutionCategoryLabel,
  suppliersForCategory,
  type CatalogSupplier,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';

type HankMsg = { type: 'user' | 'bot'; text: string };

export default function FindSolutionsModal({
  onClose,
  onRequestQuote,
}: {
  onClose: () => void;
  onRequestQuote: (category: SolutionCategoryId, supplier?: string) => void;
  /** @deprecated Use inline Hank panel instead — kept for API compatibility. */
  onAskHank?: (text: string) => void;
}) {
  const [systemSuppliers, setSystemSuppliers] = useState<CatalogSupplier[]>([]);
  const [category, setCategory] = useState<SolutionCategoryId | null>(null);
  // Dating-app shortlist (TASK-021): customers mark suppliers they're interested in.
  const [shortlist, setShortlist] = useState<Map<string, { name: string; category: SolutionCategoryId }>>(new Map());
  const [submitOpen, setSubmitOpen] = useState(false);
  const [submitIntents, setSubmitIntents] = useState<Set<string>>(new Set());
  const [submitNote, setSubmitNote] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [hankOpen, setHankOpen] = useState(false);
  const [hankInput, setHankInput] = useState('');
  const [hankLoading, setHankLoading] = useState(false);
  const [hankMessages, setHankMessages] = useState<HankMsg[]>([]);
  const [hankConversation, setHankConversation] = useState<{ role: string; content: string }[]>([]);
  const hankListRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const res = await fetch('/api/portal/solutions');
        if (!res.ok) return;
        const json = (await res.json()) as { suppliers?: CatalogSupplier[] };
        if (!cancelled) setSystemSuppliers(json.suppliers ?? []);
      } catch {
        /* ignore */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    hankListRef.current?.scrollTo(0, hankListRef.current.scrollHeight);
  }, [hankMessages, hankLoading, hankOpen]);

  const countByCategory = useMemo(() => {
    const map = new Map<SolutionCategoryId, number>();
    for (const cat of SOLUTION_CATEGORIES) {
      map.set(cat.id, suppliersForCategory(cat.id, systemSuppliers).length);
    }
    return map;
  }, [systemSuppliers]);

  const suppliers = category ? suppliersForCategory(category, systemSuppliers) : [];

  const hankSystemPrompt = useMemo(() => {
    const catLine = category
      ? `The customer is browsing **${solutionCategoryLabel(category)}** suppliers in Find Solutions.`
      : 'The customer is browsing solution categories in Find Solutions.';
    const supplierNames = suppliers.slice(0, 12).map((s) => s.name).join(', ');
    return `${HANK_SYSTEM_PROMPT}\n\nCONTEXT: ${catLine}${
      supplierNames ? ` Available suppliers in this view: ${supplierNames}.` : ''
    } Help them compare options and decide next steps — quote requests go through Candid, not direct to suppliers.`;
  }, [category, suppliers]);

  const sendHank = useCallback(
    async (text?: string) => {
      const msg = (text ?? hankInput).trim();
      if (!msg || hankLoading) return;
      setHankInput('');
      setHankOpen(true);
      setHankLoading(true);
      setHankMessages((prev) => [...prev, { type: 'user', text: msg }]);
      const historyWithUser = [...hankConversation, { role: 'user', content: msg }];
      try {
        const reply = await callHankAPI(historyWithUser, { systemPrompt: hankSystemPrompt });
        setHankConversation([...historyWithUser, { role: 'assistant', content: reply }]);
        setHankMessages((prev) => [...prev, { type: 'bot', text: reply }]);
      } catch {
        setHankMessages((prev) => [
          ...prev,
          { type: 'bot', text: 'Something went wrong — try again in a moment.' },
        ]);
      } finally {
        setHankLoading(false);
      }
    },
    [hankConversation, hankInput, hankLoading, hankSystemPrompt],
  );

  const openHank = (seed?: string) => {
    setHankOpen(true);
    if (seed) void sendHank(seed);
  };

  const toggleShortlist = (name: string, cat: SolutionCategoryId) => {
    const key = `${cat}|${name}`;
    setShortlist((prev) => {
      const next = new Map(prev);
      if (next.has(key)) next.delete(key);
      else next.set(key, { name, category: cat });
      return next;
    });
  };

  const recommendFromShortlist = () => {
    const names = [...shortlist.values()].map((s) => s.name);
    const seed = names.length
      ? `I've shortlisted these options: ${names.join(', ')}. Based on these, which is the best fit for my business and why? Ask me anything you need to narrow it down.`
      : `Help me figure out which solution is the best fit for my business — ask me a few questions to narrow it down.`;
    openHank(seed);
  };

  const toggleIntent = (id: string) =>
    setSubmitIntents((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const submitShortlist = async () => {
    setSubmitting(true);
    const names = [...shortlist.values()].map((s) => s.name);
    const intents = [...submitIntents];
    try {
      await fetch('/api/portal/quote-request', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          mode: 'request',
          services: names,
          note: ['Find Solutions shortlist', intents.join(', '), submitNote.trim()].filter(Boolean).join(' — '),
        }),
      });
      setSubmitted(true);
    } catch {
      /* best-effort */
      setSubmitted(true);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box fs-modal" role="dialog" aria-label="Find solutions">
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="fs-head-icon">
              <AppIcon name="sparkles" size={18} />
            </div>
            <div>
              <div className="modal-title">
                {category ? solutionCategoryLabel(category) : 'Find Solutions'}
              </div>
              <div className="modal-subtitle">
                {category
                  ? 'Compare suppliers Candid can set up for you'
                  : 'What are you looking for? Pick a category to compare options.'}
              </div>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <a className="fs-link-btn" href="/suppliermatrix.html" target="_blank" rel="noreferrer">
              <AppIcon name="chart" size={11} /> Full matrix
            </a>
            <button className="modal-close" onClick={onClose} aria-label="Close">
              ✕
            </button>
          </div>
        </div>

        <div className="fs-body">
          {!category && (
            <div className="fs-cat-grid">
              {SOLUTION_CATEGORIES.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  className="fs-cat-btn"
                  onClick={() => setCategory(c.id)}
                >
                  <span className="fs-cat-icon">
                    <AppIcon name={c.icon} size={20} />
                  </span>
                  <span className="fs-cat-label">{c.label}</span>
                  <span className="fs-cat-blurb">{c.blurb}</span>
                  <span className="fs-cat-count">{countByCategory.get(c.id) ?? 0} options</span>
                </button>
              ))}
            </div>
          )}

          {category && (
            <>
              <button type="button" className="fs-back" onClick={() => setCategory(null)}>
                <AppIcon name="panelCollapse" size={12} /> All categories
              </button>

              <div className="fs-supplier-grid">
                {suppliers.map((s) => (
                  <div key={`${s.name}-${s.source}`} className="fs-supplier">
                    <div className="fs-supplier-head">
                      <div className="fs-supplier-name">{s.name}</div>
                      <span className={`fs-badge fs-badge--${s.source}`}>
                        {s.source === 'candid' ? 'In Candid network' : 'Available via Candid'}
                      </span>
                    </div>
                    <ul className="fs-feature-list">
                      {s.features.map((f, i) => (
                        <li key={i}>
                          <AppIcon name="check" size={11} /> {f}
                        </li>
                      ))}
                    </ul>
                    <div className="fs-supplier-foot">
                      <span className="fs-price">{s.pricing ?? 'Custom pricing — we negotiate it'}</span>
                      <div className="fs-supplier-actions">
                        {s.website && (
                          <a
                            className="fs-link-btn"
                            href={s.website}
                            target="_blank"
                            rel="noreferrer"
                          >
                            <AppIcon name="link" size={11} /> Site
                          </a>
                        )}
                        <button
                          type="button"
                          className={`fs-interest-btn${shortlist.has(`${category}|${s.name}`) ? ' active' : ''}`}
                          onClick={() => toggleShortlist(s.name, category)}
                          aria-pressed={shortlist.has(`${category}|${s.name}`)}
                        >
                          {shortlist.has(`${category}|${s.name}`) ? '★ Shortlisted' : '☆ Interested'}
                        </button>
                        <button
                          type="button"
                          className="fs-quote-btn"
                          onClick={() => onRequestQuote(category, s.name)}
                        >
                          Get a quote →
                        </button>
                      </div>
                    </div>
                  </div>
                ))}
              </div>

              <div className="fs-footer-cta">
                <div>
                  <div className="fs-footer-title">Not sure which is right?</div>
                  <div className="fs-footer-sub">
                    Ask Hank here — stay on this screen while he helps you compare options.
                  </div>
                </div>
                <button
                  type="button"
                  className="fs-ask-btn"
                  onClick={() =>
                    openHank(
                      `I'm looking for ${solutionCategoryLabel(category)} options. What do you recommend for my business?`,
                    )
                  }
                >
                  <AppIcon name="hank" size={13} /> Ask Hank
                </button>
              </div>
            </>
          )}

          {hankOpen && (
            <div className="fs-hank-panel">
              <div className="fs-hank-head">
                <strong>
                  <AppIcon name="hank" size={14} /> Hank
                </strong>
                <button type="button" className="fs-hank-close" onClick={() => setHankOpen(false)}>
                  Minimize
                </button>
              </div>
              <div className="fs-hank-messages" ref={hankListRef}>
                {hankMessages.length === 0 && (
                  <p className="fs-hank-empty">Ask Hank anything about these solutions…</p>
                )}
                {hankMessages.map((m, i) => (
                  <div key={i} className={`fs-hank-msg fs-hank-msg--${m.type}`}>
                    <div dangerouslySetInnerHTML={{ __html: m.text }} />
                  </div>
                ))}
                {hankLoading && (
                  <div className="fs-hank-msg fs-hank-msg--bot">
                    <div className="typing">
                      <span />
                      <span />
                      <span />
                    </div>
                  </div>
                )}
              </div>
              <div className="fs-hank-input-row">
                <input
                  className="fs-hank-input"
                  placeholder="Ask about features, pricing, fit…"
                  value={hankInput}
                  onChange={(e) => setHankInput(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && void sendHank()}
                  disabled={hankLoading}
                />
                <button
                  type="button"
                  className="fs-hank-send"
                  disabled={hankLoading || !hankInput.trim()}
                  onClick={() => void sendHank()}
                >
                  Send
                </button>
              </div>
            </div>
          )}
        </div>

        {shortlist.size > 0 && !submitted && (
          <div className="fs-shortlist-bar">
            <div className="fs-shortlist-info">
              <strong>{shortlist.size} shortlisted</strong>
              <span className="fs-shortlist-names">{[...shortlist.values()].map((s) => s.name).join(', ')}</span>
            </div>
            <div className="fs-shortlist-actions">
              <button type="button" className="fs-ask-btn" onClick={recommendFromShortlist}>
                <AppIcon name="hank" size={13} /> Recommend for me
              </button>
              <button type="button" className="fs-quote-btn" onClick={() => setSubmitOpen((v) => !v)}>
                Submit request →
              </button>
            </div>
          </div>
        )}

        {submitOpen && shortlist.size > 0 && !submitted && (
          <div className="fs-submit-panel">
            <div className="fs-submit-title">What would you like to do with your shortlist?</div>
            <div className="fs-submit-intents">
              {[
                { id: 'learn-more', label: 'Learn more' },
                { id: 'get-quotes', label: 'Get quotes' },
                { id: 'schedule-meeting', label: 'Schedule a meeting' },
              ].map((opt) => (
                <button
                  key={opt.id}
                  type="button"
                  className={`fs-intent-chip${submitIntents.has(opt.id) ? ' active' : ''}`}
                  onClick={() => toggleIntent(opt.id)}
                >
                  {opt.label}
                </button>
              ))}
            </div>
            <textarea
              className="fs-submit-note"
              value={submitNote}
              onChange={(e) => setSubmitNote(e.target.value)}
              rows={2}
              placeholder="Anything specific? (timeline, must-haves, number of users…)"
            />
            <button
              type="button"
              className="fs-quote-btn fs-submit-go"
              onClick={() => void submitShortlist()}
              disabled={submitting || submitIntents.size === 0}
            >
              {submitting ? 'Sending…' : 'Send to Candid →'}
            </button>
          </div>
        )}

        {submitted && (
          <div className="fs-submit-done">
            <AppIcon name="check" size={16} /> Sent! A Candid specialist will follow up on your shortlist shortly.
          </div>
        )}
      </div>
    </div>
  );
}

export { CATALOG_SUPPLIERS };
