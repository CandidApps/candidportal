'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import { callHankAPI } from '@/lib/candid-data';
import { solutionCategoryLabel, type SolutionCategoryId } from '@/lib/solutions/catalog';
import { supplierEarningsBadge } from '@/lib/solutions/supplier-earnings';
import {
  mustHaveOptionsForCategory,
  primaryCategory,
  SOLUTION_CATEGORIES,
  type MergedSolutionSupplier,
} from '@/lib/solutions/supplier-matrix';
import { fetchProductMatches, type ProductMatchSupplier } from '@/lib/member-product-search-client';

export type GuidedPanelMode = 'guided' | 'recommend';

type StepId = 'category' | 'size' | 'musthaves' | 'timeline';
type Category = SolutionCategoryId | 'all';

type Msg = { id: number; from: 'frank' | 'me'; text: string; step?: StepId };

type Answers = { team?: string; locations?: string; timeline?: string };

type StepCtx = { cat?: Category; must?: string[] };

type Ranked = { supplier: MergedSolutionSupplier; why: string; alternative?: boolean };

const TEAM_OPTIONS = ['1–10', '11–50', '51–200', '200+'];
const LOCATION_OPTIONS = ['1', '2–5', '6+'];
const TIMELINE_OPTIONS = [
  { id: 'asap', label: 'ASAP' },
  { id: '1-3m', label: 'In 1–3 months' },
  { id: 'exploring', label: 'Just exploring' },
];
const TOP_CATEGORY_COUNT = 8;
const ANSWERS_KEY = 'fs-guided-answers';

const GUIDED_STEPS: StepId[] = ['category', 'size', 'musthaves', 'timeline'];

function loadAnswers(): Answers {
  if (typeof window === 'undefined') return {};
  try {
    return JSON.parse(window.sessionStorage.getItem(ANSWERS_KEY) ?? '{}') as Answers;
  } catch {
    return {};
  }
}

function timelineLabel(id?: string): string | null {
  return TIMELINE_OPTIONS.find((t) => t.id === id)?.label ?? null;
}

function supplierFeatures(s: MergedSolutionSupplier): string[] {
  return [...new Set([...s.matrixFeatures, ...s.features])];
}

function whyLine(s: MergedSolutionSupplier, mustHaves: string[]): string {
  const feats = supplierFeatures(s);
  const matched = mustHaves.filter((f) => feats.includes(f));
  const parts: string[] = [];
  if (matched.length) parts.push(`Covers ${matched.slice(0, 2).join(' & ')}`);
  if (s.candidRecommended) parts.push('Candid recommended');
  if (parts.length) return parts.join(' · ');
  const desc = (s.description ?? '').split(/(?<=\.)\s/)[0] ?? '';
  return desc.length > 90 ? `${desc.slice(0, 87)}…` : desc;
}

function rankMatches(list: MergedSolutionSupplier[]): MergedSolutionSupplier[] {
  const cash = (s: MergedSolutionSupplier) =>
    s.cashbackPct != null && Number.isFinite(s.cashbackPct) ? s.cashbackPct : -1;
  return [...list].sort(
    (a, b) =>
      Number(Boolean(b.candidRecommended)) - Number(Boolean(a.candidRecommended)) || cash(b) - cash(a),
  );
}

function extractJson<T>(text: string): T | null {
  const start = text.indexOf('{');
  const end = text.lastIndexOf('}');
  if (start < 0 || end <= start) return null;
  try {
    return JSON.parse(text.slice(start, end + 1)) as T;
  } catch {
    return null;
  }
}

function findSupplier(list: MergedSolutionSupplier[], name: unknown): MergedSolutionSupplier | undefined {
  if (typeof name !== 'string') return undefined;
  const key = name.trim().toLowerCase();
  return list.find((s) => s.name.toLowerCase() === key);
}

