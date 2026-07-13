'use client';

import type { ReactNode } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { CustomIcon } from '@/components/CustomIcon';
import {
  SidebarAccordion,
  SidebarDraggableSection,
  SidebarFlyout,
  SidebarNavItem,
} from '@/components/PortalSidebar';
import type { AdminMainNavId } from '@/lib/admin-sidebar-order';
import { ACTION_CENTER_TABS, type ActionCenterTab } from '@/components/admin/AdminActionCenterView';

type AdminView = AdminMainNavId | 'expenses' | 'custmessages' | 'adminsettings';

export type AdminSidebarNavProps = {
  order: AdminMainNavId[];
  onReorder: (next: AdminMainNavId[]) => void;
  collapsed: boolean;
  adminView: AdminView;
  setAdminView: (view: AdminView) => void;
  closeThemePicker: () => void;
  closeMerchantAnalysis: () => void;
  actionCenterOpen: boolean;
  setActionCenterOpen: (open: boolean | ((v: boolean) => boolean)) => void;
  actionCenterTab: ActionCenterTab;
  setActionCenterTab: (tab: ActionCenterTab) => void;
  selectedAnalysisReviewId: string | null;
  setSelectedAnalysisReviewId: (id: string | null) => void;
  selectedQuoteRequestId: string | null;
  setSelectedQuoteRequestId: (id: string | null) => void;
  selectedCustomerMessageThreadId: string | null;
  setSelectedCustomerMessageThreadId: (id: string | null) => void;
  adminCustomerId: string | null;
  setAdminCustomerId: (id: string | null) => void;
  adminSupplierId: string | null;
  setAdminSupplierId: (id: string | null) => void;
  adminCommissionPartnerKey: string | null;
  setAdminCommissionPartnerKey: (key: string | null) => void;
  merchantAnalysisView: boolean;
  proposalAnalysisView: boolean;
  adminOpenTicketCount: number;
  actionCenterOpenCountByTab: Record<string, number>;
  unreadCustomerMessageCount: number;
  setMessageCenterSection: (section: 'team' | 'customers') => void;
};

