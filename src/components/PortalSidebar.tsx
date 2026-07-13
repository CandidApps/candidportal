'use client';

import { useRef, useState, type DragEvent, type ReactNode } from 'react';
import { createPortal } from 'react-dom';
import { AppIcon } from '@/components/AppIcon';
import type { AdminMainNavId } from '@/lib/admin-sidebar-order';
import { reorderAdminSidebar } from '@/lib/admin-sidebar-order';

function formatSidebarBadgeCount(badge: string): string {
  const n = Number.parseInt(badge, 10);
  if (!Number.isNaN(n) && n > 99) return '99+';
  return badge;
}

type PortalSidebarProps = {
  collapsed: boolean;
  onToggleCollapsed: () => void;
  userName: string;
  userCompany: string;
  userBadge: string;
  logo: ReactNode;
  children: ReactNode;
  onLogout: () => void;
  bottomSlot?: ReactNode;
  className?: string;
  /** When false, hides the name / company / badge block above nav (admin shell). */
  showUserBlock?: boolean;
};

export function PortalSidebar({
  collapsed,
  onToggleCollapsed,
  userName,
  userCompany,
  userBadge,
  logo,
  children,
  onLogout,
  bottomSlot,
  className = 'sidebar',
  showUserBlock = true,
}: PortalSidebarProps) {
  return (
    <aside className={className} aria-label="Main navigation">
      <div className="sb-logo">
        {logo}
        <button
          type="button"
          className="sb-toggle"
          onClick={onToggleCollapsed}
          aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
        >
          <AppIcon name={collapsed ? 'panelExpand' : 'panelCollapse'} size={14} />
        </button>
      </div>
      {showUserBlock ? (
        <div className="sb-user">
          <div className="sb-user-name">{userName}</div>
          <div className="sb-user-co">{userCompany}</div>
          <div className="sb-user-badge">{userBadge}</div>
        </div>
      ) : null}
      <nav className="sb-nav">{children}</nav>
      <div className="sb-bottom">
        {bottomSlot}
        <div className="sb-logout" onClick={onLogout} title="Sign out">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
            <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
            <polyline points="16 17 21 12 16 7" />
            <line x1="21" y1="12" x2="9" y2="12" />
          </svg>
          <span className="sb-label">Sign Out</span>
        </div>
      </div>
    </aside>
  );
}

/** Wraps a main sidebar section so it can be reordered via drag handle (not sub-items). */
export function SidebarDraggableSection({
  id,
  order,
  onReorder,
  collapsed = false,
  children,
}: {
  id: AdminMainNavId;
  order: AdminMainNavId[];
  onReorder: (next: AdminMainNavId[]) => void;
  collapsed?: boolean;
  children: ReactNode;
}) {
  const [dragOver, setDragOver] = useState(false);
  const draggingId = useRef<AdminMainNavId | null>(null);

  const onDragStart = (e: DragEvent) => {
    draggingId.current = id;
    e.dataTransfer.setData('text/plain', id);
    e.dataTransfer.effectAllowed = 'move';
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.add('sb-drag-handle--active');
    }
  };

  const onDragEnd = (e: DragEvent) => {
    draggingId.current = null;
    setDragOver(false);
    if (e.currentTarget instanceof HTMLElement) {
      e.currentTarget.classList.remove('sb-drag-handle--active');
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const fromId = (e.dataTransfer.getData('text/plain') || draggingId.current) as AdminMainNavId;
    if (!fromId || fromId === id) return;
    onReorder(reorderAdminSidebar(order, fromId, id));
  };

  return (
    <div
      className={`sb-drag-section${dragOver ? ' sb-drag-section--over' : ''}`}
      onDragOver={(e) => {
        e.preventDefault();
        e.dataTransfer.dropEffect = 'move';
        setDragOver(true);
      }}
      onDragLeave={() => setDragOver(false)}
      onDrop={onDrop}
    >
      {!collapsed ? (
        <span
          className="sb-drag-handle"
          draggable
          onDragStart={onDragStart}
          onDragEnd={onDragEnd}
          title="Drag to reorder"
          aria-label="Drag to reorder"
          onClick={(e) => e.stopPropagation()}
          onMouseDown={(e) => e.stopPropagation()}
        />
      ) : null}
      <div className="sb-drag-content">{children}</div>
    </div>
  );
}

