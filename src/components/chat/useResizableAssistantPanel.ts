'use client';

import { useEffect, useRef, useState } from 'react';

const PANEL_SIZE_KEY = 'candid.frankPanelSize.v1';
const PANEL_MIN_W = 320;
const PANEL_MIN_H = 360;

type PanelSize = { w: number; h: number };

function clampPanelSize(size: PanelSize): PanelSize {
  const maxW = Math.max(PANEL_MIN_W, window.innerWidth - 48);
  const maxH = Math.max(PANEL_MIN_H, window.innerHeight - 120);
  return {
    w: Math.round(Math.min(maxW, Math.max(PANEL_MIN_W, size.w))),
    h: Math.round(Math.min(maxH, Math.max(PANEL_MIN_H, size.h))),
  };
}

function loadPanelSize(): PanelSize | null {
  try {
    const raw = window.localStorage.getItem(PANEL_SIZE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<PanelSize>;
    if (typeof parsed.w !== 'number' || typeof parsed.h !== 'number') return null;
    return clampPanelSize({ w: parsed.w, h: parsed.h });
  } catch {
    return null;
  }
}

/** Panel is anchored bottom-right, so the grip sits top-left and dragging up/left grows it. */
export function useResizableAssistantPanel() {
  const panelRef = useRef<HTMLDivElement>(null);
  const [size, setSize] = useState<PanelSize | null>(null);
  const [narrow, setNarrow] = useState(false);
  const drag = useRef<{ x: number; y: number; w: number; h: number; last: PanelSize } | null>(null);

  useEffect(() => {
    setSize(loadPanelSize());
    const mq = window.matchMedia('(max-width: 768px)');
    const applyMq = () => setNarrow(mq.matches);
    applyMq();
    mq.addEventListener('change', applyMq);
    const onResize = () => setSize((prev) => (prev ? clampPanelSize(prev) : prev));
    window.addEventListener('resize', onResize);
    return () => {
      mq.removeEventListener('change', applyMq);
      window.removeEventListener('resize', onResize);
    };
  }, []);

  const onPointerDown = (e: React.PointerEvent<HTMLElement>) => {
    if (e.button !== 0 || !panelRef.current) return;
    e.preventDefault();
    e.stopPropagation();
    e.currentTarget.setPointerCapture?.(e.pointerId);
    const rect = panelRef.current.getBoundingClientRect();
    const start = { w: rect.width, h: rect.height };
    drag.current = { x: e.clientX, y: e.clientY, ...start, last: start };
  };

  const onPointerMove = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    const next = clampPanelSize({ w: d.w + (d.x - e.clientX), h: d.h + (d.y - e.clientY) });
    d.last = next;
    setSize(next);
  };

  const onPointerUp = (e: React.PointerEvent<HTMLElement>) => {
    const d = drag.current;
    if (!d) return;
    drag.current = null;
    try {
      e.currentTarget.releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
    try {
      window.localStorage.setItem(PANEL_SIZE_KEY, JSON.stringify(d.last));
    } catch {
      /* storage unavailable */
    }
  };

  const reset = () => {
    setSize(null);
    try {
      window.localStorage.removeItem(PANEL_SIZE_KEY);
    } catch {
      /* storage unavailable */
    }
  };

  const panelStyle: React.CSSProperties | undefined =
    size && !narrow ? { width: size.w, height: size.h, maxHeight: 'none' } : undefined;

  return {
    panelRef,
    panelStyle,
    sized: Boolean(panelStyle),
    resizable: !narrow,
    gripProps: {
      onPointerDown,
      onPointerMove,
      onPointerUp,
      onPointerCancel: onPointerUp,
      onDoubleClick: reset,
    },
  };
}
