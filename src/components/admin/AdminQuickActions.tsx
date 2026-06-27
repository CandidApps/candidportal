'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon, type AppIconName } from '@/components/AppIcon';

export type QuickAction = { id: string; label: string; icon: AppIconName; onClick: () => void };

/** "+" quick-actions button next to the admin global search (TASK-031). */
export function AdminQuickActions({ actions }: { actions: QuickAction[] }) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open]);

  return (
    <div className="quick-actions-wrap" ref={wrapRef}>
      <button
        type="button"
        className="quick-actions-btn"
        onClick={() => setOpen((o) => !o)}
        aria-label="Quick actions"
        aria-expanded={open}
      >
        <AppIcon name="add" size={16} />
      </button>
      {open && (
        <div className="quick-actions-menu" role="menu">
          <div className="quick-actions-head">Create</div>
          {actions.map((a) => (
            <button
              key={a.id}
              type="button"
              className="quick-actions-item"
              onClick={() => {
                a.onClick();
                setOpen(false);
              }}
            >
              <span className="quick-actions-item-icon"><AppIcon name={a.icon} size={13} /></span>
              {a.label}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
