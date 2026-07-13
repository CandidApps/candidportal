'use client';

import { useState } from 'react';
import { AdminMarketingHubView } from '@/components/admin/AdminMarketingHubView';
import { AdminZohoComposeHost } from '@/components/admin/AdminZohoComposeHost';
import { MarketingAssetComposeBridge } from '@/components/admin/MarketingAssetComposeBridge';
import { MarketingAssetPickerHost } from '@/components/admin/MarketingAssetPickerHost';
import { CandidLogo } from '@/components/CandidLogo';
import { CustomIcon } from '@/components/CustomIcon';
import { PortalSidebar, SidebarNavItem } from '@/components/PortalSidebar';
import { ADMIN_VIEW_TITLES } from '@/lib/candid-data';

export type AgentSessionUser = { email: string; name?: string | null };

function agentDisplayName(user: AgentSessionUser): string {
  if (user.name?.trim()) return user.name.trim();
  const local = user.email.split('@')[0] ?? 'Agent';
  return local.replace(/[._-]+/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
}

/** Agent portal shell — marketing hub access for field agents. */
export default function AgentApp({
  sessionUser,
  signOutAction,
}: {
  sessionUser: AgentSessionUser;
  signOutAction?: () => Promise<void>;
}) {
  const [collapsed, setCollapsed] = useState(false);
  const name = agentDisplayName(sessionUser);

  const doLogout = () => {
    if (signOutAction) void signOutAction();
  };

  return (
    <div className="app-shell" style={{ minHeight: '100vh' }}>
      <PortalSidebar
        className="sidebar"
        collapsed={collapsed}
        onToggleCollapsed={() => setCollapsed((v) => !v)}
        userName={name}
        userCompany="Candid Agent"
        userBadge="Agent"
        showUserBlock={false}
        logo={<CandidLogo size="sb" compact={collapsed} />}
        onLogout={doLogout}
      >
        <SidebarNavItem
          active
          icon={<CustomIcon name="marketingHub" />}
          label="Marketing Hub"
          onClick={() => {}}
        />
      </PortalSidebar>

      <div className="main-area">
        <div className="topbar">
          <div className="topbar-title">{ADMIN_VIEW_TITLES.marketinghub}</div>
        </div>
        <div className="main-content">
          <AdminMarketingHubView mode="agent" />
        </div>
        <AdminZohoComposeHost />
        <MarketingAssetPickerHost />
        <MarketingAssetComposeBridge />
      </div>
    </div>
  );
}
