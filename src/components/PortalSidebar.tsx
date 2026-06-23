'use client';

import type { ReactNode } from 'react';
import { AppIcon } from '@/components/AppIcon';

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
      {icon ? <span className="sb-icon">{icon}</span> : <span className="sb-icon sb-icon--spacer" aria-hidden />}
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
}: {
  open: boolean;
  onToggle: () => void;
  active: boolean;
  icon: ReactNode;
  label: string;
  badge?: string;
  children: ReactNode;
}) {
  return (
    <div className={`sb-accordion${open ? ' sb-accordion--open' : ''}`}>
      <SidebarNavItem
        active={active}
        icon={icon}
        label={label}
        onClick={onToggle}
        badge={badge}
        trailing={
          <span className={`sb-accordion-chevron${open ? ' is-open' : ''}`} aria-hidden>
            ▾
          </span>
        }
      />
      {open ? <div className="sb-accordion-children">{children}</div> : null}
    </div>
  );
}