function renderSection(id: AdminMainNavId, p: AdminSidebarNavProps): ReactNode {
  switch (id) {
    case 'assistant':
      return (
        <SidebarNavItem
          active={p.adminView === 'assistant'}
          icon={<CustomIcon name="chatbot" />}
          label="MyAssistant"
          onClick={() => {
            p.closeThemePicker();
            p.closeMerchantAnalysis();
            p.setAdminView('assistant');
          }}
        />
      );
    case 'tickets':
      return (
        <SidebarAccordion
          collapsed={p.collapsed}
          open={p.actionCenterOpen}
          onToggle={() => {
            if (p.collapsed) {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setAdminView('tickets');
              return;
            }
            if (p.adminView !== 'tickets') {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setAdminView('tickets');
              p.setActionCenterOpen(true);
              return;
            }
            p.setActionCenterOpen((open) => !open);
          }}
          active={p.adminView === 'tickets'}
          icon={<CustomIcon name="tasks" />}
          label="Action Center"
          badge={p.adminOpenTicketCount > 0 ? String(p.adminOpenTicketCount) : undefined}
        >
          {ACTION_CENTER_TABS.map((item) => (
            <SidebarNavItem
              key={item.id}
              active={
                p.adminView === 'tickets'
                && p.actionCenterTab === item.id
                && !p.selectedAnalysisReviewId
                && !p.selectedQuoteRequestId
              }
              className="sub"
              label={item.label}
              badge={
                p.actionCenterOpenCountByTab[item.id] > 0
                  ? String(p.actionCenterOpenCountByTab[item.id])
                  : undefined
              }
              onClick={() => {
                p.closeThemePicker();
                p.closeMerchantAnalysis();
                p.setAdminView('tickets');
                p.setActionCenterTab(item.id);
                p.setSelectedAnalysisReviewId(null);
                p.setSelectedQuoteRequestId(null);
                p.setSelectedCustomerMessageThreadId(null);
                p.setActionCenterOpen(true);
              }}
            />
          ))}
        </SidebarAccordion>
      );
    case 'customers':
      return (
        <>
          <SidebarNavItem
            active={p.adminView === 'customers' || !!p.merchantAnalysisView || !!p.proposalAnalysisView}
            icon={<CustomIcon name="building" />}
            label="Accounts"
            onClick={() => {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setAdminCustomerId(null);
              p.setAdminView('customers');
            }}
          />
          {p.adminView === 'customers' && p.adminCustomerId ? (
            <SidebarNavItem
              active={false}
              className="sub"
              icon={<AppIcon name="panelCollapse" size={13} />}
              label="Back to list"
              onClick={() => p.setAdminCustomerId(null)}
            />
          ) : null}
        </>
      );
    case 'leads':
      return (
        <SidebarNavItem
          active={p.adminView === 'leads'}
          icon={<CustomIcon name="userTarget" />}
          label="Leads"
          onClick={() => {
            p.closeThemePicker();
            p.closeMerchantAnalysis();
            p.setAdminView('leads');
          }}
        />
      );
    case 'agents':
      return (
        <SidebarNavItem
          active={p.adminView === 'agents'}
          icon={<CustomIcon name="team" />}
          label="Agents & Team"
          onClick={() => {
            p.closeThemePicker();
            p.closeMerchantAnalysis();
            p.setAdminView('agents');
          }}
        />
      );
    case 'commissions':
      return (
        <SidebarFlyout
          collapsed={p.collapsed}
          title="Commissions"
          parent={
            <SidebarNavItem
              active={p.adminView === 'commissions'}
              icon={<CustomIcon name="coins" />}
              label="Commissions"
              onClick={() => {
                p.closeThemePicker();
                p.closeMerchantAnalysis();
                p.setAdminView('commissions');
              }}
            />
          }
        >
          <SidebarNavItem
            active={p.adminView === 'expenses'}
            className="sub"
            label="My Expenses"
            onClick={() => {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setAdminView('expenses');
            }}
          />
        </SidebarFlyout>
      );
    case 'partners':
      return (
        <>
          <SidebarNavItem
            active={p.adminView === 'partners'}
            icon={<CustomIcon name="network" />}
            label="Partners"
            onClick={() => {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setAdminSupplierId(null);
              p.setAdminCommissionPartnerKey(null);
              p.setAdminView('partners');
            }}
          />
          {p.adminView === 'partners' && (p.adminSupplierId || p.adminCommissionPartnerKey) ? (
            <SidebarNavItem
              active={false}
              className="sub"
              icon={<AppIcon name="panelCollapse" size={13} />}
              label="Back to list"
              onClick={() => {
                p.setAdminSupplierId(null);
                p.setAdminCommissionPartnerKey(null);
              }}
            />
          ) : null}
        </>
      );
    case 'marketinghub':
      return (
        <SidebarNavItem
          active={p.adminView === 'marketinghub'}
          icon={<CustomIcon name="marketingHub" />}
          label="Marketing Hub"
          onClick={() => {
            p.closeThemePicker();
            p.closeMerchantAnalysis();
            p.setAdminView('marketinghub');
          }}
        />
      );
    case 'messages':
      return (
        <SidebarFlyout
          collapsed={p.collapsed}
          title="Message Center"
          parent={
            <SidebarNavItem
              active={p.adminView === 'messages' || p.adminView === 'custmessages'}
              icon={<CustomIcon name="chatBubble" />}
              label="Message Center"
              onClick={() => {
                p.closeThemePicker();
                p.closeMerchantAnalysis();
                p.setMessageCenterSection('team');
                p.setSelectedCustomerMessageThreadId(null);
                p.setAdminView('messages');
              }}
            />
          }
        >
          <SidebarNavItem
            active={p.adminView === 'messages'}
            className="sub"
            label="Team messages"
            onClick={() => {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setMessageCenterSection('team');
              p.setSelectedCustomerMessageThreadId(null);
              p.setAdminView('messages');
            }}
          />
          <SidebarNavItem
            active={p.adminView === 'custmessages'}
            className="sub"
            label="Customer messages"
            badge={
              p.unreadCustomerMessageCount > 0 ? String(p.unreadCustomerMessageCount) : undefined
            }
            onClick={() => {
              p.closeThemePicker();
              p.closeMerchantAnalysis();
              p.setMessageCenterSection('customers');
              p.setAdminView('custmessages');
            }}
          />
        </SidebarFlyout>
      );
    default: {
      const _exhaustive: never = id;
      return _exhaustive;
    }
  }
}

export function AdminSidebarNav(props: AdminSidebarNavProps) {
  const { order, onReorder, collapsed } = props;
  return (
    <>
      {order.map((id) => (
        <SidebarDraggableSection
          key={id}
          id={id}
          order={order}
          onReorder={onReorder}
          collapsed={collapsed}
        >
          {renderSection(id, props)}
        </SidebarDraggableSection>
      ))}
    </>
  );
}
