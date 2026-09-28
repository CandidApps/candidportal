'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from '@/components/AppIcon';

function ToolButton({
  label,
  active,
  pressed,
  collapsed,
  onClick,
  icon,
  floatWhenCovered = false,
}: {
  label: string;
  active?: boolean;
  pressed?: boolean;
  collapsed: boolean;
  onClick: () => void;
  icon: 'roadmap' | 'chart' | 'crosshairs';
  /** Mirror the button above modal overlays when something covers it. */
  floatWhenCovered?: boolean;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [tipPos, setTipPos] = useState<{ top: number; left: number; side: 'top' | 'right' } | null>(
    null,
  );
  const [coveredRect, setCoveredRect] = useState<DOMRect | null>(null);

  useEffect(() => {
    if (!floatWhenCovered) return;
    const check = () => {
      const btn = btnRef.current;
      const rect = btn?.getBoundingClientRect();
      if (!btn || !rect || rect.width === 0 || rect.height === 0) {
        setCoveredRect(null);
        return;
      }
      const hit = document
        .elementsFromPoint(rect.left + rect.width / 2, rect.top + rect.height / 2)
        .find((el) => !el.closest('.sb-product-tools-float'));
      if (!hit || btn.contains(hit)) {
        setCoveredRect(null);
        return;
      }
      setCoveredRect((prev) =>
        prev &&
        prev.left === rect.left &&
        prev.top === rect.top &&
        prev.width === rect.width &&
        prev.height === rect.height
          ? prev
          : rect,
      );
    };
    check();
    const id = window.setInterval(check, 400);
    window.addEventListener('resize', check);
    return () => {
      window.clearInterval(id);
      window.removeEventListener('resize', check);
    };
  }, [floatWhenCovered]);

  const showTip = () => {
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const rect = btnRef.current?.getBoundingClientRect();
    if (!rect) return;
    if (collapsed) {
      setTipPos({
        top: rect.top + rect.height / 2,
        left: rect.right + 10,
        side: 'right',
      });
    } else {
      setTipPos({
        top: rect.top - 8,
        left: rect.left + rect.width / 2,
        side: 'top',
      });
    }
  };

  const hideTip = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setTipPos(null), 80);
  };

  useEffect(() => {
    return () => {
      if (closeTimer.current) window.clearTimeout(closeTimer.current);
    };
  }, []);

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className={`sb-product-tools-btn${active || pressed ? ' is-active' : ''}`}
        aria-label={label}
        aria-pressed={pressed}
        onClick={onClick}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        <AppIcon name={icon} size={15} />
      </button>
      {coveredRect &&
        typeof document !== 'undefined' &&
        createPortal(
          <button
            type="button"
            className={`sb-product-tools-btn sb-product-tools-float${active || pressed ? ' is-active' : ''}`}
            aria-label={label}
            aria-pressed={pressed}
            title={label}
            onClick={onClick}
            style={{
              top: coveredRect.top,
              left: coveredRect.left,
              width: coveredRect.width,
              height: coveredRect.height,
            }}
          >
            <AppIcon name={icon} size={15} />
          </button>,
          document.body,
        )}
      {tipPos &&
        typeof document !== 'undefined' &&
        createPortal(
          <div
            className={`sb-product-tools-tip-portal sb-product-tools-tip-portal--${tipPos.side}`}
            style={
              tipPos.side === 'top'
                ? { top: tipPos.top, left: tipPos.left, transform: 'translate(-50%, -100%)' }
                : { top: tipPos.top, left: tipPos.left, transform: 'translateY(-50%)' }
            }
            role="tooltip"
          >
            {label}
          </div>,
          document.body,
        )}
    </>
  );
}

export function AdminProductToolsStrip({
  collapsed = false,
  roadmapActive,
  analyticsOpen,
  captureActive,
  onRoadmap,
  onAnalytics,
  onCapture,
  className = '',
}: {
  collapsed?: boolean;
  roadmapActive: boolean;
  analyticsOpen: boolean;
  captureActive: boolean;
  onRoadmap: () => void;
  onAnalytics: () => void;
  onCapture: () => void;
  className?: string;
}) {
  return (
    <div
      className={`sb-product-tools${className ? ` ${className}` : ''}`}
      role="toolbar"
      aria-label="Product tools"
    >
      <ToolButton
        label="Product roadmap"
        active={roadmapActive}
        collapsed={collapsed}
        icon="roadmap"
        onClick={onRoadmap}
      />
      <ToolButton
        label="Analytics"
        pressed={analyticsOpen}
        collapsed={collapsed}
        icon="chart"
        onClick={onAnalytics}
      />
      <ToolButton
        label="Capture change request"
        pressed={captureActive}
        collapsed={collapsed}
        icon="crosshairs"
        onClick={onCapture}
        floatWhenCovered
      />
    </div>
  );
}