export function GuidedSearchPanel({
  open,
  mode,
  openKey,
  suppliers,
  matches,
  shortlist,
  category,
  mustHaves,
  onCategory,
  onMustHaves,
  isInterested,
  onToggleInterested,
  onViewDetails,
  onOrder,
  onBuildQuote,
  onSeeAll,
  onClose,
  onProductQuery,
  offersFor,
}: {
  open: boolean;
  mode: GuidedPanelMode;
  /** Changes each time the panel is (re)opened from a toolbar or shortlist button. */
  openKey: number;
  suppliers: MergedSolutionSupplier[];
  matches: MergedSolutionSupplier[];
  shortlist: MergedSolutionSupplier[];
  category: Category;
  mustHaves: string[];
  onCategory: (c: Category) => void;
  onMustHaves: (list: string[]) => void;
  isInterested: (name: string) => boolean;
  onToggleInterested: (s: MergedSolutionSupplier) => void;
  onViewDetails: (name: string) => void;
  onOrder: (s: MergedSolutionSupplier) => void;
  onBuildQuote: (s: MergedSolutionSupplier) => void;
  onSeeAll: () => void;
  onClose: () => void;
  /** Member named a specific product (e.g. Microsoft 365) that suppliers sell; parent narrows results to it. */
  onProductQuery?: (query: string) => void;
  /** Sellable products matching the current search, per supplier. */
  offersFor?: (s: MergedSolutionSupplier) => ProductMatchSupplier | undefined;
}) {
  const [answers, setAnswers] = useState<Answers>(loadAnswers);
  const [answered, setAnswered] = useState<Set<StepId>>(new Set());
  const [steps, setSteps] = useState<StepId[]>(GUIDED_STEPS);
  const [step, setStep] = useState<StepId | 'done'>('category');
  const [messages, setMessages] = useState<Msg[]>([]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [showAllCats, setShowAllCats] = useState(false);
  const [pendingMustHaves, setPendingMustHaves] = useState<string[]>([]);
  const [ranked, setRanked] = useState<{ summary: string; items: Ranked[] } | null>(null);
  const [activeMode, setActiveMode] = useState<GuidedPanelMode>(mode);
  const modeRef = useRef<GuidedPanelMode>(mode);
  const msgId = useRef(0);
  const bodyRef = useRef<HTMLDivElement>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    try {
      window.sessionStorage.setItem(ANSWERS_KEY, JSON.stringify(answers));
    } catch {
      /* ignore */
    }
  }, [answers]);

  const push = useCallback((from: Msg['from'], text: string, stepTag?: StepId) => {
    msgId.current += 1;
    const m: Msg = { id: msgId.current, from, text, step: stepTag };
    setMessages((prev) => [...prev, m]);
  }, []);

  const mustHaveOptions = useMemo(
    () => mustHaveOptionsForCategory(suppliers, category, 12),
    [suppliers, category],
  );

  const questionFor = useCallback(
    (id: StepId, cat: Category = category): string => {
      switch (id) {
        case 'category':
          return 'What are you shopping for?';
        case 'size':
          return 'How big is the team, and how many locations?';
        case 'musthaves':
          return mustHaveOptionsForCategory(suppliers, cat, 12).length
            ? `Any must-haves${cat !== 'all' ? ` for ${solutionCategoryLabel(cat).toLowerCase()}` : ''}? Pick as many as you like.`
            : 'Anything you can’t live without? Type it below, or skip.';
        case 'timeline':
          return 'Last one — when do you need this in place?';
      }
    },
    [suppliers, category],
  );

  const askStep = useCallback(
    (id: StepId, ctx?: StepCtx) => {
      setStep(id);
      if (id === 'musthaves') setPendingMustHaves(ctx?.must ?? mustHaves);
      push('frank', questionFor(id, ctx?.cat), id);
    },
    [push, questionFor, mustHaves],
  );

  const shortlistNames = shortlist.map((s) => s.name);

  const buildRecommendation = useCallback(
    async (currentAnswers: Answers, must: string[]) => {
      if (!shortlist.length) return;
      busyRef.current = true;
      setBusy(true);
      const shortKeys = new Set(shortlist.map((s) => s.name.toLowerCase()));
      const cat = category !== 'all' ? category : primaryCategory(shortlist[0]);
      const offered = (s: MergedSolutionSupplier) => Boolean(offersFor?.(s));
      const alternativesPool = rankMatches(
        suppliers.filter(
          (s) => (s.categories.includes(cat) || offered(s)) && !shortKeys.has(s.name.toLowerCase()),
        ),
      )
        .sort((a, b) => Number(offered(b)) - Number(offered(a)))
        .slice(0, 5);
      const describe = (s: MergedSolutionSupplier) => {
        const offers = offersFor?.(s);
        return `- ${s.name}: ${(s.description ?? '').slice(0, 160)} | features: ${supplierFeatures(s).slice(0, 10).join(', ')}${
          offers ? ` | sells: ${offers.products.join('; ')}` : ''
        }${s.candidRecommended ? ' | Candid recommended' : ''}${
          supplierEarningsBadge(s) ? ` | ${supplierEarningsBadge(s)}` : ''
        }`;
      };
      const system = `You are Frank, Candid's assistant. Rank a member's shortlisted suppliers for their business.
Reply ONLY with JSON, no prose outside it:
{"summary": "2 short sentences max", "ranking": [{"name": "exact shortlist name", "why": "one line, max 14 words"}], "alternatives": [{"name": "exact alternative name", "why": "one line, max 14 words"}]}
Rank every shortlisted supplier, best fit first. Include at most 2 alternatives, only if they are a clearly better or cheaper fit; otherwise use [].
Never mention commission; say cash back or rebate. Quotes go through Candid.

Member: team ${currentAnswers.team ?? 'unknown'}, locations ${currentAnswers.locations ?? 'unknown'}, timeline ${
        timelineLabel(currentAnswers.timeline) ?? 'unknown'
      }, must-haves ${must.length ? must.join(', ') : 'none given'}.
Shortlist:
${shortlist.map(describe).join('\n')}
Alternatives you may suggest:
${alternativesPool.map(describe).join('\n') || '(none)'}`;
      const text = await callHankAPI([{ role: 'user', content: 'Rank my shortlist.' }], { systemPrompt: system });
      const parsed = extractJson<{
        summary?: string;
        ranking?: { name?: string; why?: string }[];
        alternatives?: { name?: string; why?: string }[];
      }>(text);
      const items: Ranked[] = [];
      const seen = new Set<string>();
      for (const r of parsed?.ranking ?? []) {
        const s = findSupplier(shortlist, r.name);
        if (!s || seen.has(s.name)) continue;
        seen.add(s.name);
        items.push({ supplier: s, why: r.why?.trim() || whyLine(s, must) });
      }
      for (const s of shortlist) {
        if (!seen.has(s.name)) items.push({ supplier: s, why: whyLine(s, must) });
      }
      for (const r of (parsed?.alternatives ?? []).slice(0, 2)) {
        const s = findSupplier(alternativesPool, r.name);
        if (!s || seen.has(s.name)) continue;
        seen.add(s.name);
        items.push({ supplier: s, why: r.why?.trim() || whyLine(s, must), alternative: true });
      }
      const summary =
        parsed?.summary?.trim() ||
        `Here’s how your shortlist stacks up${currentAnswers.team ? ` for a ${currentAnswers.team}-person team` : ''}.`;
      setRanked({ summary, items });
      busyRef.current = false;
      setBusy(false);
    },
    [shortlist, suppliers, category, offersFor],
  );

  const finish = useCallback(
    (currentAnswers: Answers, must: string[] = mustHaves) => {
      setStep('done');
      if (modeRef.current === 'recommend') {
        setRanked(null);
        void buildRecommendation(currentAnswers, must);
      }
    },
    [buildRecommendation, mustHaves],
  );

  const advance = useCallback(
    (from: StepId | null, nextAnswered: Set<StepId>, currentAnswers: Answers, ctx?: StepCtx) => {
      const startIdx = from ? steps.indexOf(from) + 1 : 0;
      const next = steps.slice(startIdx).find((s) => !nextAnswered.has(s));
      if (next) askStep(next, ctx);
      else finish(currentAnswers, ctx?.must);
    },
    [steps, askStep, finish],
  );

  const start = useCallback(
    (requested: GuidedPanelMode, fresh = false) => {
      const known: Answers = fresh ? {} : answers;
      const knownMust = fresh ? [] : mustHaves;
      const nextMode: GuidedPanelMode = requested === 'recommend' && shortlist.length ? 'recommend' : 'guided';
      setActiveMode(nextMode);
      modeRef.current = nextMode;
      setMessages([]);
      setRanked(null);
      setShowAllCats(false);
      if (nextMode === 'recommend') {
        const recCat = category === 'all' ? primaryCategory(shortlist[0]) : category;
        if (recCat !== category) onCategory(recCat);
        const list: StepId[] = ['size', 'musthaves', 'timeline'];
        const done = new Set<StepId>();
        if (known.team && known.locations) done.add('size');
        if (knownMust.length) done.add('musthaves');
        if (known.timeline) done.add('timeline');
        const missing = list.filter((s) => !done.has(s));
        setSteps(missing.length ? missing : list);
        setAnswered(done);
        const names = shortlistNames.join(', ');
        push(
          'frank',
          missing.length
            ? `You’re comparing ${names}. ${missing.length === 1 ? 'One quick question' : `${missing.length} quick questions`} and I’ll rank them for you.`
            : `You’re comparing ${names}. I already know enough — here’s my take.`,
        );
        if (missing.length) askStep(missing[0], { cat: recCat, must: knownMust });
        else finish(known, knownMust);
        return;
      }
      setSteps(GUIDED_STEPS);
      setAnswered(new Set());
      push(
        'frank',
        'Hi, I’m Frank. Four quick questions and I’ll hand you a short list. Tap an answer or type in your own words.',
      );
      askStep('category');
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [shortlist, category, answers, mustHaves, shortlistNames.join('|')],
  );

  const lastOpenKey = useRef(0);
  useEffect(() => {
    if (!open || openKey === lastOpenKey.current) return;
    lastOpenKey.current = openKey;
    const resuming = messages.length > 0 && mode === activeMode && mode === 'guided';
    if (!resuming) start(mode);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, openKey]);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, busy, step, ranked]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !document.querySelector('.modal-overlay')) onClose();
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [open, onClose]);

  const markAnswered = (id: StepId) => {
    const next = new Set(answered);
    next.add(id);
    setAnswered(next);
    return next;
  };

  const answerCategory = (c: Category) => {
    push('me', c === 'all' ? 'Not sure yet — show me everything' : solutionCategoryLabel(c));
    onCategory(c);
    const next = markAnswered('category');
    next.delete('musthaves');
    setAnswered(new Set(next));
    advance('category', next, answers, { cat: c, must: [] });
  };

  const answerSize = (field: 'team' | 'locations', value: string) => {
    const nextAnswers = { ...answers, [field]: value };
    setAnswers(nextAnswers);
    if (!nextAnswers.team || !nextAnswers.locations) return;
    push(
      'me',
      `${nextAnswers.team} people · ${nextAnswers.locations} location${nextAnswers.locations === '1' ? '' : 's'}`,
    );
    const next = markAnswered('size');
    advance('size', next, nextAnswers);
  };

  const commitMustHaves = (list: string[]) => {
    onMustHaves(list);
    push('me', list.length ? list.join(', ') : 'No must-haves');
    const next = markAnswered('musthaves');
    advance('musthaves', next, answers, { must: list });
  };

  const answerTimeline = (id: string | null) => {
    const nextAnswers = { ...answers, timeline: id ?? 'skip' };
    setAnswers(nextAnswers);
    push('me', timelineLabel(id ?? undefined) ?? 'Skip');
    const next = markAnswered('timeline');
    advance('timeline', next, nextAnswers);
  };

  const goBack = () => {
    const idx = step === 'done' ? steps.length - 1 : steps.indexOf(step) - 1;
    if (idx < 0) return;
    const target = steps[idx];
    const cut = messages.findIndex((m) => m.from === 'frank' && m.step === target);
    const next = new Set(answered);
    for (const s of steps.slice(idx)) next.delete(s);
    setAnswered(next);
    setRanked(null);
    if (target === 'size') setAnswers((a) => ({ ...a, team: undefined, locations: undefined }));
    if (target === 'timeline') setAnswers((a) => ({ ...a, timeline: undefined }));
    setMessages((prev) => (cut >= 0 ? prev.slice(0, cut + 1) : prev));
    setStep(target);
    if (target === 'musthaves') setPendingMustHaves(mustHaves);
  };

  const startOver = () => {
    setAnswers({});
    onMustHaves([]);
    if (activeMode === 'guided') onCategory('all');
    start(activeMode, true);
  };

  const sendFreeText = async () => {
    const text = input.trim();
    if (!text || busyRef.current) return;
    setInput('');
    push('me', text);
    busyRef.current = true;
    setBusy(true);
    const catIds = SOLUTION_CATEGORIES.map((c) => `${c.id} (${c.label})`).join(', ');
    const system = `You are Frank, Candid's assistant, running a short guided supplier search. Map what the member says to structured answers.
Reply ONLY with JSON, no prose outside it:
{"reply": "max 2 short sentences, friendly, no lists", "productQuery": "a specific product, brand or software the member named (e.g. Microsoft 365, Zoom, SD-WAN) or null", "category": category id or null, "team": "1–10"|"11–50"|"51–200"|"200+"|null, "locations": "1"|"2–5"|"6+"|null, "mustHaves": [only exact items from the must-have list], "timeline": "asap"|"1-3m"|"exploring"|null}
Category ids: ${catIds}.
Must-have list: ${mustHaveOptions.join(', ') || '(none)'}.
Only fill fields the member actually stated. Current question: ${step === 'done' ? 'none — results shown' : questionFor(step)}.
Known so far: category ${category}, team ${answers.team ?? '?'}, locations ${answers.locations ?? '?'}, must-haves ${mustHaves.join(', ') || '?'}, timeline ${answers.timeline ?? '?'}.
Never mention commission; say cash back or rebate.`;
    const raw = await callHankAPI([{ role: 'user', content: text }], { systemPrompt: system });
    const parsed = extractJson<{
      reply?: string;
      productQuery?: string | null;
      category?: string | null;
      team?: string | null;
      locations?: string | null;
      mustHaves?: string[];
      timeline?: string | null;
    }>(raw);
    const productQuery = typeof parsed?.productQuery === 'string' ? parsed.productQuery.trim() : '';
    const productMatches = productQuery ? await fetchProductMatches(productQuery) : [];
    busyRef.current = false;
    setBusy(false);
    if (!parsed) {
      push('frank', raw);
      return;
    }
    if (productMatches.length) {
      onProductQuery?.(productQuery);
      const names = productMatches.slice(0, 3).map((m) => m.name);
      const more = productMatches.length - names.length;
      push(
        'frank',
        `${productMatches.length} supplier${productMatches.length === 1 ? '' : 's'} can sell ${productQuery}: ${names.join(', ')}${
          more > 0 ? ` and ${more} more` : ''
        }.`,
      );
    }
    const next = new Set(answered);
    const nextAnswers = { ...answers };
    const cat = productMatches.length ? undefined : SOLUTION_CATEGORIES.find((c) => c.id === parsed.category)?.id;
    if (productMatches.length) next.add('category');
    if (cat && cat !== category) {
      onCategory(cat);
      next.add('category');
      next.delete('musthaves');
    }
    if (parsed.team && TEAM_OPTIONS.includes(parsed.team)) nextAnswers.team = parsed.team;
    if (parsed.locations && LOCATION_OPTIONS.includes(parsed.locations)) nextAnswers.locations = parsed.locations;
    if (nextAnswers.team && nextAnswers.locations) next.add('size');
    const catChanged = Boolean(cat && cat !== category);
    const validFeats = catChanged ? mustHaveOptionsForCategory(suppliers, cat!, 12) : mustHaveOptions;
    const feats = (parsed.mustHaves ?? []).filter((f) => validFeats.includes(f));
    let nextMust = catChanged ? [] : mustHaves;
    if (feats.length) {
      nextMust = [...new Set([...nextMust, ...feats])];
      onMustHaves(nextMust);
      next.add('musthaves');
    }
    if (parsed.timeline && TIMELINE_OPTIONS.some((t) => t.id === parsed.timeline)) {
      nextAnswers.timeline = parsed.timeline;
      next.add('timeline');
    }
    setAnswers(nextAnswers);
    setAnswered(next);
    if (parsed.reply?.trim()) push('frank', parsed.reply.trim());
    if (step === 'done') return;
    if (next.has(step)) advance(null, next, nextAnswers, { cat: cat ?? category, must: nextMust });
  };

  const stepIndex = step === 'done' ? steps.length : steps.indexOf(step);
  const canGoBack = stepIndex > 0;
  const top3 = useMemo(
    () =>
      rankMatches(matches)
        .sort((a, b) => Number(Boolean(offersFor?.(b))) - Number(Boolean(offersFor?.(a))))
        .slice(0, 3),
    [matches, offersFor],
  );
  const offersLine = (s: MergedSolutionSupplier): string | null => {
    const offers = offersFor?.(s);
    return offers?.products.length ? `Offers ${offers.products.slice(0, 2).join(', ')}` : null;
  };
  const summary = useMemo(() => {
    const bits = [
      answers.team ? `your ${answers.team}-person team` : null,
      answers.locations ? `${answers.locations} location${answers.locations === '1' ? '' : 's'}` : null,
    ].filter(Boolean);
    const what = category !== 'all' ? solutionCategoryLabel(category).toLowerCase() : 'solutions';
    const need = mustHaves.length ? ` with ${mustHaves.slice(0, 3).join(', ')}` : '';
    if (!matches.length)
      return `Nothing matches ${what}${need} yet. Go back and drop a must-have, or tell me what matters most.`;
    return `For ${bits.length ? bits.join(' across ') : 'your business'}, these are the best ${what} fits${need}.`;
  }, [answers, category, mustHaves, matches.length]);

  const categoryChips = showAllCats ? SOLUTION_CATEGORIES : SOLUTION_CATEGORIES.slice(0, TOP_CATEGORY_COUNT);

  const renderChips = () => {
    if (busy || step === 'done') return null;
    if (step === 'category') {
      return (
        <div className="fs-gp-chips">
          {categoryChips.map((c) => (
            <button key={c.id} type="button" className="fs-gp-chip" onClick={() => answerCategory(c.id)}>
              <AppIcon name={c.icon} size={12} /> {c.label}
            </button>
          ))}
          {!showAllCats && SOLUTION_CATEGORIES.length > TOP_CATEGORY_COUNT && (
            <button type="button" className="fs-gp-chip fs-gp-chip--ghost" onClick={() => setShowAllCats(true)}>
              More…
            </button>
          )}
          <button type="button" className="fs-gp-chip fs-gp-chip--ghost" onClick={() => answerCategory('all')}>
            Not sure yet
          </button>
        </div>
      );
    }
    if (step === 'size') {
      return (
        <div className="fs-gp-chip-groups">
          <div className="fs-gp-chip-label">Team size</div>
          <div className="fs-gp-chips">
            {TEAM_OPTIONS.map((t) => (
              <button
                key={t}
                type="button"
                className={`fs-gp-chip${answers.team === t ? ' is-on' : ''}`}
                aria-pressed={answers.team === t}
                onClick={() => answerSize('team', t)}
              >
                {t}
              </button>
            ))}
          </div>
          <div className="fs-gp-chip-label">Locations</div>
          <div className="fs-gp-chips">
            {LOCATION_OPTIONS.map((l) => (
              <button
                key={l}
                type="button"
                className={`fs-gp-chip${answers.locations === l ? ' is-on' : ''}`}
                aria-pressed={answers.locations === l}
                onClick={() => answerSize('locations', l)}
              >
                {l}
              </button>
            ))}
          </div>
        </div>
      );
    }
    if (step === 'musthaves') {
      return (
        <div className="fs-gp-chip-groups">
          {mustHaveOptions.length > 0 && (
            <div className="fs-gp-chips">
              {mustHaveOptions.map((f) => {
                const on = pendingMustHaves.includes(f);
                return (
                  <button
                    key={f}
                    type="button"
                    className={`fs-gp-chip${on ? ' is-on' : ''}`}
                    aria-pressed={on}
                    onClick={() => {
                      const next = on ? pendingMustHaves.filter((x) => x !== f) : [...pendingMustHaves, f];
                      setPendingMustHaves(next);
                      onMustHaves(next);
                    }}
                  >
                    {on && <AppIcon name="check" size={11} />} {f}
                  </button>
                );
              })}
            </div>
          )}
          <div className="fs-gp-chip-actions">
            <button
              type="button"
              className="fs-gp-next"
              disabled={pendingMustHaves.length === 0}
              onClick={() => commitMustHaves(pendingMustHaves)}
            >
              Done{pendingMustHaves.length ? ` (${pendingMustHaves.length})` : ''}
            </button>
            <button type="button" className="fs-gp-skip" onClick={() => commitMustHaves([])}>
              Skip
            </button>
            <span className="fs-gp-live-count">
              {matches.length} match{matches.length === 1 ? '' : 'es'}
            </span>
          </div>
        </div>
      );
    }
    return (
      <div className="fs-gp-chips">
        {TIMELINE_OPTIONS.map((t) => (
          <button key={t.id} type="button" className="fs-gp-chip" onClick={() => answerTimeline(t.id)}>
            {t.label}
          </button>
        ))}
        <button type="button" className="fs-gp-chip fs-gp-chip--ghost" onClick={() => answerTimeline(null)}>
          Skip
        </button>
      </div>
    );
  };

  const renderCard = (r: Ranked, rank?: number) => {
    const s = r.supplier;
    const earnings = supplierEarningsBadge(s);
    const isReferral = s.buyMode === 'referral';
    const recommend = activeMode === 'recommend';
    const interested = isInterested(s.name);
    return (
      <div key={s.name} className={`fs-gp-match${r.alternative ? ' fs-gp-match--alt' : ''}`}>
        <div className="fs-gp-match-top">
          {rank != null && <span className="fs-gp-rank">{rank}</span>}
          <SupplierLogo vendor={s.name} website={s.website} logoUrl={s.logoUrl} size={32} variant="card" />
          <div className="fs-gp-match-head">
            <div className="fs-gp-match-name">
              {s.name}
              {r.alternative && <span className="fs-gp-alt-tag">Alternative</span>}
            </div>
            {earnings && <span className="fs-badge fs-badge--cashback">{earnings}</span>}
          </div>
        </div>
        {r.why && <p className="fs-gp-match-why">{r.why}</p>}
        <div className="fs-gp-match-actions">
          <button type="button" className="fs-card-btn" onClick={() => onViewDetails(s.name)}>
            View details
          </button>
          {isReferral ? (
            <button type="button" className="fs-card-btn fs-card-btn--primary" onClick={() => onOrder(s)}>
              Order <AppIcon name="external" size={11} />
            </button>
          ) : recommend ? (
            <button type="button" className="fs-card-btn fs-card-btn--primary" onClick={() => onBuildQuote(s)}>
              Build quote request
            </button>
          ) : (
            <button
              type="button"
              className={`fs-card-btn fs-card-btn--primary${interested ? ' is-on' : ''}`}
              aria-pressed={interested}
              onClick={() => onToggleInterested(s)}
            >
              {interested ? '✓ Interested' : '+ Interested'}
            </button>
          )}
        </div>
      </div>
    );
  };

  const renderResults = () => {
    if (step !== 'done') return null;
    if (activeMode === 'recommend') {
      if (!ranked) return null;
      return (
        <div className="fs-gp-results">
          <div className="fs-gp-msg fs-gp-msg--frank">{ranked.summary}</div>
          {ranked.items.map((r, i) => renderCard(r, r.alternative ? undefined : i + 1))}
        </div>
      );
    }
    return (
      <div className="fs-gp-results">
        <div className="fs-gp-msg fs-gp-msg--frank">{summary}</div>
        {top3.map((s) => renderCard({ supplier: s, why: offersLine(s) ?? whyLine(s, mustHaves) }))}
        {matches.length > 0 && (
          <button type="button" className="fs-gp-seeall" onClick={onSeeAll}>
            See all {matches.length} match{matches.length === 1 ? '' : 'es'} →
          </button>
        )}
      </div>
    );
  };

  const title = activeMode === 'recommend' ? 'Recommend for me' : 'Guided search';
  const progressPct = step === 'done' ? 100 : Math.round((stepIndex / steps.length) * 100);

  return (
    <aside
      className={`fs-gp${open ? ' is-open' : ''}`}
      aria-label={`Frank — ${title}`}
      aria-hidden={!open}
      inert={!open}
    >
      <header className="fs-gp-head">
        <div className="fs-gp-title">
          <span className="fs-gp-avatar" aria-hidden>
            <AppIcon name="hank" size={14} />
          </span>
          <div>
            <div className="fs-gp-title-main">Frank · {title}</div>
            <div className="fs-gp-step">
              {step === 'done'
                ? activeMode === 'recommend'
                  ? 'Your ranking'
                  : 'Your matches'
                : `Step ${stepIndex + 1} of ${steps.length}`}
            </div>
          </div>
        </div>
        <button type="button" className="fs-gp-close" onClick={onClose} aria-label="Close guided search">
          <AppIcon name="close" size={14} />
        </button>
      </header>
      <div className="fs-gp-progress" aria-hidden>
        <span style={{ width: `${progressPct}%` }} />
      </div>
      <div className="fs-gp-nav">
        <button type="button" className="fs-gp-navbtn" onClick={goBack} disabled={!canGoBack || busy}>
          ← Back
        </button>
        <button type="button" className="fs-gp-navbtn" onClick={startOver} disabled={busy}>
          Start over
        </button>
      </div>

      <div className="fs-gp-body" ref={bodyRef}>
        {messages.map((m) => (
          <div key={m.id} className={`fs-gp-msg fs-gp-msg--${m.from}`}>
            {m.text}
          </div>
        ))}
        {renderChips()}
        {busy && (
          <div className="fs-gp-msg fs-gp-msg--frank">
            <div className="typing">
              <span />
              <span />
              <span />
            </div>
          </div>
        )}
        {renderResults()}
      </div>

      <form
        className="fs-gp-input"
        onSubmit={(e) => {
          e.preventDefault();
          void sendFreeText();
        }}
      >
        <input
          value={input}
          onChange={(e) => setInput(e.target.value)}
          placeholder={step === 'done' ? 'Ask Frank about these matches…' : 'Or type it — e.g. 40 users, two offices'}
          aria-label="Message Frank"
          disabled={busy}
        />
        <button type="submit" disabled={busy || !input.trim()} aria-label="Send">
          <AppIcon name="send" size={13} />
        </button>
      </form>
    </aside>
  );
}
