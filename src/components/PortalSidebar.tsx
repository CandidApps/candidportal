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
  className?: string;
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
  className = 'sidebar',
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
      <div className="sb-user">
        <div className="sb-user-name">{userName}</div>
        <div className="sb-user-co">{userCompany}</div>
        <div className="sb-user-badge">{userBadge}</div>
      </div>
      <nav className="sb-nav">{children}</nav>
      <div className="sb-bottom">
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
}: {
  active: boolean;
  icon: ReactNode;
  label: string;
  onClick: () => void;
  className?: string;
  badge?: string;
}) {
  return (
    <div
      className={`sb-item${className ? ` ${className}` : ''}${active ? ' active' : ''}`}
      onClick={onClick}
      title={label}
    >
      <span className="sb-icon">{icon}</span>
      <span className="sb-label">{label}</span>
      {badge ? <span className="sb-badge">{badge}</span> : null}
    </div>
  );
}
