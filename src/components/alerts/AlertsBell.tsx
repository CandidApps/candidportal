'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon, type AppIconName } from '@/components/AppIcon';

export type AlertAction = {
  label: string;
  icon?: AppIconName;
  onClick: () => void;
  primary?: boolean;
};

export type AlertItem = {
  id: string;
  icon: AppIconName;
  severity: 'urgent' | 'info' | 'success';
  title: string;
  body?: string;
  time?: string;
  unread?: boolean;
  /** Primary click for the whole row (deep-link to the relevant screen). */
  onOpen?: () => void;
  actions?: AlertAction[];
};

/**
 * Topbar notification bell + dropdown panel, shared by the admin and customer
 * portals (TASK-024). Surfaces new/actionable items with deep-links and
 * per-item quick actions (call back, message, add task, etc.).
 */
export function AlertsBell({
  items,
  unreadCount,
  onOpenChange,
  emptyLabel = "You're all caught up.",
  title = 'Alerts',
}: {
  items: AlertItem[];
  unreadCount?: number;
  onOpenChange?: (open: boolean) => void;
  emptyLabel?: string;
  title?: string;
}) {
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);
  const badge = unreadCount ?? items.filter((i) => i.unread).length;

  useEffect(() => {
    if (!open) return;
    const onDoc = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        onOpenChange?.(false);
      }
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [open, onOpenChange]);

  const toggle = () => {
    const next = !open;
    setOpen(next);
    onOpenChange?.(next);
  };

  return (
    <div className="alerts-bell-wrap" ref={wrapRef}>
      <button
        type="button"
        className="topbar-notif"
        onClick={toggle}
        aria-label={badge > 0 ? `${title} (${badge} new)` : title}
        aria-expanded={open}
      >
        <AppIcon name="alerts" />
        {badge > 0 && <span className="notif-dot" />}
      </button>
      {open && (
        <div className="alerts-panel" role="dialog" aria-label={title}>
          <div className="alerts-panel-head">
            <span className="alerts-panel-title">{title}</span>
            {badge > 0 && <span className="alerts-panel-count">{badge} new</span>}
          </div>
          <div className="alerts-panel-body">
            {items.length === 0 ? (
              <div className="alerts-panel-empty">
                <AppIcon name="check" size={18} />
                <span>{emptyLabel}</span>
              </div>
            ) : (
              items.map((item) => (
                <div key={item.id} className={`alerts-row${item.unread ? ' unread' : ''}`}>
                  <span className={`alerts-row-icon alerts-row-icon--${item.severity}`}>
                    <AppIcon name={item.icon} size={14} />
                  </span>
                  <div className="alerts-row-body">
                    <button
                      type="button"
                      className="alerts-row-main"
                      onClick={() => {
                        item.onOpen?.();
                        setOpen(false);
                        onOpenChange?.(false);
                      }}
                      disabled={!item.onOpen}
                    >
                      <span className="alerts-row-title">{item.title}</span>
                      {item.body && <span className="alerts-row-sub">{item.body}</span>}
                      {item.time && <span className="alerts-row-time">{item.time}</span>}
                    </button>
                    {item.actions && item.actions.length > 0 && (
                      <div className="alerts-row-actions">
                        {item.actions.map((a, i) => (
                          <button
                            key={i}
                            type="button"
                            className={`alerts-row-btn${a.primary ? ' primary' : ''}`}
                            onClick={() => {
                              a.onClick();
                              setOpen(false);
                              onOpenChange?.(false);
                            }}
                          >
                            {a.icon && <AppIcon name={a.icon} size={11} />} {a.label}
                          </button>
                        ))}
                      </div>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
}
