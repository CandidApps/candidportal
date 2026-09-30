'use client';

import { useCallback, useEffect, useRef, useState, type CSSProperties } from 'react';
import { PromoSlide } from '@/components/member/PromoSlide';
import type { MemberPromoSlide } from '@/lib/member-promos';

const AUTO_ADVANCE_MS = 6000;
const SWIPE_MIN_PX = 40;
const DISMISS_KEY = 'candid:fs-promo-slider-dismissed';

function prefersReducedMotion(): boolean {
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
}

/** Find Solutions promo carousel. Hidden when there are no slides or the member dismissed it this session. */
export function PromoSlider({
  slides,
  onViewOffer,
}: {
  slides: MemberPromoSlide[];
  onViewOffer: (slide: MemberPromoSlide) => void;
}) {
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [dismissed, setDismissed] = useState(false);
  const touchStartX = useRef<number | null>(null);
  const count = slides.length;

  useEffect(() => {
    try {
      setDismissed(sessionStorage.getItem(DISMISS_KEY) === '1');
    } catch {
      /* storage unavailable */
    }
  }, []);

  useEffect(() => {
    if (index >= count) setIndex(0);
  }, [count, index]);

  const go = useCallback(
    (delta: number) => setIndex((i) => (count ? (i + delta + count) % count : 0)),
    [count],
  );

  useEffect(() => {
    if (count < 2 || paused || dismissed || prefersReducedMotion()) return;
    const t = window.setInterval(() => go(1), AUTO_ADVANCE_MS);
    return () => window.clearInterval(t);
  }, [count, paused, dismissed, go]);

  if (count === 0 || dismissed) return null;

  const dismiss = () => {
    setDismissed(true);
    try {
      sessionStorage.setItem(DISMISS_KEY, '1');
    } catch {
      /* storage unavailable */
    }
  };

  const active = Math.min(index, count - 1);

  return (
    <section
      className="promo-slider"
      aria-roledescription="carousel"
      aria-label="Supplier promos"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onFocus={() => setPaused(true)}
      onBlur={(e) => {
        if (!e.currentTarget.contains(e.relatedTarget as Node | null)) setPaused(false);
      }}
      onKeyDown={(e) => {
        if (e.key === 'ArrowLeft') go(-1);
        if (e.key === 'ArrowRight') go(1);
      }}
      onTouchStart={(e) => {
        touchStartX.current = e.touches[0]?.clientX ?? null;
      }}
      onTouchEnd={(e) => {
        const start = touchStartX.current;
        touchStartX.current = null;
        const end = e.changedTouches[0]?.clientX;
        if (start == null || end == null) return;
        const dx = end - start;
        if (Math.abs(dx) >= SWIPE_MIN_PX) go(dx < 0 ? 1 : -1);
      }}
    >
      <div className="promo-slider-viewport" aria-live={paused ? 'polite' : 'off'}>
        <div
          className={`promo-slider-track${count > 1 ? ' promo-slider-track--peek' : ''}`}
          style={{ '--promo-index': active } as CSSProperties}
        >
          {slides.map((s, i) => (
            <div
              key={s.id}
              className="promo-slider-slide"
              role="group"
              aria-roledescription="slide"
              aria-label={`${i + 1} of ${count}`}
              aria-hidden={i !== active}
              onClick={i !== active ? () => setIndex(i) : undefined}
            >
              <div className="promo-slider-slide-inner" inert={i !== active}>
                <PromoSlide slide={s} onCta={() => onViewOffer(s)} />
              </div>
            </div>
          ))}
        </div>
      </div>

      <button type="button" className="promo-slider-dismiss" aria-label="Hide promos" onClick={dismiss}>
        ×
      </button>

      {count > 1 && (
        <div className="promo-slider-controls">
          <button type="button" className="promo-slider-arrow" aria-label="Previous promo" onClick={() => go(-1)}>
            ‹
          </button>
          <div className="promo-slider-dots" role="tablist" aria-label="Choose promo">
            {slides.map((s, i) => (
              <button
                key={s.id}
                type="button"
                role="tab"
                aria-selected={i === index}
                aria-label={`Promo ${i + 1}: ${s.supplierName}`}
                className={`promo-slider-dot${i === index ? ' is-on' : ''}`}
                onClick={() => setIndex(i)}
              />
            ))}
          </div>
          <span className="promo-slider-count">
            {index + 1} / {count}
          </span>
          <button type="button" className="promo-slider-arrow" aria-label="Next promo" onClick={() => go(1)}>
            ›
          </button>
        </div>
      )}
    </section>
  );
}