export function SidebarNavItem({
  active,
  icon,
  label,
  onClick,
  className = '',
  badge,
  trailing,
}: {
  active: boolean;
  icon?: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  badge?: string;
  trailing?: ReactNode;
}) {
  return (
    <div
      className={`sb-item${className ? ` ${className}` : ''}${active ? ' active' : ''}`}
      onClick={onClick}
      title={label}
    >
      {icon ? (
        <span className="sb-icon">
          {icon}
          {badge ? (
            <span className="sb-icon-badge" aria-hidden>
              {formatSidebarBadgeCount(badge)}
            </span>
          ) : null}
        </span>
      ) : (
        <span className="sb-icon sb-icon--spacer" aria-hidden />
      )}
      <span className="sb-label">{label}</span>
      {badge ? <span className="sb-badge">{badge}</span> : null}
      {trailing ? <span className="sb-item-trailing">{trailing}</span> : null}
    </div>
  );
}

export function SidebarAccordion({
  open,
  onToggle,
  active,
  icon,
  label,
  badge,
  children,
  collapsed = false,
}: {
  open: boolean;
  onToggle: () => void;
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: string;
  children: ReactNode;
  /** When the sidebar is minimized, the accordion cannot expand (no room for
   *  the icon-less / text-less sub-items), so it behaves as a plain nav item. */
  collapsed?: boolean;
}) {
  const showChildren = open && !collapsed;
  return (
    <div className={`sb-accordion${showChildren ? ' sb-accordion--open' : ''}`}>
      <SidebarNavItem
        active={active}
        icon={icon}
        label={label}
        onClick={onToggle}
        badge={badge}
        trailing={
          collapsed ? undefined : (
            <span className={`sb-accordion-chevron${open ? ' is-open' : ''}`} aria-hidden>
              ▾
            </span>
          )
        }
      />
      {showChildren ? <div className="sb-accordion-children">{children}</div> : null}
    </div>
  );
}

/**
 * Groups a parent nav item with sub-item(s). When the sidebar is expanded the
 * children render inline below the parent. When collapsed (icon-only), hovering
 * the parent reveals the children in a flyout panel rendered into a portal so it
 * is never clipped by the sidebar's `overflow: hidden`.
 */
export function SidebarFlyout({
  collapsed,
  title,
  parent,
  children,
}: {
  collapsed: boolean;
  title: string;
  parent: ReactNode;
  children: ReactNode;
}) {
  const groupRef = useRef<HTMLDivElement>(null);
  const closeTimer = useRef<number | null>(null);
  const [pos, setPos] = useState<{ top: number; left: number } | null>(null);

  const open = () => {
    if (!collapsed) return;
    if (closeTimer.current) {
      window.clearTimeout(closeTimer.current);
      closeTimer.current = null;
    }
    const rect = groupRef.current?.getBoundingClientRect();
    if (rect) setPos({ top: rect.top, left: rect.right + 6 });
  };

  const scheduleClose = () => {
    if (closeTimer.current) window.clearTimeout(closeTimer.current);
    closeTimer.current = window.setTimeout(() => setPos(null), 120);
  };

  return (
    <div
      className="sb-flyout-group"
      ref={groupRef}
      onMouseEnter={open}
      onMouseLeave={scheduleClose}
    >
      {parent}
      {collapsed ? (
        pos &&
        createPortal(
          <div
            className="sb-flyout-panel"
            style={{ top: pos.top, left: pos.left }}
            onMouseEnter={open}
            onMouseLeave={scheduleClose}
          >
            <div className="sb-flyout-title">{title}</div>
            {children}
          </div>,
          document.body,
        )
      ) : (
        children
      )}
    </div>
  );
}
