'use client';

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ChangeEvent,
  type DragEvent,
  type FormEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import {
  accountServiceToCard,
  isCandidServiceInRenewalWindow,
  logoKeyFromLabel,
  type AccountServiceRow,
  type ServiceCardModel,
} from '@/lib/services/account-services';
import {
  callHankAPI,
  detectServiceType,
  serviceProfiles,
  processingMessages,
  ADMIN_VIEW_TITLES,
  MEMBER_VIEW_TITLES,
} from '@/lib/candid-data';
import {
  accountRecurringMonthlySavings,
  formatSavingsMoney,
  quoteSavingsPreview,
} from '@/lib/services/quote-savings';
import { computeServiceSavingsDisplay } from '@/lib/services/service-savings';
import { AppIcon, fileTypeIcon, type AppIconName } from '@/components/AppIcon';
import { CustomIcon, type CustomIconName } from '@/components/CustomIcon';
import { CandidLogo } from '@/components/CandidLogo';
import AnalysisAskPanel from '@/components/AnalysisAskPanel';
import { AnalyzingDotsLabel } from '@/components/AnalyzingDotsLabel';
import StatementEngine from '@/components/StatementEngine';
import { billUploadErrorMessage } from '@/lib/candid-pay/bill-upload-errors';
import {
  buildMerchantAnalysisSnapshot,
  monthlyFeesCents,
  merchantVendorSummary,
  parseMerchantStatementPdf,
  type MerchantAnalysisSnapshot,
} from '@/lib/candid-pay/merchant-analysis';
import {
  fetchAnalysisTicketsForAdmin,
  formatTicketTime,
  type AnalysisTicketRow,
} from '@/lib/services/analysis-tickets';
import { ACTION_CENTER_REFRESH_EVENT, notifyActionCenterRefresh } from '@/lib/action-center-refresh';
import { isCandidAdminEmail } from '@/lib/auth/admin-email';
import { CustomersView, type Contact, type Customer, type Location } from '@/components/CustomersView';
import { CrmDataProvider, useCrmData } from '@/components/CrmDataProvider';
import { INITIAL_LEADS, LeadsView, type Lead } from '@/components/LeadsView';
import { PartnersHubView } from '@/components/PartnersHubView';
import { AdminActionCenterView, ACTION_CENTER_TABS, type ActionCenterTab } from '@/components/admin/AdminActionCenterView';
import CommissionsView from '@/components/commissions/CommissionsView';
import AdminAssistantPanel from '@/components/admin/AdminAssistantPanel';
import AdminAssistantView from '@/components/admin/AdminAssistantView';
import {
  adminViewLabel,
  type AdminHankPageContext,
} from '@/lib/assistant/admin-hank-page-context';
import { mergeCustomerActions } from '@/lib/customer-actions-store';
import { AdminZohoComposeHost } from '@/components/admin/AdminZohoComposeHost';
import { MarketingAssetComposeBridge } from '@/components/admin/MarketingAssetComposeBridge';
import { MarketingAssetPickerHost } from '@/components/admin/MarketingAssetPickerHost';
import { AdminTopbarClock } from '@/components/admin/AdminTopbarClock';
import { AdminMessageCenterView } from '@/components/admin/AdminMessageCenterView';
import { AdminCustomerInboxView } from '@/components/admin/AdminCustomerInboxView';
import { ZohoMailboxMenu } from '@/components/admin/ZohoMailboxMenu';
import { useTheme } from '@/components/ThemeProvider';
import { ThemePickerView } from '@/components/ThemePickerView';
import SuppliersView from '@/components/suppliers/SuppliersView';
import {
  loadSolutionProviders,
  onSolutionProvidersUpdated,
  type SolutionProviderRecord,
} from '@/lib/solution-providers';
import { fetchPartnerSuppliers, type PartnerSupplierRecord } from '@/lib/services/bank-deposits';
import { serviceBillStoragePath } from '@/lib/storage-paths';
import { buildOutreachTicketsFromActionWork, buildUnifiedAdminTickets, dismissDemoStatementReview, type UnifiedAdminTicket } from '@/lib/admin-tickets';
import { mergeActionWorkIntoTickets } from '@/lib/admin-action-work';
import { listOutreachAccounts, OUTREACH_STATUS_LABELS } from '@/lib/outreach';
import type { OutreachAccount } from '@/lib/outreach';
import { fetchActionWorkMap } from '@/lib/team-notes';
import {
  buildAdminGlobalSearchItems,
  buildMemberGlobalSearchItems,
  filterGlobalSearchItems,
  GLOBAL_SEARCH_KIND_LABEL,
  type GlobalSearchItem,
} from '@/lib/global-search';
import { PortalSidebar, SidebarNavItem, SidebarAccordion, SidebarFlyout } from '@/components/PortalSidebar';
import { useHashRoute } from '@/lib/use-hash-route';
import { AlertsBell, type AlertItem } from '@/components/alerts/AlertsBell';
import { DocumentViewerHost } from '@/components/DocumentViewerHost';
import { openDocumentViewer } from '@/lib/document-viewer';
import { MemberMessageCenterView } from '@/components/member/MemberMessageCenterView';
import { AdminQuickActions, type QuickAction } from '@/components/admin/AdminQuickActions';
import { AdminExpensesView } from '@/components/admin/AdminExpensesView';
import { AdminMarketingHubView } from '@/components/admin/AdminMarketingHubView';
import { AdminOutreachView } from '@/components/admin/AdminOutreachView';
import { AdminSidebarEditControls, AdminSidebarNav } from '@/components/admin/AdminSidebarNav';
import {
  ADMIN_MAIN_NAV_IDS,
  defaultAdminSidebarPreferences,
  fetchAdminSidebarPreferences,
  loadCachedAdminSidebarPreferences,
  persistAdminSidebarPreferences,
  visibleAdminSidebarOrder,
  type AdminMainNavId,
  type AdminSidebarPreferences,
} from '@/lib/admin-sidebar-order';
import { AdminSettingsView } from '@/components/admin/AdminSettingsView';
import { WelcomeModal } from '@/components/member/WelcomeModal';
import { AnalysisUnlockGate } from '@/components/member/AnalysisUnlockGate';
import type { SignupPrefill } from '@/lib/marketing/signup';
import {
  SOLUTION_CATEGORIES,
  solutionCategoryLabel,
  type SolutionCategoryId,
} from '@/lib/solutions/catalog';
import { ServiceRequestModal, type ServiceRequestContext } from '@/components/member/ServiceRequestModal';
import { MemberServiceDetailModal } from '@/components/member/MemberServiceDetailModal';
import { ExternalServiceModal } from '@/components/member/ExternalServiceModal';
import { MemberSavingsOpportunitiesView } from '@/components/member/MemberSavingsOpportunitiesView';
import { MemberTechSpendView } from '@/components/member/MemberTechSpendView';
import { MemberSettingsView } from '@/components/member/MemberSettingsView';
import FindSolutionsView from '@/components/member/FindSolutionsView';
import { NewQuoteFlowModal, type NewQuoteFlowPrefill } from '@/components/member/NewQuoteFlowModal';
import {
  hasSavedQuoteDraft,
  QUOTE_DRAFT_CHANGED_EVENT,
} from '@/lib/quote-draft-storage';
import { SupplierLogo } from '@/components/SupplierLogo';
import MemberAssistantPanel from '@/components/member/MemberAssistantPanel';
import { MemberSupplierGuidesPanel } from '@/components/member/MemberSupplierGuidesPanel';
import { ChatAttachmentChips, ChatAttachmentUploadButton } from '@/components/chat/ChatAttachmentControls';
import { useChatAttachments } from '@/components/chat/useChatAttachments';
import {
  formatUserMessageDisplay,
  formatUserMessageWithAttachments,
} from '@/lib/chat-attachments';
import {
  isReturningMemberEmail,
  markReturningMemberEmail,
  shouldGateAnalysis,
} from '@/lib/member-account';
import {
  buildMemberServicesList,
  buildSavingsOpportunityList,
  invalidateMemberPortalContractsCache,
  userServicesForPortalScope,
} from '@/lib/member-portal-services';
import {
  memberHasMasterLocationAccess,
  resolveEffectiveMemberLocationIds,
  type PortalLocationViewFilter,
} from '@/lib/portal/location-scope';
import { findCustomerByContactEmail } from '@/lib/crm/customer-lookup';
import {
  fetchMemberReviewRequestsForAdmin,
  fetchMemberReviewRequestsForUser,
  updateMemberReviewRequestStatus,
  type MemberReviewRequestRow,
} from '@/lib/services/member-review-requests';
import {
  fetchCustomerMessageThreadsForAdmin,
  countUnreadCustomerMessageThreads,
  type CustomerMessageThreadRow,
} from '@/lib/services/customer-message-threads';
import {
  fetchQuoteRequestsForAdmin,
  fetchMemberQuoteRequests,
  isQuoteRequestPublished,
  memberQuoteSeenId,
  updateQuoteRequestStatus,
  type QuoteRequestRow,
} from '@/lib/services/quote-requests';
import {
  fetchContractSubmitActionsForAdmin,
  updateContractSubmitActionStatus,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';
import {
  fetchMemberServiceRequestsForAdmin,
  fetchMemberServiceRequestsForMember,
  type MemberServiceRequestRow,
} from '@/lib/services/member-service-requests';
import { buildMemberDashboardRequests, type MemberDashboardRequestTarget } from '@/lib/member-dashboard-requests';
import { MemberRequestsPanel } from '@/components/member/MemberRequestsPanel';
import { MemberPendingContractsPanel } from '@/components/member/MemberPendingContractsPanel';
import { adminPreviewGrant } from '@/lib/admin-portal-preview';
import {
  applyPortalScopeForEmail,
  clearPortalSessionScopeUnlessPreview,
  contactEmailForPortalScope,
  endPortalPreview,
  getPortalSessionScope,
  grantFromContact,
  isPortalPreviewActive,
  portalTierLabel,
  restoreAdminPortalPreviewFromScope,
  setPortalSessionScope,
  startPortalPreview,
  syncPortalPreviewCookieFromScope,
} from '@/lib/portal-access';
import { sendMagicLinkSignIn } from '@/lib/auth/magic-link';
import {
  billFingerprint,
  isDuplicateBill,
  saveBillFingerprint,
} from '@/lib/services/bill-fingerprints';
import {
  fetchAllCustomerTicketsForAdmin,
  fetchCustomerTicketsForUser,
  formatCustomerTicketTime,
  insertCustomerTicket,
  updateCustomerTicketStatusAdmin,
  type CustomerTicketRow,
} from '@/lib/services/customer-tickets';
import { MemberBillPendingReview } from '@/components/member/MemberBillPendingReview';
import { EmbeddedProposalAnalysis } from '@/components/member/EmbeddedProposalAnalysis';
import { MemberUcaasProposal } from '@/components/member/MemberUcaasProposal';
import { MemberQuoteProposal } from '@/components/member/MemberQuoteProposal';
import type { BillParseResult, PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';
import type { BillAnalysisReviewRow } from '@/lib/bill-parse-types';
import { fetchAdminAnalysisReviews, parseAndQueueBillReview } from '@/lib/submit-bill-analysis';
import { fetchPortalLeads, patchPortalLead } from '@/lib/services/portal-leads';
import { isLocalPersistence } from '@/lib/persistence/config';
import {
  deleteLocalAccountService,
  insertLocalAccountService,
  listLocalAccountServices,
  listLocalReviewsForServiceIds,
  newLocalId,
  updateLocalAccountService,
} from '@/lib/persistence/local-data-store';
import { DevPersistenceBanner } from '@/components/DevPersistenceBanner';
import { PersistenceModeControls } from '@/components/PersistenceModeControls';
import { ClaudeUsageAnalyticsPanel } from '@/components/admin/ClaudeUsageAnalyticsPanel';
import { parseBillFromFile } from '@/lib/bill-parse';
import {
  fetchMemberProfileFlags,
  markWelcomeSeenInDb,
  unlockAnalysisInDb,
} from '@/lib/services/member-profile';

export type CandidSessionUser = { email: string; name?: string | null };

export type CandidAppProps = {
  sessionUser?: CandidSessionUser;
  userId?: string;
  /** From Supabase `profiles.role`: admin shell vs member shell */
  appRole?: 'admin' | 'user';
  signOutAction?: () => Promise<void>;
  /** Landing-page / marketplace deep-link into the prospect signup flow. */
  signupPrefill?: SignupPrefill | null;
};

const DEMO_SERVICES: ServiceCardModel[] = [
  { id: 'demo-rc', cls: 'candid-svc', logo: 'ringcentral', logoTxt: 'RC', name: 'UCaaS / Phone System', vendor: 'RingCentral — 25 seats', status: 'expiring', statusTxt: 'Expiring Soon', badge: 'candid', candidManaged: true, pending: false, amount: '$1,250', exp: 'urgent', expTxt: 'Expires Jun 1, 2026', expSub: '40 days remaining', filter: ['candid', 'expiring'] },
  { id: 'demo-cb', cls: 'candid-svc', logo: 'comcast', logoTxt: 'CB', name: 'Internet Service', vendor: 'Comcast Business — 500 Mbps', status: 'expiring', statusTxt: 'Expiring Soon', badge: 'candid', candidManaged: true, pending: false, amount: '$420', exp: 'warn', expTxt: 'Expires Jul 15, 2026', expSub: '84 days remaining', filter: ['candid', 'expiring'] },
  { id: 'demo-sq', cls: 'candid-svc', logo: 'square', logoTxt: 'SQ', name: 'Merchant Processing', vendor: 'Square — Effective rate 3.1%', status: 'active', statusTxt: 'Active', badge: 'candid', candidManaged: true, pending: false, amount: '$1,954', exp: '', expTxt: 'Month-to-month', expSub: '', filter: ['candid'] },
  { id: 'demo-ms', cls: 'candid-svc', logo: 'microsoft', logoTxt: 'MS', name: 'Microsoft 365 Business', vendor: 'Direct — 22 licenses (4 inactive)', status: 'active', statusTxt: 'Active', badge: 'candid', candidManaged: true, pending: false, amount: '$660', exp: '', expTxt: 'Expires Mar 2027', expSub: '', filter: ['candid'] },
];

function HankMark({ size = 14, className }: { size?: number; className?: string }) {
  return <AppIcon name="hank" size={size} className={className} />;
}

type ContactInfo = {
  name: string;
  email: string;
  company: string;
  initials: string;
};

const DEMO_CONTACT: ContactInfo = {
  name: 'John Mitchell',
  email: 'john@acmecorp.com',
  company: 'Acme Corporation',
  initials: 'JM',
};

function titleCaseLocalPart(email: string) {
  const local = email.split('@')[0] ?? 'there';
  return local
    .replace(/[._-]+/g, ' ')
    .replace(/\b\w/g, (c) => c.toUpperCase());
}

function resolveContact(
  sessionUser?: CandidSessionUser,
  opts?: { asAdmin?: boolean; portalPreviewActive?: boolean },
): ContactInfo {
  if (!sessionUser?.email) return DEMO_CONTACT;
  const email = sessionUser.email;
  const name =
    sessionUser.name?.trim() || titleCaseLocalPart(email);
  // Admins only take portal/customer identity while explicitly previewing.
  // Do not read the preview localStorage flag alone — React state is the source of truth
  // after "Exit preview", which otherwise left the customer name in the admin top bar.
  const usePortalScope =
    typeof window !== 'undefined' &&
    (opts?.asAdmin ? Boolean(opts.portalPreviewActive) : true);
  const scope = usePortalScope ? getPortalSessionScope() : null;
  const scopeEmail = contactEmailForPortalScope(scope);
  const displayName = scope?.contactName || name;
  const displayEmail = scopeEmail || email;
  const nameParts = displayName.split(/\s+/).filter(Boolean);
  const displayInitials =
    nameParts.length >= 2
      ? `${nameParts[0]![0]!}${nameParts[nameParts.length - 1]![0]!}`.toUpperCase()
      : (nameParts[0]?.slice(0, 2).toUpperCase() ?? displayEmail.slice(0, 2).toUpperCase());
  return {
    name: displayName,
    email: displayEmail,
    company: scope?.companyName || DEMO_CONTACT.company,
    initials: displayInitials,
  };
}

const ContactContext = createContext<ContactInfo>(DEMO_CONTACT);

function useContact() {
  return useContext(ContactContext);
}

// ── TYPES ─────────────────────────────────────────────────────
type Screen = 'login' | 'admin' | 'prospect' | 'member';
type Role = 'member' | 'prospect' | 'admin';
type AdminView = 'assistant' | 'customers' | 'leads' | 'agents' | 'tickets' | 'commissions' | 'partners' | 'messages' | 'custmessages' | 'expenses' | 'marketinghub' | 'outreach' | 'adminsettings';
type MemberView = 'mdashboard' | 'mservices' | 'msavings' | 'mmessages' | 'mfind' | 'mspend' | 'msettings';
type AddServiceStage = 'upload' | 'processing' | 'result' | 'human-review' | 'confirm';

/** Tech Spend / Plaid — on by default; set NEXT_PUBLIC_ENABLE_TECH_SPEND=0 to hide. */
const ENABLE_TECH_SPEND = process.env.NEXT_PUBLIC_ENABLE_TECH_SPEND !== '0';

// Clean, bookmarkable URL slugs for each major screen (TASK-002).
const ADMIN_VIEW_SLUG: Record<AdminView, string> = {
  assistant: 'assistant',
  customers: 'accounts',
  leads: 'leads',
  agents: 'agents',
  tickets: 'actions',
  commissions: 'commissions',
  partners: 'partners',
  messages: 'messages',
  custmessages: 'customer-messages',
  expenses: 'expenses',
  marketinghub: 'marketing-hub',
  outreach: 'outreach',
  adminsettings: 'admin-settings',
};
const ADMIN_SLUG_VIEW: Record<string, AdminView> = Object.fromEntries(
  Object.entries(ADMIN_VIEW_SLUG).map(([view, slug]) => [slug, view as AdminView]),
);
const MEMBER_VIEW_SLUG: Record<MemberView, string> = {
  mdashboard: 'dashboard',
  mservices: 'services',
  msavings: 'savings',
  mmessages: 'messages',
  mfind: 'find-solutions',
  mspend: 'tech-spend',
  msettings: 'settings',
};
const MEMBER_SLUG_VIEW: Record<string, MemberView> = Object.fromEntries(
  Object.entries(MEMBER_VIEW_SLUG).map(([view, slug]) => [slug, view as MemberView]),
);

/** localStorage key tracking reviewed quotes the member has already opened. */
const SEEN_QUOTES_STORAGE_KEY = 'candid:seen-quote-ids';

/** localStorage key tracking when the member last viewed the Message Center,
 *  so the sidebar bubble only counts genuinely new incoming messages. */
const MC_LAST_SEEN_STORAGE_KEY = 'candid:mc-last-seen';

type MemberNotificationLite = {
  id: string;
  type?: string;
  title: string;
  body: string;
  read_at: string | null;
  created_at: string;
  quote_request_id?: string | null;
};
type ProspectStage = 'form' | 'processing' | 'confirm' | 'analysis';

interface ChatMsg { type: 'user' | 'bot'; text: string; time: string; isTyping?: boolean; }
interface ConvMsg { role: string; content: string; }

// ── HELPERS ───────────────────────────────────────────────────
const now = () => new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

// ── MAIN COMPONENT ────────────────────────────────────────────
export default function CandidApp(props: CandidAppProps = {}) {
  const [portalCustomerId, setPortalCustomerId] = useState<string | null>(null);

  useEffect(() => {
    if (!props.sessionUser?.email) {
      setPortalCustomerId(null);
      return;
    }
    if (props.appRole === 'admin') {
      setPortalCustomerId(null);
      return;
    }
    setPortalCustomerId(getPortalSessionScope()?.customerId ?? null);
  }, [props.sessionUser?.email, props.appRole]);

  const crmEnabled =
    Boolean(props.sessionUser?.email) &&
    (props.appRole === 'admin' || Boolean(portalCustomerId));

  return (
    <CrmDataProvider enabled={crmEnabled} portalCustomerId={portalCustomerId}>
      <CandidAppInner {...props} />
    </CrmDataProvider>
  );
}

function CandidAppInner({
  sessionUser,
  userId,
  appRole = 'user',
  signOutAction,
  signupPrefill = null,
}: CandidAppProps = {}) {
  const { isDark, toggleTheme, mounted: themeMounted } = useTheme();
  const {
    customers: crmCustomers,
    contractsByCustomerId,
    documentsByCustomerId,
    bmwDeals,
    agentRates,
  } = useCrmData();

  // Screen / nav state
  const [screen, setScreen] = useState<Screen>(() => {
    if (!sessionUser?.email) return signupPrefill ? 'prospect' : 'login';
    return appRole === 'admin' ? 'admin' : 'member';
  });
  const [role, setRole] = useState<Role>(() => {
    if (!sessionUser?.email) return signupPrefill ? 'prospect' : 'member';
    return appRole === 'admin' ? 'admin' : 'member';
  });
  const [portalPreviewActive, setPortalPreviewActive] = useState(false);
  const contact = useMemo(
    () =>
      resolveContact(sessionUser, {
        asAdmin: appRole === 'admin',
        // Only while previewing as a customer on the member shell.
        portalPreviewActive: portalPreviewActive && screen === 'member',
      }),
    [sessionUser, appRole, portalPreviewActive, screen],
  );
  const [adminView, setAdminView] = useState<AdminView>('assistant');
  const [adminNavPrefs, setAdminNavPrefs] = useState<AdminSidebarPreferences>(() =>
    loadCachedAdminSidebarPreferences(),
  );
  const [adminNavEditMode, setAdminNavEditMode] = useState(false);
  const [actionCenterTab, setActionCenterTab] = useState<ActionCenterTab>('all');
  const [actionCenterOpen, setActionCenterOpen] = useState(true);
  const [actionCenterTicketId, setActionCenterTicketId] = useState<string | null>(null);
  // When an action is opened via deep-link (e.g. a Message Center mention), remember
  // where to return to once the action detail is closed.
  const [actionReturnView, setActionReturnView] = useState<AdminView | null>(null);
  const actionReturnViewRef = useRef<AdminView | null>(null);
  const rememberActionReturn = useCallback((view: AdminView) => {
    actionReturnViewRef.current = view;
    setActionReturnView(view);
  }, []);
  const consumeActionReturn = useCallback((): AdminView | null => {
    const view = actionReturnViewRef.current;
    actionReturnViewRef.current = null;
    setActionReturnView(null);
    return view;
  }, []);
  const [adminCustomerId, setAdminCustomerId] = useState<string | null>(null);
  const [adminLeadFocusId, setAdminLeadFocusId] = useState<string | null>(null);
  const [adminSupplierId, setAdminSupplierId] = useState<string | null>(null);
  const [adminCommissionPartnerKey, setAdminCommissionPartnerKey] = useState<string | null>(null);
  const [searchSolutionProviders, setSearchSolutionProviders] = useState<SolutionProviderRecord[]>([]);
  const [searchCommissionPartners, setSearchCommissionPartners] = useState<PartnerSupplierRecord[]>([]);
  const [memberView, setMemberView] = useState<MemberView>('mdashboard');
  const [newQuoteOpen, setNewQuoteOpen] = useState(false);
  const [newQuotePrefill, setNewQuotePrefill] = useState<NewQuoteFlowPrefill | undefined>();
  const openNewQuote = useCallback((prefill?: NewQuoteFlowPrefill) => {
    setNewQuotePrefill(prefill);
    setNewQuoteOpen(true);
  }, []);
  useEffect(() => {
    const onOpen = () => setMemberView('mfind');
    window.addEventListener('candid:find-solutions', onOpen);
    return () => window.removeEventListener('candid:find-solutions', onOpen);
  }, []);

  const [memberServicesRevision, setMemberServicesRevision] = useState(0);
  useEffect(() => {
    const bump = () => {
      invalidateMemberPortalContractsCache();
      setMemberServicesRevision((n) => n + 1);
    };
    window.addEventListener('candid-contract-updated', bump);
    window.addEventListener('candid-crm-hydrated', bump);
    return () => {
      window.removeEventListener('candid-contract-updated', bump);
      window.removeEventListener('candid-crm-hydrated', bump);
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    void fetchAdminSidebarPreferences().then((prefs) => {
      if (!cancelled) setAdminNavPrefs(prefs);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const visible = visibleAdminSidebarOrder(adminNavPrefs);
    if (!visible.length) return;
    const isMain = (ADMIN_MAIN_NAV_IDS as readonly string[]).includes(adminView);
    if (isMain && !visible.includes(adminView as AdminMainNavId)) {
      setAdminView(visible[0]);
    }
  }, [adminNavPrefs, adminView]);

  useEffect(() => {
    if (adminView !== 'customers') setAdminCustomerId(null);
  }, [adminView]);

  useEffect(() => {
    if (adminView !== 'partners') setAdminSupplierId(null);
  }, [adminView]);

  useEffect(() => {
    if (adminView !== 'tickets') setActionCenterTicketId(null);
  }, [adminView]);

  // Clear stale return targets when the user navigates away from Action Center
  // via the sidebar (not when closing a detail panel — that consumes the ref).
  useEffect(() => {
    if (adminView !== 'tickets' && actionReturnViewRef.current) {
      const closingFromDetail =
        actionReturnViewRef.current === adminView;
      if (!closingFromDetail) {
        actionReturnViewRef.current = null;
        setActionReturnView(null);
      }
    }
  }, [adminView]);

  // ── Deep-linkable hash routes (TASK-002) ──
  useHashRoute<AdminView>({
    enabled: screen === 'admin',
    value: adminView,
    slugForValue: (v) => ADMIN_VIEW_SLUG[v] ?? v,
    valueForSlug: (slug) => ADMIN_SLUG_VIEW[slug] ?? null,
    onNavigate: (v) => setAdminView(v),
  });
  useHashRoute<MemberView>({
    enabled: screen === 'member',
    value: memberView,
    slugForValue: (v) => MEMBER_VIEW_SLUG[v] ?? v,
    valueForSlug: (slug) => MEMBER_SLUG_VIEW[slug] ?? null,
    onNavigate: (v) => setMemberView(v),
  });

  // Login form
  const [loginEmail, setLoginEmail] = useState(
    () => sessionUser?.email || 'john@acmecorp.com'
  );
  const [loginPass, setLoginPass] = useState('');
  const [loginMode, setLoginMode] = useState<'password' | 'magic'>('password');
  const [loginNotice, setLoginNotice] = useState('');
  const [loginError, setLoginError] = useState('');
  const [loginLoading, setLoginLoading] = useState(false);
  const router = useRouter();

  // PWA / soft-nav fallback: if cookies still have a session but this page
  // rendered the login shell, bounce into the authenticated app routes.
  useEffect(() => {
    if (sessionUser?.email) return;
    if (screen !== 'login') return;
    let cancelled = false;
    void (async () => {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { user },
      } = await supabase.auth.getUser();
      if (cancelled || !user?.email) return;
      router.replace(isCandidAdminEmail(user.email) ? '/admin' : '/app');
      router.refresh();
    })();
    return () => {
      cancelled = true;
    };
  }, [sessionUser?.email, screen, router]);

  // Dropdowns
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [memberAvatarMenuOpen, setMemberAvatarMenuOpen] = useState(false);
  const [themePickerOpen, setThemePickerOpen] = useState(false);

  // Services filter
  const [serviceFilter, setServiceFilter] = useState('all');

  // Add Service Modal
  const [addServiceOpen, setAddServiceOpen] = useState(false);
  const [addStage, setAddStage] = useState<AddServiceStage>('upload');
  const [processingLabel, setProcessingLabel] = useState(processingMessages[0]);
  const [addResult, setAddResult] = useState<typeof serviceProfiles['merchant'] | null>(null);
  const [uploadDragOver, setUploadDragOver] = useState(false);
  const [addServiceProductName, setAddServiceProductName] = useState('');
  const [addServiceError, setAddServiceError] = useState('');
  const [addBillParseResult, setAddBillParseResult] = useState<BillParseResult | null>(null);
  const [userServices, setUserServices] = useState<ServiceCardModel[]>([]);
  const [merchantAnalysisView, setMerchantAnalysisView] = useState<MerchantAnalysisSnapshot | null>(null);
  const [proposalAnalysisView, setProposalAnalysisView] = useState<{
    snapshot: PublishedAnalysisSnapshot;
    reviewId: string;
    serviceId?: string;
  } | null>(null);
  const [merchantAnalysisServiceId, setMerchantAnalysisServiceId] = useState<string | null>(null);
  const [merchantAnalysisCandidManaged, setMerchantAnalysisCandidManaged] = useState(false);
  const [pendingBillReview, setPendingBillReview] = useState<{
    reviewId?: string;
    vendorName: string;
    parseResult: BillParseResult;
    categories?: string[] | null;
  } | null>(null);
  const [analysisReviews, setAnalysisReviews] = useState<BillAnalysisReviewRow[]>([]);
  const [portalLeads, setPortalLeads] = useState<Lead[]>([]);
  const [leadConversionTarget, setLeadConversionTarget] = useState<Lead | null>(null);
  const [selectedAnalysisReviewId, setSelectedAnalysisReviewId] = useState<string | null>(null);
  const [selectedQuoteRequestId, setSelectedQuoteRequestId] = useState<string | null>(null);
  const [selectedCustomerMessageThreadId, setSelectedCustomerMessageThreadId] = useState<string | null>(null);
  const [messageCenterSection, setMessageCenterSection] = useState<'team' | 'customers'>('team');
  /** When set, closing the analysis review returns to this customer account. */
  const [analysisReviewReturnCustomerId, setAnalysisReviewReturnCustomerId] = useState<string | null>(null);
  const [analysisTickets, setAnalysisTickets] = useState<AnalysisTicketRow[]>([]);
  const [customerTickets, setCustomerTickets] = useState<CustomerTicketRow[]>([]);
  const [ticketEpoch, setTicketEpoch] = useState(0);
  const [actionWorkEpoch, setActionWorkEpoch] = useState(0);
  const [actionWorkByKey, setActionWorkByKey] = useState<Record<string, import('@/lib/admin-action-work').ActionWorkState>>({});
  const [outreachAccounts, setOutreachAccounts] = useState<OutreachAccount[]>([]);
  const [outreachDeepLinkId, setOutreachDeepLinkId] = useState<string | null>(null);
  const [welcomeOpen, setWelcomeOpen] = useState(false);
  const [analysisUnlocked, setAnalysisUnlocked] = useState(false);
  const [serviceRequestContext, setServiceRequestContext] = useState<ServiceRequestContext | 'general' | null>(null);
  const [serviceDetail, setServiceDetail] = useState<ServiceCardModel | null>(null);
  const [externalServiceModal, setExternalServiceModal] = useState<ServiceCardModel | 'new' | null>(null);
  const [memberReviewRequests, setMemberReviewRequests] = useState<MemberReviewRequestRow[]>([]);
  const [quoteRequests, setQuoteRequests] = useState<QuoteRequestRow[]>([]);
  const [contractSubmitActions, setContractSubmitActions] = useState<ContractSubmitActionRow[]>([]);
  const [customerMessageThreads, setCustomerMessageThreads] = useState<CustomerMessageThreadRow[]>([]);
  const [reviewRequestEpoch, setReviewRequestEpoch] = useState(0);
  const [quoteRequestEpoch, setQuoteRequestEpoch] = useState(0);
  const [contractSubmitEpoch, setContractSubmitEpoch] = useState(0);
  const [memberQuoteRequests, setMemberQuoteRequests] = useState<QuoteRequestRow[]>([]);
  const [memberServiceRequests, setMemberServiceRequests] = useState<MemberServiceRequestRow[]>([]);
  const [memberPortalServiceRequests, setMemberPortalServiceRequests] = useState<MemberServiceRequestRow[]>([]);
  const [activePublishedQuoteId, setActivePublishedQuoteId] = useState<string | null>(null);
  const [prospectAnalysisSnapshot, setProspectAnalysisSnapshot] = useState<MerchantAnalysisSnapshot | null>(null);

  // Quote Modal
  const [quoteOpen, setQuoteOpen] = useState(false);
  const [quoteStage, setQuoteStage] = useState<'choose' | 'form' | 'confirm'>('choose');
  const [quoteMode, setQuoteMode] = useState<'request' | 'add-services'>('request');
  const [quoteName, setQuoteName] = useState('');
  const [quoteCompany, setQuoteCompany] = useState('');
  const [quoteEmail, setQuoteEmail] = useState('');
  const [quotePhone, setQuotePhone] = useState('');
  const [quoteError, setQuoteError] = useState('');
  const [quoteSelectedPills, setQuoteSelectedPills] = useState<string[]>([]);
  const [quoteConfirmText, setQuoteConfirmText] = useState('');

  // Admin chat (Hank)
  const [chatInput, setChatInput] = useState('');
  const [chatMessages, setChatMessages] = useState<ChatMsg[]>(() => {
    const c = resolveContact(sessionUser);
    const first = c.name.split(/\s+/)[0] ?? 'there';
    return [
      {
        type: 'bot',
        time: 'Just now',
        text: `Hi ${first} — I'm Hank, your personal Candid assistant. Think of me as your team member who never sleeps and always knows your account.<br><br>Your Square bill was <strong>$94 higher than expected</strong> this month — fax plan overage. I can explain exactly why and what to do about it.<br><br>Also, your <strong>RingCentral contract expires in 40 days</strong> and you're paying $500/mo above market. That's the most urgent item on your account. Want me to walk you through your options?`,
      },
    ];
  });
  const [chatConversation, setChatConversation] = useState<ConvMsg[]>([]);
  const [chatLoading, setChatLoading] = useState(false);
  const chatMessagesRef = useRef<HTMLDivElement>(null);
  const [adminGlobalQuery, setAdminGlobalQuery] = useState('');

  const [memberGlobalQuery, setMemberGlobalQuery] = useState('');
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  // On phones the sidebar becomes a bottom nav strip where "collapsed" makes no
  // sense (and would hide accordion/flyout sub-items that are conditionally
  // rendered in JS), so treat it as always expanded below the mobile breakpoint.
  const [isMobile, setIsMobile] = useState(false);
  // Mobile bottom nav auto-hides on scroll down, reappears on scroll up.
  const [mobileNavHidden, setMobileNavHidden] = useState(false);

  // Prospect
  const [prospectFiles, setProspectFiles] = useState<File[]>([]);
  const [prospectStage, setProspectStage] = useState<ProspectStage>('form');
  const [pProcessingLabel, setPProcessingLabel] = useState('Sending your request to the Candid team...');
  const [pName, setPName] = useState('');
  const [pCompany, setPCompany] = useState('');
  const [pPhone, setPPhone] = useState('');
  const [pEmail, setPEmail] = useState('');
  const [pTeamEmails, setPTeamEmails] = useState('');
  const [pError, setPError] = useState('');
  const [pConfirmText, setPConfirmText] = useState('');
  const [prospectDragOver, setProspectDragOver] = useState(false);
  const [calendarOpen, setCalendarOpen] = useState(false);
  const [prospectIntent, setProspectIntent] = useState<'quote' | 'analysis'>(() =>
    signupPrefill?.intent === 'quote' ? 'quote' : 'analysis',
  );
  const [pHasBill, setPHasBill] = useState<'yes' | 'no' | null>(() =>
    signupPrefill?.intent === 'quote' ? 'no' : null,
  );
  const [pLookingFor, setPLookingFor] = useState(() => {
    const bits = [signupPrefill?.vendor, signupPrefill?.q].filter(Boolean);
    return bits.join(' — ');
  });
  const [pCategories, setPCategories] = useState<SolutionCategoryId[]>(() => {
    const c = signupPrefill?.category;
    if (c && SOLUTION_CATEGORIES.some((x) => x.id === c)) return [c as SolutionCategoryId];
    return [];
  });
  const [pVendorInterest, setPVendorInterest] = useState(() => signupPrefill?.vendor ?? '');

  // Serviceability
  const [saStreet, setSaStreet] = useState('');
  const [saCity, setSaCity] = useState('');
  const [saState, setSaState] = useState('');
  const [saResults, setSaResults] = useState<{ name: string; speed: string; price: string; tag: string }[] | null>(null);

  // Settings toggles
  const [settingToggles, setSettingToggles] = useState({ email: true, sms: false, slack: true, autoRenew: true });
  const [updateCardOpen, setUpdateCardOpen] = useState(false);

  useEffect(() => {
    setLoginError('');
    setLoginNotice('');
  }, [role, loginMode]);

  useEffect(() => {
    if (!sessionUser?.email) return;
    if (isCandidAdminEmail(sessionUser.email) || appRole === 'admin') {
      clearPortalSessionScopeUnlessPreview();
      return;
    }
    applyPortalScopeForEmail(sessionUser.email);
    markReturningMemberEmail(sessionUser.email);
  }, [sessionUser?.email, appRole]);

  const refreshUserServices = useCallback(async () => {
    if (!userId) {
      setUserServices([]);
      return;
    }

    if (isLocalPersistence()) {
      const rows = listLocalAccountServices(userId);
      const reviewIds = rows
        .map((r) => r.analysis_review_id)
        .filter((id): id is string => Boolean(id));
      const reviews = listLocalReviewsForServiceIds(reviewIds);
      const reviewParseById = new Map(reviews.map((r) => [r.id, r.parse_result]));
      const reviewCategoriesById = new Map(
        reviews.map((r) => [r.id, r.detected_categories]),
      );
      const reviewPublishedById = new Map(
        reviews
          .filter((r) => r.status === 'published' && r.published_snapshot)
          .map((r) => [r.id, r.published_snapshot!]),
      );
      setUserServices(
        rows.map((row) =>
          accountServiceToCard(
            row,
            row.analysis_review_id ? reviewParseById.get(row.analysis_review_id) : undefined,
            row.analysis_review_id ? reviewCategoriesById.get(row.analysis_review_id) ?? null : undefined,
            row.analysis_review_id ? reviewPublishedById.get(row.analysis_review_id) : undefined,
          ),
        ),
      );
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { data, error } = await supabase
      .from('account_services')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false });
    if (error) {
      console.error('Failed to load services', error);
      return;
    }
    const rows = (data as AccountServiceRow[]) ?? [];
    const reviewIds = rows
      .map((r) => r.analysis_review_id)
      .filter((id): id is string => Boolean(id));
    let reviewParseById = new Map<string, BillParseResult>();
    let reviewCategoriesById = new Map<string, string[] | null>();
    let reviewPublishedById = new Map<string, PublishedAnalysisSnapshot>();
    if (reviewIds.length) {
      const { data: reviews } = await supabase
        .from('bill_analysis_reviews')
        .select('id, parse_result, detected_categories, published_snapshot, status')
        .in('id', reviewIds);
      reviewParseById = new Map(
        (reviews ?? []).map((r) => [r.id as string, r.parse_result as BillParseResult]),
      );
      reviewCategoriesById = new Map(
        (reviews ?? []).map((r) => [
          r.id as string,
          Array.isArray(r.detected_categories) ? (r.detected_categories as string[]) : null,
        ]),
      );
      reviewPublishedById = new Map(
        (reviews ?? [])
          .filter((r) => r.status === 'published' && r.published_snapshot)
          .map((r) => [r.id as string, r.published_snapshot as PublishedAnalysisSnapshot]),
      );
    }
    setUserServices(
      rows.map((row) =>
        accountServiceToCard(
          row,
          row.analysis_review_id ? reviewParseById.get(row.analysis_review_id) : undefined,
          row.analysis_review_id ? reviewCategoriesById.get(row.analysis_review_id) : undefined,
          row.analysis_review_id ? reviewPublishedById.get(row.analysis_review_id) : undefined,
        ),
      ),
    );
  }, [userId]);

  const refreshAnalysisReviews = useCallback(async () => {
    if (appRole !== 'admin') return;
    try {
      const rows = await fetchAdminAnalysisReviews();
      setAnalysisReviews(rows);
    } catch (err) {
      console.error('refreshAnalysisReviews', err);
    }
  }, [appRole]);

  const refreshPortalLeads = useCallback(async () => {
    if (appRole !== 'admin') return;
    try {
      const rows = await fetchPortalLeads();
      setPortalLeads(rows);
    } catch (err) {
      console.error('refreshPortalLeads', err);
    }
  }, [appRole]);

  const handleConvertLead = useCallback((lead: Lead) => {
    setLeadConversionTarget(lead);
    setAdminView('customers');
  }, []);

  const handleCustomerCreatedFromLead = useCallback(
    async (customerId: string, lead: Lead) => {
      if (!lead.portalLeadRowId) return;
      const next: Lead = {
        ...lead,
        lifecycle: 'converted',
        convertedCustomerId: customerId,
        status: 'qualified',
      };
      await patchPortalLead(lead.portalLeadRowId, {
        lifecycle: 'converted',
        convertedCustomerId: customerId,
        leadData: next,
      });
      setLeadConversionTarget(null);
      await refreshPortalLeads();
    },
    [refreshPortalLeads],
  );

  useEffect(() => {
    setUserServices([]);
    void refreshUserServices();
  }, [refreshUserServices]);

  useEffect(() => {
    if (screen === 'member' && (memberView === 'mservices' || memberView === 'msavings') && userId) {
      void refreshUserServices();
    }
  }, [screen, memberView, userId, refreshUserServices]);

  const refreshAnalysisTickets = useCallback(async () => {
    if (appRole !== 'admin') return;
    setAnalysisTickets(await fetchAnalysisTicketsForAdmin());
  }, [appRole]);

  useEffect(() => {
    if (screen === 'admin' && appRole === 'admin') {
      void refreshAnalysisTickets();
      void refreshAnalysisReviews();
      void refreshPortalLeads();
    }
  }, [screen, appRole, refreshAnalysisTickets, refreshAnalysisReviews, refreshPortalLeads, adminView]);

  // Close avatar menus on outside click
  useEffect(() => {
    const handler = (e: MouseEvent) => {
      const t = e.target as Element;
      if (!t.closest('.avatar-wrap')) {
        setAvatarMenuOpen(false);
        setMemberAvatarMenuOpen(false);
      }
    };
    document.addEventListener('click', handler);
    return () => document.removeEventListener('click', handler);
  }, []);

  // Auto-scroll chats
  useEffect(() => { chatMessagesRef.current?.scrollTo(0, chatMessagesRef.current.scrollHeight); }, [chatMessages]);

  useEffect(() => {
    try {
      if (localStorage.getItem('candid-sidebar-collapsed') === '1') {
        setSidebarCollapsed(true);
      }
    } catch {
      /* ignore */
    }
  }, []);

  useEffect(() => {
    const mq = window.matchMedia('(max-width: 768px)');
    const update = () => setIsMobile(mq.matches);
    update();
    mq.addEventListener('change', update);
    return () => mq.removeEventListener('change', update);
  }, []);

  // Hide the mobile bottom nav while scrolling down, reveal it on scroll up.
  useEffect(() => {
    if (!isMobile) {
      setMobileNavHidden(false);
      return;
    }
    let lastY = window.scrollY;
    let ticking = false;
    const onScroll = () => {
      if (ticking) return;
      ticking = true;
      window.requestAnimationFrame(() => {
        const y = window.scrollY;
        const delta = y - lastY;
        // Ignore tiny jitters; near the top always show the nav.
        if (Math.abs(delta) > 6) {
          if (y < 64) setMobileNavHidden(false);
          else setMobileNavHidden(delta > 0);
          lastY = y;
        }
        ticking = false;
      });
    };
    window.addEventListener('scroll', onScroll, { passive: true });
    return () => window.removeEventListener('scroll', onScroll);
  }, [isMobile]);

  const refreshCustomerTickets = useCallback(async () => {
    if (appRole === 'admin') {
      setCustomerTickets(await fetchAllCustomerTicketsForAdmin());
      return;
    }
    if (userId && screen === 'member') {
      setCustomerTickets(await fetchCustomerTicketsForUser(userId));
    }
  }, [appRole, userId, screen]);

  useEffect(() => {
    void refreshCustomerTickets();
  }, [refreshCustomerTickets]);

  const refreshMemberReviewRequests = useCallback(async () => {
    if (appRole === 'admin') {
      setMemberReviewRequests(await fetchMemberReviewRequestsForAdmin());
      return;
    }
    if (userId && screen === 'member') {
      setMemberReviewRequests(await fetchMemberReviewRequestsForUser(userId));
    }
  }, [appRole, userId, screen]);

  useEffect(() => {
    void refreshMemberReviewRequests();
  }, [refreshMemberReviewRequests, reviewRequestEpoch]);

  const refreshQuoteRequests = useCallback(async () => {
    if (appRole === 'admin') {
      setQuoteRequests(await fetchQuoteRequestsForAdmin());
    }
  }, [appRole]);

  useEffect(() => {
    void refreshQuoteRequests();
  }, [refreshQuoteRequests, quoteRequestEpoch]);

  const refreshContractSubmitActions = useCallback(async () => {
    if (appRole === 'admin') {
      setContractSubmitActions(await fetchContractSubmitActionsForAdmin());
    }
  }, [appRole]);

  useEffect(() => {
    void refreshContractSubmitActions();
  }, [refreshContractSubmitActions, contractSubmitEpoch]);

  useEffect(() => {
    const onComposeSent = (event: Event) => {
      const detail = (event as CustomEvent<{ contractSubmitActionId?: string }>).detail;
      if (detail?.contractSubmitActionId) {
        setContractSubmitEpoch((e) => e + 1);
        setActionWorkEpoch((n) => n + 1);
      }
    };
    window.addEventListener('candid:admin-zoho-compose-sent', onComposeSent);
    return () => window.removeEventListener('candid:admin-zoho-compose-sent', onComposeSent);
  }, []);

  const refreshCustomerMessageThreads = useCallback(async () => {
    if (appRole === 'admin') {
      setCustomerMessageThreads(await fetchCustomerMessageThreadsForAdmin());
    }
  }, [appRole]);

  useEffect(() => {
    void refreshCustomerMessageThreads();
  }, [refreshCustomerMessageThreads]);

  const refreshMemberServiceRequestsAdmin = useCallback(async () => {
    if (appRole !== 'admin') return;
    setMemberServiceRequests(await fetchMemberServiceRequestsForAdmin());
  }, [appRole]);

  const refreshMemberPortalServiceRequests = useCallback(async () => {
    if (userId && screen === 'member') {
      setMemberPortalServiceRequests(await fetchMemberServiceRequestsForMember());
    }
  }, [userId, screen]);

  useEffect(() => {
    void refreshMemberServiceRequestsAdmin();
  }, [refreshMemberServiceRequestsAdmin]);

  useEffect(() => {
    void refreshMemberPortalServiceRequests();
  }, [refreshMemberPortalServiceRequests, reviewRequestEpoch]);

  const refreshActionCenterQueues = useCallback(async () => {
    if (screen !== 'admin' || appRole !== 'admin') return;
    await Promise.all([
      refreshQuoteRequests(),
      refreshMemberReviewRequests(),
      refreshCustomerTickets(),
      refreshCustomerMessageThreads(),
      refreshAnalysisTickets(),
      refreshAnalysisReviews(),
      refreshMemberServiceRequestsAdmin(),
      refreshPortalLeads(),
      refreshContractSubmitActions(),
    ]);
  }, [
    screen,
    appRole,
    refreshQuoteRequests,
    refreshMemberReviewRequests,
    refreshCustomerTickets,
    refreshCustomerMessageThreads,
    refreshAnalysisTickets,
    refreshAnalysisReviews,
    refreshMemberServiceRequestsAdmin,
    refreshPortalLeads,
    refreshContractSubmitActions,
  ]);

  // Poll Action Center queues so new quote/review/ticket requests appear without refresh.
  useEffect(() => {
    if (screen !== 'admin' || appRole !== 'admin') return;
    const tick = () => void refreshActionCenterQueues();
    const interval = setInterval(tick, 20_000);
    return () => clearInterval(interval);
  }, [screen, appRole, refreshActionCenterQueues]);

  // Refresh immediately when opening Action Center or refocusing the admin tab.
  useEffect(() => {
    if (screen !== 'admin' || appRole !== 'admin') return;
    if (adminView === 'tickets') {
      void refreshActionCenterQueues();
    }
  }, [screen, appRole, adminView, refreshActionCenterQueues]);

  useEffect(() => {
    if (screen !== 'admin' || appRole !== 'admin') return;
    const onFocus = () => void refreshActionCenterQueues();
    const onRefreshEvent = () => {
      void refreshActionCenterQueues();
      setActionWorkEpoch((n) => n + 1);
    };
    window.addEventListener('focus', onFocus);
    window.addEventListener(ACTION_CENTER_REFRESH_EVENT, onRefreshEvent);
    return () => {
      window.removeEventListener('focus', onFocus);
      window.removeEventListener(ACTION_CENTER_REFRESH_EVENT, onRefreshEvent);
    };
  }, [screen, appRole, refreshActionCenterQueues]);

  useEffect(() => {
    if (!userId || screen !== 'member') return;
    void (async () => {
      const flags = await fetchMemberProfileFlags(userId);
      setAnalysisUnlocked(flags.analysisUnlocked);
      if (!flags.welcomeSeen) setWelcomeOpen(true);
    })();
  }, [userId, screen]);

  const toggleSidebar = useCallback(() => {
    setSidebarCollapsed((prev) => {
      const next = !prev;
      try {
        localStorage.setItem('candid-sidebar-collapsed', next ? '1' : '0');
      } catch {
        /* ignore */
      }
      return next;
    });
  }, []);

  const effectiveCollapsed = sidebarCollapsed && !isMobile;
  const shellClass =
    (effectiveCollapsed ? ' sidebar-collapsed' : '') +
    (isMobile && mobileNavHidden ? ' mobile-nav-hidden' : '');

  // ── AUTH ────────────────────────────────────────────────────
  const doLogin = async (e?: FormEvent) => {
    e?.preventDefault();
    setLoginError('');
    setLoginNotice('');

    if (role === 'prospect') {
      if (loginEmail.trim()) setPEmail(loginEmail.trim());
      setScreen('prospect');
      return;
    }

    const email = loginEmail.trim();
    if (!email) {
      setLoginError('Please enter your email address.');
      return;
    }

    if (loginMode === 'magic') {
      setLoginLoading(true);
      const result = await sendMagicLinkSignIn(email, { next: '/app' });
      setLoginLoading(false);
      if (!result.ok) {
        setLoginError(result.message);
        return;
      }
      setLoginNotice(result.message);
      return;
    }

    const password = loginPass;
    if (!password) {
      setLoginError('Please enter your password.');
      return;
    }

    setLoginLoading(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password });
    setLoginLoading(false);

    if (error) {
      setLoginError(error.message);
      return;
    }

    if (isCandidAdminEmail(email)) {
      clearPortalSessionScopeUnlessPreview();
    } else {
      applyPortalScopeForEmail(email);
    }

    markReturningMemberEmail(email);
    router.push(isCandidAdminEmail(email) ? '/admin' : '/app');
    router.refresh();
  };
  const doLogout = async () => {
    setAvatarMenuOpen(false);
    setMemberAvatarMenuOpen(false);
    endPortalPreview();
    setPortalPreviewActive(false);
    setPortalSessionScope(null);
    if (signOutAction) await signOutAction();
    else setScreen('login');
  };

  // ── ADD SERVICE ─────────────────────────────────────────────
  const openAddService = () => {
    setAddServiceOpen(true);
    setAddStage('upload');
    setAddServiceProductName('');
    setAddServiceError('');
  };
  const closeAddService = () => {
    setAddServiceOpen(false);
    setTimeout(() => {
      setAddStage('upload');
      setAddServiceProductName('');
      setAddServiceError('');
    }, 300);
  };

  const persistPendingService = useCallback(
    async (
      file: File,
      productName: string,
      opts?: { candidManaged?: boolean; savingsOpportunityOnly?: boolean; crmCustomerId?: string | null },
    ) => {
      if (!userId) return null;
      const candidManaged = opts?.candidManaged ?? false;
      const savingsOpportunityOnly = opts?.savingsOpportunityOnly ?? false;
      const crmCustomerId = opts?.crmCustomerId ?? getPortalSessionScope()?.customerId ?? null;
      const label = productName.trim();
      const logoKey = logoKeyFromLabel(label);
      const serviceType = detectServiceType([label, file.name].filter(Boolean).join(' '));
      const now = new Date().toISOString();

      if (isLocalPersistence()) {
        const rowId = newLocalId();
        const storagePath = `local://${rowId}/${file.name}`;
        const row: AccountServiceRow = {
          id: rowId,
          user_id: userId,
          name: label,
          vendor: 'Bill submitted — analysis in progress',
          status: 'pending_analysis',
          monthly_amount_cents: null,
          expires_at: null,
          logo_key: logoKey,
          bill_storage_path: storagePath,
          service_type: serviceType === 'merchant' ? 'merchant' : null,
          merchant_analysis: null,
          analysis_snapshot: null,
          analysis_review_id: null,
          candid_managed: candidManaged,
          savings_opportunity_only: savingsOpportunityOnly,
          service_description: null,
          user_count: null,
          renewal_terms: null,
          interested_in_alternatives: false,
          contract_start_date: null,
          contract_storage_path: null,
          contract_filename: null,
          created_at: now,
          updated_at: now,
        };
        insertLocalAccountService(row);
        return { rowId, serviceType, storagePath };
      }

      const supabase = createSupabaseBrowserClient();

      const { data: row, error: insertError } = await supabase
        .from('account_services')
        .insert({
          user_id: userId,
          name: label,
          vendor: 'Bill submitted — analysis in progress',
          status: 'pending_analysis',
          logo_key: logoKey,
          service_type: serviceType === 'merchant' ? 'merchant' : null,
          candid_managed: candidManaged,
          savings_opportunity_only: savingsOpportunityOnly,
          ...(crmCustomerId ? { crm_customer_id: crmCustomerId } : {}),
        })
        .select('*')
        .single();

      if (insertError || !row) throw insertError ?? new Error('Insert failed');

      const storagePath = serviceBillStoragePath(userId, row.id as string, file.name);
      const { error: uploadError } = await supabase.storage
        .from('service-bills')
        .upload(storagePath, file, { upsert: true });

      if (uploadError) {
        await supabase.from('account_services').delete().eq('id', row.id);
        throw uploadError;
      }

      const { error: updateError } = await supabase
        .from('account_services')
        .update({ bill_storage_path: storagePath })
        .eq('id', row.id);

      if (updateError) throw updateError;
      return { rowId: row.id as string, serviceType, storagePath };
    },
    [userId]
  );

  const completeMerchantAnalysis = useCallback(
    async (rowId: string, file: File, productName: string) => {
      const parsed = await parseMerchantStatementPdf(file);
      const snapshot = buildMerchantAnalysisSnapshot([parsed]);
      const supabase = createSupabaseBrowserClient();
      const feesCents = monthlyFeesCents(snapshot);

      const { error } = await supabase
        .from('account_services')
        .update({
          status: 'active',
          name: snapshot.form.merchantName || productName,
          vendor: merchantVendorSummary(snapshot),
          monthly_amount_cents: feesCents,
          merchant_analysis: snapshot,
          service_type: 'merchant',
        })
        .eq('id', rowId);

      if (error) throw error;
      return snapshot;
    },
    []
  );

  const simulateUpload = useCallback((filename: string) => {
    setAddStage('processing');
    setProcessingLabel(processingMessages[0]);
    let step = 0;
    const interval = setInterval(() => {
      step++;
      if (step < processingMessages.length) setProcessingLabel(processingMessages[step]);
    }, 600);
    setTimeout(() => {
      clearInterval(interval);
      const type = detectServiceType(
        [addServiceProductName.trim(), filename].filter(Boolean).join(' ')
      );
      const profile = serviceProfiles[type] ?? serviceProfiles.default;
      if (type === 'default') { setAddStage('human-review'); return; }
      setAddResult(profile);
      setAddStage('result');
    }, 3200);
  }, [addServiceProductName]);

  const beginBillUpload = useCallback(
    async (file: File) => {
      const productName = addServiceProductName.trim();
      if (!productName) {
        setAddServiceError('Please enter a product / service name before uploading your bill.');
        return;
      }
      setAddServiceError('');

      if (userId) {
        const fp = await billFingerprint(file);
        if (await isDuplicateBill(userId, fp)) {
          setAddServiceError(
            'This bill matches one you already uploaded. Open it from My Services or upload a different statement.'
          );
          return;
        }
      }

      setAddStage('processing');
      setProcessingLabel('Analyzing your bill...');

      try {
        if (userId) {
          const fp = await billFingerprint(file);
          const persisted = await persistPendingService(file, productName, { candidManaged: false });
          if (!persisted) throw new Error('Save failed');
          const { parseResult, review } = await parseAndQueueBillReview({
            userId,
            file,
            accountServiceId: persisted.rowId,
            vendorName: productName,
            billStoragePath: persisted.storagePath,
            customerEmail: contactEmailForPortalScope(getPortalSessionScope()) ?? contact.email,
            customerName:
              getPortalSessionScope()?.companyName?.trim() ||
              contact.name ||
              undefined,
            crmCustomerId: getPortalSessionScope()?.customerId,
          });
          await saveBillFingerprint(userId, fp, file.name);
          await refreshUserServices();
          closeAddService();
          setPendingBillReview({
            reviewId: review.id,
            vendorName: review.vendor_name || parseResult.vendorName || productName,
            parseResult,
          });
          if (screen === 'admin') setAdminView('customers');
          else if (screen === 'member') setMemberView('mservices');
          return;
        }

        const parseResult = await parseBillFromFile(file);
        setAddBillParseResult(parseResult);
        setAddStage('human-review');
      } catch (err) {
        console.error('beginBillUpload', err);
        setAddServiceError(err instanceof Error ? err.message : 'Upload failed');
        setAddStage('upload');
      }
    },
    [
      addServiceProductName,
      userId,
      persistPendingService,
      refreshUserServices,
      screen,
      closeAddService,
      contact.email,
      contact.name,
    ]
  );

  // Track which reviewed quotes (savings opportunities) the member has already
  // opened, so the sidebar "Quotes & Proposals" bubble only counts genuinely new ones.
  const [seenQuoteIds, setSeenQuoteIds] = useState<Set<string>>(() => {
    if (typeof window === 'undefined') return new Set<string>();
    try {
      const raw = window.localStorage.getItem(SEEN_QUOTES_STORAGE_KEY);
      return new Set<string>(raw ? (JSON.parse(raw) as string[]) : []);
    } catch {
      return new Set<string>();
    }
  });
  const markQuoteSeen = useCallback((id?: string | null) => {
    if (!id) return;
    setSeenQuoteIds((prev) => {
      if (prev.has(id)) return prev;
      const next = new Set(prev);
      next.add(id);
      if (typeof window !== 'undefined') {
        try {
          window.localStorage.setItem(SEEN_QUOTES_STORAGE_KEY, JSON.stringify([...next]));
        } catch {
          /* ignore quota / privacy-mode errors */
        }
      }
      return next;
    });
  }, []);

  // Track incoming Message Center messages (from the Candid team / Hank) and
  // when the member last opened the Message Center, so the sidebar shows a
  // bubble counting unread replies (TASK-022).
  const [mcIncomingTimes, setMcIncomingTimes] = useState<number[]>([]);
  const [mcLastSeen, setMcLastSeen] = useState<number>(() => {
    if (typeof window === 'undefined') return 0;
    const raw = window.localStorage.getItem(MC_LAST_SEEN_STORAGE_KEY);
    const n = raw ? Number(raw) : 0;
    return Number.isFinite(n) ? n : 0;
  });
  const refreshMemberMessages = useCallback(async () => {
    if (!userId) {
      setMcIncomingTimes([]);
      return;
    }
    try {
      if (isLocalPersistence()) {
        const { listLocalCustomerMessages, listLocalCustomerThreads } = await import(
          '@/lib/persistence/local-message-center'
        );
        const threads = listLocalCustomerThreads(userId);
        const msgs = listLocalCustomerMessages(threads.map((t) => t.id));
        const times: number[] = [];
        for (const m of msgs) {
          if (m.author !== 'customer') {
            const ms = new Date(m.created_at).getTime();
            if (Number.isFinite(ms)) times.push(ms);
          }
        }
        setMcIncomingTimes(times);
        return;
      }

      const res = await fetch('/api/portal/message-center');
      if (!res.ok) return;
      const data = (await res.json()) as { threads?: { messages?: { author?: string; created_at?: string }[] }[] };
      const times: number[] = [];
      for (const t of data.threads ?? []) {
        for (const m of t.messages ?? []) {
          if (m.author && m.author !== 'customer' && m.created_at) {
            const ms = new Date(m.created_at).getTime();
            if (Number.isFinite(ms)) times.push(ms);
          }
        }
      }
      setMcIncomingTimes(times);
    } catch {
      /* offline / unauthenticated — leave as-is */
    }
  }, [userId]);
  useEffect(() => {
    void refreshMemberMessages();
    const interval = setInterval(() => void refreshMemberMessages(), 60_000);
    return () => clearInterval(interval);
  }, [refreshMemberMessages]);
  const unreadMemberMessages = useMemo(
    () => mcIncomingTimes.filter((t) => t > mcLastSeen).length,
    [mcIncomingTimes, mcLastSeen],
  );
  // Opening the Message Center clears the bubble.
  useEffect(() => {
    if (memberView !== 'mmessages') return;
    const now = Date.now();
    setMcLastSeen(now);
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(MC_LAST_SEEN_STORAGE_KEY, String(now));
      } catch {
        /* ignore */
      }
    }
  }, [memberView, mcIncomingTimes]);

  const openMerchantAnalysis = useCallback(
    (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => {
      setProposalAnalysisView(null);
      setMerchantAnalysisView(snapshot);
      setMerchantAnalysisServiceId(serviceId ?? null);
      const svc = userServices.find((s) => s.id === serviceId);
      setMerchantAnalysisCandidManaged(Boolean(svc?.candidManaged && !svc?.pending));
      markQuoteSeen(serviceId);
      if (screen === 'admin') setAdminView('customers');
      else if (screen === 'member') setMemberView('mservices');
    },
    [screen, userServices, markQuoteSeen]
  );

  const openProposalAnalysis = useCallback(
    (snapshot: PublishedAnalysisSnapshot, reviewId: string, serviceId?: string) => {
      setMerchantAnalysisView(null);
      setProposalAnalysisView({ snapshot, reviewId, serviceId });
      markQuoteSeen(serviceId);
      if (screen === 'admin') setAdminView('customers');
      else if (screen === 'member') setMemberView('mservices');
    },
    [screen, markQuoteSeen],
  );

  const closeMerchantAnalysis = useCallback(() => {
    setMerchantAnalysisView(null);
    setProposalAnalysisView(null);
    setMerchantAnalysisServiceId(null);
    setMerchantAnalysisCandidManaged(false);
    setPendingBillReview(null);
  }, []);

  const openThemePicker = useCallback(() => {
    setMerchantAnalysisView(null);
    setProposalAnalysisView(null);
    setMerchantAnalysisServiceId(null);
    setMerchantAnalysisCandidManaged(false);
    setPendingBillReview(null);
    setThemePickerOpen(true);
    setAvatarMenuOpen(false);
    setMemberAvatarMenuOpen(false);
  }, []);

  const closeThemePicker = useCallback(() => {
    setThemePickerOpen(false);
  }, []);

  const openCustomerAccount = useCallback((customerId: string) => {
    closeMerchantAnalysis();
    setSelectedAnalysisReviewId(null);
    setAnalysisReviewReturnCustomerId(null);
    setAdminView('customers');
    setAdminCustomerId(customerId);
  }, [closeMerchantAnalysis]);

  const openLeadAccount = useCallback((leadKey: string) => {
    closeMerchantAnalysis();
    setSelectedAnalysisReviewId(null);
    setSelectedQuoteRequestId(null);
    setActionCenterTicketId(null);
    setAdminLeadFocusId(leadKey);
    setAdminView('leads');
  }, [closeMerchantAnalysis]);

  const openAnalysisReviewFromActionCenter = useCallback(
    (reviewId: string) => {
      closeMerchantAnalysis();
      setAnalysisReviewReturnCustomerId(null);
      setSelectedQuoteRequestId(null);
      setSelectedCustomerMessageThreadId(null);
      setAdminView('tickets');
      setActionCenterTab('analysis_review');
      setSelectedAnalysisReviewId(reviewId);
      setActionCenterOpen(true);
    },
    [closeMerchantAnalysis],
  );

  const openQuoteRequestFromActionCenter = useCallback(
    (quoteRequestId: string) => {
      closeMerchantAnalysis();
      setAnalysisReviewReturnCustomerId(null);
      setSelectedAnalysisReviewId(null);
      setAdminView('tickets');
      setActionCenterTab('quote_request');
      setSelectedQuoteRequestId(quoteRequestId);
      setActionCenterOpen(true);
    },
    [closeMerchantAnalysis],
  );

  const closeQuoteRequest = useCallback(() => {
    setSelectedQuoteRequestId(null);
    const returnView = consumeActionReturn();
    if (returnView) setAdminView(returnView);
  }, [consumeActionReturn]);

  const openCustomerMessageCenter = useCallback(
    (threadId?: string | null) => {
      closeMerchantAnalysis();
      setMessageCenterSection('customers');
      setAdminView('custmessages');
      setSelectedCustomerMessageThreadId(threadId ?? null);
    },
    [closeMerchantAnalysis],
  );

  const openAnalysisReviewFromAccount = useCallback(
    (reviewId: string) => {
      closeMerchantAnalysis();
      if (adminCustomerId) {
        setAnalysisReviewReturnCustomerId(adminCustomerId);
      }
      setAdminView('tickets');
      setActionCenterTab('analysis_review');
      setSelectedAnalysisReviewId(reviewId);
      setActionCenterOpen(true);
    },
    [closeMerchantAnalysis, adminCustomerId],
  );

  const closeAnalysisReview = useCallback(() => {
    const returnCustomerId = analysisReviewReturnCustomerId;
    const returnView = consumeActionReturn();
    setSelectedAnalysisReviewId(null);
    setAnalysisReviewReturnCustomerId(null);
    if (returnView) {
      setAdminView(returnView);
    } else if (returnCustomerId) {
      setAdminView('customers');
      setAdminCustomerId(returnCustomerId);
    }
  }, [analysisReviewReturnCustomerId, consumeActionReturn]);

  // Returning from a ticket detail opened via deep-link (e.g. a Message Center
  // mention) should land back where the user came from.
  const handleTicketDetailClose = useCallback(() => {
    const returnView = consumeActionReturn();
    setActionCenterTicketId(null);
    if (returnView) setAdminView(returnView);
  }, [consumeActionReturn]);

  const openActionCenter = useCallback(
    (tab: ActionCenterTab = 'all') => {
      closeMerchantAnalysis();
      actionReturnViewRef.current = null;
      setActionReturnView(null);
      setAdminView('tickets');
      setActionCenterTab(tab);
      setSelectedAnalysisReviewId(null);
      setSelectedQuoteRequestId(null);
      setSelectedCustomerMessageThreadId(null);
      setAnalysisReviewReturnCustomerId(null);
      setActionCenterOpen(true);
    },
    [closeMerchantAnalysis],
  );

  const openOutreachFromActionCenter = useCallback((outreachAccountId: string) => {
    rememberActionReturn('tickets');
    closeMerchantAnalysis();
    setAdminView('outreach');
    setOutreachDeepLinkId(outreachAccountId);
  }, [closeMerchantAnalysis, rememberActionReturn]);

  const openActionCenterTicket = useCallback(
    (ticketId: string, tab: ActionCenterTab = 'all') => {
      closeMerchantAnalysis();
      setSelectedAnalysisReviewId(null);
      setSelectedQuoteRequestId(null);
      setSelectedCustomerMessageThreadId(null);
      setAnalysisReviewReturnCustomerId(null);
      if (ticketId.startsWith('quote-req-')) {
        setAdminView('tickets');
        setActionCenterTab(tab);
        setSelectedQuoteRequestId(ticketId.replace(/^quote-req-/, ''));
        setSelectedCustomerMessageThreadId(null);
        setActionCenterTicketId(null);
      } else if (ticketId.startsWith('cust-msg-')) {
        openCustomerMessageCenter(ticketId.replace(/^cust-msg-/, ''));
        return;
      } else if (ticketId.startsWith('outreach-')) {
        openOutreachFromActionCenter(ticketId.replace(/^outreach-/, ''));
        return;
      } else {
        setAdminView('tickets');
        setActionCenterTab(tab);
        setActionCenterTicketId(ticketId);
      }
      setActionCenterOpen(true);
    },
    [closeMerchantAnalysis, openCustomerMessageCenter, openOutreachFromActionCenter],
  );

  const enterPortalPreview = useCallback(
    (contact: Contact, customer: Customer) => {
      const grant = adminPreviewGrant(contact, customer);
      if (!grant) return;
      startPortalPreview(grant);
      setPortalPreviewActive(true);
      closeMerchantAnalysis();
      setMemberView('mdashboard');
      setScreen('member');
    },
    [closeMerchantAnalysis],
  );

  const exitPortalPreview = useCallback(() => {
    endPortalPreview();
    setPortalPreviewActive(false);
    setScreen('admin');
    setAdminView('customers');
  }, []);

  // Preview only lives on the member shell. Returning to admin must fully drop
  // customer identity (scope + cookie + flag) — the previous sync-from-storage
  // effect could leave the top bar showing the customer after an incomplete exit.
  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (appRole === 'admin' && screen === 'admin') {
      if (isPortalPreviewActive() || getPortalSessionScope()) {
        endPortalPreview();
      }
      setPortalPreviewActive(false);
      syncPortalPreviewCookieFromScope();
      return;
    }
    if (appRole === 'admin' && screen === 'member') {
      // Keep preview flag + cookie alive whenever a customer scope is present so
      // portal APIs can resolve the impersonated account.
      const restored = restoreAdminPortalPreviewFromScope();
      setPortalPreviewActive(restored);
      syncPortalPreviewCookieFromScope();
      return;
    }
    setPortalPreviewActive(isPortalPreviewActive());
    syncPortalPreviewCookieFromScope();
  }, [screen, appRole]);

  const portalScope = typeof window !== 'undefined' ? getPortalSessionScope() : null;
  // Admin customer view needs scope while on the member shell even if React preview
  // state briefly lags behind localStorage after Login as customer.
  const portalScopeForMember =
    appRole === 'admin'
      ? screen === 'member' && (portalPreviewActive || isPortalPreviewActive() || Boolean(portalScope))
        ? portalScope
        : null
      : portalScope;
  const [portalLocationViewFilter, setPortalLocationViewFilter] = useState<PortalLocationViewFilter>(null);
  const [portalHasMasterAccess, setPortalHasMasterAccess] = useState(false);

  const portalCustomer = useMemo(
    () => crmCustomers.find((c) => c.id === portalScopeForMember?.customerId),
    [crmCustomers, portalScopeForMember?.customerId],
  );

  useEffect(() => {
    if (!userId || !portalScopeForMember) {
      setPortalHasMasterAccess(false);
      return;
    }
    void fetch('/api/portal/locations')
      .then((res) => (res.ok ? res.json() : null))
      .then((data: { hasMasterAccess?: boolean } | null) => {
        setPortalHasMasterAccess(Boolean(data?.hasMasterAccess));
      })
      .catch(() => setPortalHasMasterAccess(false));
  }, [userId, portalScopeForMember?.customerId]);

  const effectiveMemberLocationIds = useMemo(
    () =>
      resolveEffectiveMemberLocationIds({
        scope: portalScopeForMember,
        customer: portalCustomer,
        viewFilter: portalLocationViewFilter,
      }),
    [portalScopeForMember, portalCustomer, portalLocationViewFilter],
  );

  const memberServices = useMemo(
    () =>
      buildMemberServicesList({
        userId,
        userServices,
        portalCustomerId: portalScopeForMember?.customerId,
        locationIds: effectiveMemberLocationIds,
        demoServices: DEMO_SERVICES,
        portalPreviewActive,
      }),
    [
      userId,
      userServices,
      portalScopeForMember?.customerId,
      effectiveMemberLocationIds,
      portalPreviewActive,
      memberServicesRevision,
    ],
  );
  const portalScopedUserServices = useMemo(
    () =>
      portalScopeForMember
        ? userServicesForPortalScope(userServices, portalScopeForMember.customerId)
        : userServices,
    [userServices, portalScopeForMember],
  );
  const memberSavingsOpportunities = useMemo(
    () => buildSavingsOpportunityList(portalScopedUserServices),
    [portalScopedUserServices],
  );
  const readyQuotes = useMemo(
    () =>
      memberSavingsOpportunities.filter(
        (s) => !s.pending && (s.merchantAnalysis || (s.analysisSnapshot && s.analysisReviewId)),
      ),
    [memberSavingsOpportunities],
  );
  const pendingQuotes = useMemo(
    () => memberSavingsOpportunities.filter((s) => s.pending),
    [memberSavingsOpportunities],
  );
  const newPublishedQuoteRequests = useMemo(
    () =>
      memberQuoteRequests.filter(
        (q) => isQuoteRequestPublished(q) && !seenQuoteIds.has(memberQuoteSeenId(q.id)),
      ),
    [memberQuoteRequests, seenQuoteIds],
  );
  const newReviewedQuotes = useMemo(
    () => readyQuotes.filter((s) => !seenQuoteIds.has(s.id)),
    [readyQuotes, seenQuoteIds],
  );
  const [quoteDraftBadge, setQuoteDraftBadge] = useState(0);
  useEffect(() => {
    const refresh = () => setQuoteDraftBadge(hasSavedQuoteDraft() ? 1 : 0);
    refresh();
    window.addEventListener(QUOTE_DRAFT_CHANGED_EVENT, refresh);
    window.addEventListener('storage', refresh);
    return () => {
      window.removeEventListener(QUOTE_DRAFT_CHANGED_EVENT, refresh);
      window.removeEventListener('storage', refresh);
    };
  }, [memberView, newQuoteOpen]);
  const quotesSidebarBadge =
    newReviewedQuotes.length + newPublishedQuoteRequests.length + quoteDraftBadge;

  const [memberNotifications, setMemberNotifications] = useState<MemberNotificationLite[]>([]);
  const memberReviewRequestsForPortal = useMemo(() => {
    const customerId = portalScopeForMember?.customerId;
    return memberReviewRequests.filter((r) => {
      if (customerId && r.crm_customer_id !== customerId) return false;
      if (portalPreviewActive) return true;
      return !userId || r.user_id === userId;
    });
  }, [memberReviewRequests, portalScopeForMember?.customerId, portalPreviewActive, userId]);
  const memberNotificationsForPortal = useMemo(
    () => (portalPreviewActive && portalScopeForMember ? [] : memberNotifications),
    [portalPreviewActive, portalScopeForMember, memberNotifications],
  );
  const memberTicketsForPortal = useMemo(() => {
    let tickets = customerTickets.filter(
      (t) => t.status === 'open' || t.status === 'in_progress',
    );
    if (userId) tickets = tickets.filter((t) => t.user_id === userId);
    if (portalScopeForMember) {
      const email = contactEmailForPortalScope(portalScopeForMember)?.toLowerCase();
      const company = portalScopeForMember.companyName.trim().toLowerCase();
      tickets = tickets.filter((t) => {
        const ticketEmail = t.customer_email.trim().toLowerCase();
        const ticketName = t.customer_name.trim().toLowerCase();
        if (email && ticketEmail === email) return true;
        if (company && (ticketName === company || ticketName.includes(company) || company.includes(ticketName))) {
          return true;
        }
        return false;
      });
    }
    return tickets;
  }, [customerTickets, userId, portalScopeForMember]);
  const refreshMemberNotifications = useCallback(async () => {
    if (!userId) {
      setMemberNotifications([]);
      return;
    }
    try {
      const res = await fetch('/api/portal/notifications');
      if (!res.ok) return;
      const data = (await res.json()) as { notifications?: MemberNotificationLite[] };
      setMemberNotifications(data.notifications ?? []);
    } catch {
      /* offline / unauthenticated — leave as-is */
    }
  }, [userId]);
  useEffect(() => {
    void refreshMemberNotifications();
  }, [refreshMemberNotifications, userServices]);
  const markMemberNotificationRead = useCallback((id: string) => {
    setMemberNotifications((prev) =>
      prev.map((n) => (n.id === id ? { ...n, read_at: new Date().toISOString() } : n)),
    );
    void fetch('/api/portal/notifications', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id }),
    }).catch(() => {});
  }, []);
  const unreadMemberNotifications = useMemo(
    () => memberNotificationsForPortal.filter((n) => !n.read_at),
    [memberNotificationsForPortal],
  );
  // Customer topbar alerts: ready quotes + portal notifications, deep-linked (TASK-024).
  const memberAlertItems = useMemo<AlertItem[]>(() => {
    const items: AlertItem[] = [];
    for (const q of newReviewedQuotes) {
      items.push({
        id: `quote:${q.id}`,
        icon: 'sparkles',
        severity: 'success',
        title: 'A new quote is ready to review',
        body: q.name || q.vendor || undefined,
        unread: true,
        onOpen: () => setMemberView('msavings'),
      });
    }
    for (const q of newPublishedQuoteRequests) {
      items.push({
        id: `quote-req:${q.id}`,
        icon: 'reports',
        severity: 'success',
        title: 'A new quote is ready to review',
        body: q.subject ?? undefined,
        unread: true,
        onOpen: () => {
          setActivePublishedQuoteId(q.id);
          markQuoteSeen(memberQuoteSeenId(q.id));
          setMemberView('msavings');
        },
      });
    }
    for (const n of memberNotificationsForPortal) {
      const openQuote =
        n.type === 'quote_published' && n.quote_request_id
          ? () => {
              setActivePublishedQuoteId(n.quote_request_id!);
              setMemberView('mdashboard');
            }
          : undefined;
      items.push({
        id: `notif:${n.id}`,
        icon: 'alerts',
        severity: n.read_at ? 'info' : 'urgent',
        title: n.title,
        body: n.body,
        time: formatCustomerTicketTime(n.created_at),
        unread: !n.read_at,
        onOpen: () => {
          if (!n.read_at) markMemberNotificationRead(n.id);
          if (openQuote) openQuote();
          else setMemberView('mdashboard');
        },
        actions: n.read_at
          ? undefined
          : [{ label: 'Mark read', icon: 'check', onClick: () => markMemberNotificationRead(n.id) }],
      });
    }
    return items;
  }, [newReviewedQuotes, newPublishedQuoteRequests, memberNotificationsForPortal, markMemberNotificationRead, markQuoteSeen]);
  const memberOpenReviewRequestKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const r of memberReviewRequestsForPortal) {
      if (r.status === 'resolved') continue;
      if (r.account_service_id) keys.add(r.account_service_id);
      if (r.analysis_review_id) keys.add(`review:${r.analysis_review_id}`);
    }
    return keys;
  }, [memberReviewRequestsForPortal]);
  const isMemberReviewRequested = useCallback(
    (svc: ServiceCardModel) => {
      if (memberOpenReviewRequestKeys.has(svc.id)) return true;
      return Boolean(svc.analysisReviewId && memberOpenReviewRequestKeys.has(`review:${svc.analysisReviewId}`));
    },
    [memberOpenReviewRequestKeys],
  );
  const isHelpInProgress = useCallback(
    (svc: ServiceCardModel) => {
      if (isMemberReviewRequested(svc)) return true;
      return customerTickets.some(
        (t) =>
          t.user_id === userId &&
          (t.status === 'open' || t.status === 'in_progress') &&
          (t.service_id === svc.id || t.service_name === svc.name),
      );
    },
    [isMemberReviewRequested, customerTickets, userId],
  );
  const openGetHelp = useCallback((context?: ServiceRequestContext) => {
    setServiceRequestContext(context ?? 'general');
  }, []);
  const memberVendorNames = useMemo(
    () => [...new Set(memberServices.map((s) => s.vendor).filter(Boolean))],
    [memberServices],
  );
  const memberServicesForGate = memberServices;
  const analysisContentGated =
    screen === 'member'
    && shouldGateAnalysis(memberServicesForGate, analysisUnlocked || portalScopeForMember?.tier === 'full');

  const submitCustomerTicket = useCallback(
    async (service: ServiceCardModel, subject: string, message: string) => {
      if (!userId) return;
      const created = await insertCustomerTicket({
        userId,
        serviceId: service.id,
        serviceName: service.name,
        subject,
        message,
        customerName: contact.name,
        customerEmail: contact.email,
      });
      if (created) {
        setCustomerTickets((prev) => [created, ...prev.filter((t) => t.id !== created.id)]);
        notifyActionCenterRefresh();
      }
      void refreshCustomerTickets();
    },
    [userId, contact.name, contact.email, refreshCustomerTickets]
  );

  const resolveCustomerTicket = useCallback(
    async (ticketId: string) => {
      const ok = await updateCustomerTicketStatusAdmin(ticketId, 'resolved');
      if (ok) await refreshCustomerTickets();
    },
    [refreshCustomerTickets]
  );

  const resolveAnalysisTicket = useCallback(
    async (ticketId: string) => {
      const supabase = createSupabaseBrowserClient();
      await supabase.from('analysis_tickets').update({ status: 'resolved' }).eq('id', ticketId);
      await refreshAnalysisTickets();
    },
    [refreshAnalysisTickets]
  );

  const dismissStatementReview = useCallback((sourceId: string) => {
    dismissDemoStatementReview(sourceId);
    setTicketEpoch((e) => e + 1);
  }, []);

  const setServiceTicketInProgress = useCallback(
    async (ticketId: string) => {
      const ok = await updateCustomerTicketStatusAdmin(ticketId, 'in_progress');
      if (ok) await refreshCustomerTickets();
    },
    [refreshCustomerTickets],
  );

  const resolveReviewRequest = useCallback(async (requestId: string) => {
    const ok = await updateMemberReviewRequestStatus(requestId, 'resolved');
    if (ok) setReviewRequestEpoch((e) => e + 1);
  }, []);

  const setReviewRequestInProgress = useCallback(async (requestId: string) => {
    const ok = await updateMemberReviewRequestStatus(requestId, 'in_progress');
    if (ok) setReviewRequestEpoch((e) => e + 1);
  }, []);

  const resolveQuoteRequest = useCallback(async (requestId: string) => {
    const ok = await updateQuoteRequestStatus(requestId, 'resolved');
    if (ok) setQuoteRequestEpoch((e) => e + 1);
  }, []);

  const setQuoteRequestInProgress = useCallback(async (requestId: string) => {
    const ok = await updateQuoteRequestStatus(requestId, 'in_progress');
    if (ok) setQuoteRequestEpoch((e) => e + 1);
  }, []);

  const resolveContractSubmitAction = useCallback(async (actionId: string) => {
    const ok = await updateContractSubmitActionStatus(actionId, 'customer_contract_signed');
    if (ok) {
      setContractSubmitEpoch((e) => e + 1);
      setActionWorkEpoch((n) => n + 1);
    }
  }, []);

  const setContractSubmitInProgress = useCallback(async (actionId: string) => {
    const ok = await updateContractSubmitActionStatus(actionId, 'supplier_contract_requested');
    if (ok) setContractSubmitEpoch((e) => e + 1);
  }, []);

  const refreshContractPipeline = useCallback(() => {
    setContractSubmitEpoch((e) => e + 1);
    setActionWorkEpoch((n) => n + 1);
  }, []);

  const replyToServiceTicket = useCallback(async (ticketId: string, message: string) => {
    const ticket = customerTickets.find((t) => t.id === ticketId);
    const status = ticket?.status === 'open' ? 'in_progress' : (ticket?.status ?? 'in_progress');
    const ok = await updateCustomerTicketStatusAdmin(ticketId, status, {
      replyMessage: message,
      notifyMember: true,
    });
    if (ok) setTicketEpoch((e) => e + 1);
    return ok;
  }, [customerTickets]);

  const replyToReviewRequest = useCallback(async (requestId: string, message: string) => {
    const req = memberReviewRequests.find((r) => r.id === requestId);
    const status = req?.status === 'open' ? 'in_progress' : (req?.status ?? 'in_progress');
    const ok = await updateMemberReviewRequestStatus(requestId, status, {
      replyMessage: message,
      notifyMember: true,
    });
    if (ok) setReviewRequestEpoch((e) => e + 1);
    return ok;
  }, [memberReviewRequests]);

  const refreshMemberQuoteRequests = useCallback(async () => {
    if (screen !== 'member') return;
    setMemberQuoteRequests(await fetchMemberQuoteRequests());
  }, [screen]);

  useEffect(() => {
    void refreshMemberQuoteRequests();
  }, [refreshMemberQuoteRequests, quoteRequestEpoch, memberNotifications.length]);

  const publishedMemberQuotes = useMemo(
    () => memberQuoteRequests.filter(isQuoteRequestPublished),
    [memberQuoteRequests],
  );

  const activePublishedQuote = useMemo(
    () => publishedMemberQuotes.find((q) => q.id === activePublishedQuoteId) ?? null,
    [publishedMemberQuotes, activePublishedQuoteId],
  );

  const adminUnifiedTickets = useMemo(
    () => {
      const outreachById = new Map(
        outreachAccounts.map((row) => [
          row.id,
          {
            id: row.id,
            company: row.company,
            customerExternalId: row.customerExternalId,
            contactEmail: row.contact?.email || undefined,
            statusLabel: OUTREACH_STATUS_LABELS[row.status],
            nextFollowUpAt: row.nextFollowUpAt,
          },
        ]),
      );
      const outreachTickets = buildOutreachTicketsFromActionWork(actionWorkByKey, outreachById);
      const base = buildUnifiedAdminTickets(
        customerTickets,
        analysisTickets,
        true,
        crmCustomers,
        analysisReviews,
        memberReviewRequests,
        quoteRequests,
        customerMessageThreads,
        memberServiceRequests,
        contractSubmitActions,
      );
      return mergeActionWorkIntoTickets([...base, ...outreachTickets], actionWorkByKey);
    },
    [customerTickets, analysisTickets, ticketEpoch, crmCustomers, analysisReviews, memberReviewRequests, quoteRequests, customerMessageThreads, memberServiceRequests, contractSubmitActions, actionWorkByKey, outreachAccounts],
  );

  useEffect(() => {
    if (appRole !== 'admin') return;
    void fetchActionWorkMap()
      .then(setActionWorkByKey)
      .catch((err) => console.error('fetchActionWorkMap', err));
  }, [appRole, actionWorkEpoch]);

  useEffect(() => {
    if (appRole !== 'admin') return;
    void listOutreachAccounts('all')
      .then((data) => setOutreachAccounts(data.items))
      .catch(() => setOutreachAccounts([]));
  }, [appRole, actionWorkEpoch]);

  const refreshActionWork = useCallback(() => {
    setActionWorkEpoch((n) => n + 1);
  }, []);

  // Admin topbar alerts: newest open portal work, deep-linked to the action (TASK-024).
  const TICKET_KIND_ICON: Record<string, AppIconName> = {
    service: 'messages',
    analysis: 'sparkles',
    analysis_review: 'chart',
    review_request: 'sparkles',
    quote_request: 'reports',
    submit_contract: 'check',
    submit_contract_to_customer: 'check',
    customer_message: 'messages',
    service_request: 'messages',
    statement: 'chart',
    statement_review: 'chart',
    renewal: 'calendar',
    optimization: 'bolt',
    outreach: 'broadcast',
  };
  const adminAlertItems = useMemo<AlertItem[]>(() => {
    const slaForTicket = (t: UnifiedAdminTicket): 'breached' | 'approaching' | null => {
      if (t.status === 'resolved') return null;
      const hrs = (Date.now() - new Date(t.createdAt).getTime()) / 3_600_000;
      if (hrs >= 48) return 'breached';
      if (hrs >= 24) return 'approaching';
      return null;
    };
    const claimedByOther = (t: UnifiedAdminTicket): boolean => {
      if (!userId || !t.claimerIds?.length) return false;
      return !t.claimerIds.includes(userId);
    };

    const open = adminUnifiedTickets.filter((t) => t.status !== 'resolved');
    open.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    return open
      .filter((t) => {
        if (t.kind === 'outreach') {
          return Boolean(userId && t.assigneeIds?.includes(userId));
        }
        const sla = slaForTicket(t);
        if (sla === 'breached') return true;
        if (claimedByOther(t)) return false;
        return true;
      })
      .slice(0, 12)
      .map((t) => {
        const sla = slaForTicket(t);
        return {
          id: t.id,
          icon: TICKET_KIND_ICON[t.kind] ?? 'alerts',
          severity: sla === 'breached' || t.status === 'open' ? 'urgent' : 'info',
          title: sla === 'breached' ? `${t.title} · SLA breached` : t.title,
          body: t.customerName,
          time: t.timeLabel,
          unread: t.status === 'open' || sla === 'breached',
          onOpen: () => openActionCenterTicket(t.id),
        };
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [adminUnifiedTickets, openActionCenterTicket, userId]);

  const adminOpenTicketCount = useMemo(
    () => adminAlertItems.filter((item) => item.unread).length,
    [adminAlertItems],
  );

  // "+" quick actions next to the admin search (TASK-031).
  const adminQuickActions = useMemo<QuickAction[]>(
    () => [
      { id: 'quote', label: 'Create a quote', icon: 'reports', onClick: () => { closeMerchantAnalysis(); setAdminView('customers'); } },
      { id: 'customer', label: 'Create a customer', icon: 'building', onClick: () => { closeMerchantAnalysis(); setAdminCustomerId(null); setAdminView('customers'); } },
      { id: 'agent', label: 'Create an agent', icon: 'specialist', onClick: () => { closeMerchantAnalysis(); setAdminView('agents'); } },
      { id: 'supplier', label: 'Create a supplier', icon: 'handshake', onClick: () => { closeMerchantAnalysis(); setAdminSupplierId(null); setAdminView('partners'); } },
      { id: 'expense', label: 'Create an expense', icon: 'card', onClick: () => { closeMerchantAnalysis(); setAdminView('expenses'); } },
    ],
    [closeMerchantAnalysis],
  );

  const unreadCustomerMessageCount = useMemo(
    () => countUnreadCustomerMessageThreads(customerMessageThreads),
    [customerMessageThreads],
  );

  const actionCenterOpenCountByTab = useMemo(() => {
    const open = adminUnifiedTickets.filter((t) => t.status !== 'resolved');
    const mineOpen = open.filter((t) => Boolean(userId && t.assigneeIds?.includes(userId)));
    return {
      mine: mineOpen.length,
      all: open.filter((t) => t.kind !== 'outreach').length,
      outreach: mineOpen.filter((t) => t.kind === 'outreach').length,
      customer_message: unreadCustomerMessageCount,
      review_request: open.filter((t) => t.kind === 'review_request').length,
      quote_request: open.filter((t) => t.kind === 'quote_request').length,
      submit_contract: open.filter((t) => t.kind === 'submit_contract').length,
      submit_contract_to_customer: open.filter((t) => t.kind === 'submit_contract_to_customer').length,
      analysis_review: open.filter((t) => t.kind === 'analysis_review').length,
      statement: open.filter((t) => t.kind === 'statement').length,
      service: open.filter((t) => t.kind === 'service').length,
      analysis: open.filter((t) => t.kind === 'analysis').length,
      renewal: open.filter((t) => t.kind === 'renewal').length,
      optimization: open.filter((t) => t.kind === 'optimization').length,
    } as Record<ActionCenterTab, number>;
  }, [adminUnifiedTickets, userId, unreadCustomerMessageCount]);

  const openSupplierFromSearch = useCallback(
    (providerId: string) => {
      closeMerchantAnalysis();
      setAdminCommissionPartnerKey(null);
      setAdminSupplierId(providerId);
      setAdminView('partners');
    },
    [closeMerchantAnalysis],
  );

  const openCommissionPartnerFromSearch = useCallback(
    (partnerKey: string) => {
      closeMerchantAnalysis();
      setAdminSupplierId(null);
      setAdminCommissionPartnerKey(partnerKey);
      setAdminView('partners');
    },
    [closeMerchantAnalysis],
  );

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const [providers, partners] = await Promise.all([
        loadSolutionProviders(),
        fetchPartnerSuppliers(),
      ]);
      if (cancelled) return;
      setSearchSolutionProviders(providers);
      setSearchCommissionPartners(partners);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(
    () =>
      onSolutionProvidersUpdated(() => {
        void loadSolutionProviders().then(setSearchSolutionProviders);
      }),
    [],
  );

  const adminSearchItems = useMemo(
    () =>
      buildAdminGlobalSearchItems({
        actions: {
          openActionCenter,
          openActionCenterTicket,
          openCustomerAccount,
          openAnalysisReview: openAnalysisReviewFromActionCenter,
          openSupplier: openSupplierFromSearch,
          openCommissionPartner: openCommissionPartnerFromSearch,
          setAdminView,
          closeMerchantAnalysis,
        },
        customers: crmCustomers,
        contractsByCustomerId,
        documentsByCustomerId,
        adminTickets: adminUnifiedTickets,
        bmwDeals,
        agentRates,
        leads: [...portalLeads, ...INITIAL_LEADS],
        solutionProviders: searchSolutionProviders,
        commissionPartners: searchCommissionPartners,
      }),
    [
      openActionCenter,
      openActionCenterTicket,
      openCustomerAccount,
      openAnalysisReviewFromActionCenter,
      openSupplierFromSearch,
      openCommissionPartnerFromSearch,
      closeMerchantAnalysis,
      crmCustomers,
      contractsByCustomerId,
      documentsByCustomerId,
      adminUnifiedTickets,
      bmwDeals,
      agentRates,
      portalLeads,
      searchSolutionProviders,
      searchCommissionPartners,
    ],
  );

  const memberSearchItems = useMemo(
    () =>
      buildMemberGlobalSearchItems({
        actions: {
          setMemberView,
          closeMerchantAnalysis,
          openMerchantAnalysis,
          openProposalAnalysis,
          openServiceDetail: setServiceDetail,
        },
        // Scope to the logged-in / previewed customer — never the admin's full catalog.
        userServices: memberServices,
        customerTickets: memberTicketsForPortal,
      }),
    [
      closeMerchantAnalysis,
      openMerchantAnalysis,
      openProposalAnalysis,
      memberServices,
      memberTicketsForPortal,
    ],
  );

  const hankPageContext = useMemo((): AdminHankPageContext => {
    const viewLabel = adminViewLabel(adminView);
    const base: AdminHankPageContext = { view: adminView, viewLabel };
    if (adminView !== 'customers' || !adminCustomerId) return base;
    const customer = crmCustomers.find((c) => c.id === adminCustomerId);
    if (!customer) return base;
    const primary = customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
    const openActions = mergeCustomerActions(customer.id, customer.portal?.actions ?? []);
    return {
      ...base,
      customer: {
        id: customer.id,
        company: customer.company,
        status: customer.status,
        agent: customer.agent,
        industry: customer.industry,
        website: customer.website,
        spend: customer.spend,
        notes: customer.notes,
        portal: customer.portal,
        openActions,
        contracts: contractsByCustomerId[customer.id] ?? [],
        primaryContact: primary
          ? {
              name: primary.name,
              email: primary.email,
              phone: primary.phone,
              role: primary.role,
            }
          : undefined,
      },
    };
  }, [adminView, adminCustomerId, crmCustomers, contractsByCustomerId]);

  const removeMemberService = useCallback(
    async (svc: ServiceCardModel) => {
      if (svc.candidManaged || svc.id.startsWith('portal-ct-') || !userId) return;
      if (!window.confirm(`Remove ${svc.name} from your services? This cannot be undone.`)) return;

      if (isLocalPersistence()) {
        deleteLocalAccountService(svc.id);
        await refreshUserServices();
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { data: row, error: loadErr } = await supabase
        .from('account_services')
        .select('bill_storage_path, candid_managed')
        .eq('id', svc.id)
        .maybeSingle();

      if (loadErr || !row || row.candid_managed) {
        console.error('removeMemberService', loadErr ?? 'Candid-managed service');
        return;
      }

      if (row.bill_storage_path) {
        await supabase.storage.from('service-bills').remove([row.bill_storage_path]);
      }

      const { error } = await supabase.from('account_services').delete().eq('id', svc.id);
      if (error) {
        console.error('removeMemberService', error);
        return;
      }
      await refreshUserServices();
    },
    [userId, refreshUserServices],
  );

  const renameMemberService = useCallback(
    async (serviceId: string, name: string) => {
      if (!userId || !name.trim()) return;
      const supabase = createSupabaseBrowserClient();
      const logoKey = logoKeyFromLabel(name);
      const { error } = await supabase
        .from('account_services')
        .update({ name: name.trim(), logo_key: logoKey })
        .eq('id', serviceId)
        .eq('user_id', userId);
      if (error) throw error;

      const { data: reviewRow } = await supabase
        .from('bill_analysis_reviews')
        .select('id')
        .eq('account_service_id', serviceId)
        .maybeSingle();
      if (reviewRow?.id) {
        await supabase.from('bill_analysis_reviews').update({ vendor_name: name.trim() }).eq('id', reviewRow.id);
      }

      await refreshUserServices();
    },
    [userId, refreshUserServices],
  );

  const handleSavingsBillUpload = useCallback(
    async (file: File, productName: string) => {
      const vendorName = productName.trim();
      if (!vendorName) {
        throw new Error('Enter a vendor or service name before uploading your bill.');
      }
      if (userId) {
        const fp = await billFingerprint(file);
        if (await isDuplicateBill(userId, fp)) {
          throw new Error('duplicate');
        }
        setAddServiceProductName(vendorName);
        let persisted: { rowId: string; storagePath: string } | null = null;
        try {
          persisted = await persistPendingService(file, vendorName, {
            candidManaged: false,
            savingsOpportunityOnly: true,
          });
          if (!persisted) throw new Error('Save failed');
          const { parseResult, review } = await parseAndQueueBillReview({
            userId,
            file,
            accountServiceId: persisted.rowId,
            vendorName,
            billStoragePath: persisted.storagePath,
            customerEmail: contactEmailForPortalScope(getPortalSessionScope()) ?? contact.email,
            customerName:
              getPortalSessionScope()?.companyName?.trim() ||
              contact.name ||
              undefined,
            crmCustomerId: getPortalSessionScope()?.customerId,
          });
          await saveBillFingerprint(userId, fp, file.name);
          await refreshUserServices();
          setPendingBillReview({
            reviewId: review.id,
            vendorName: review.vendor_name || parseResult.vendorName || vendorName,
            parseResult,
          });
          setMemberView('msavings');
        } catch (err) {
          if (persisted) await refreshUserServices();
          throw err;
        }
        return;
      }
      const parseResult = await parseBillFromFile(file, vendorName);
      setPendingBillReview({
        vendorName: parseResult.vendorName || vendorName,
        parseResult,
      });
      setMemberView('msavings');
    },
    [
      userId,
      persistPendingService,
      refreshUserServices,
      contact.email,
      contact.name,
    ]
  );

  const addSavingsOpportunityToServices = useCallback(
    async (svc: ServiceCardModel) => {
      if (!userId || svc.candidManaged) return;

      if (isLocalPersistence()) {
        updateLocalAccountService(svc.id, {
          savings_opportunity_only: false,
          status: svc.pending ? 'pending_analysis' : 'external',
        });
        await refreshUserServices();
        return;
      }

      const supabase = createSupabaseBrowserClient();
      const { error } = await supabase
        .from('account_services')
        .update({
          savings_opportunity_only: false,
          status: svc.pending ? 'pending_analysis' : 'external',
          updated_at: new Date().toISOString(),
        })
        .eq('id', svc.id)
        .eq('user_id', userId);
      if (error) throw error;
      await refreshUserServices();
    },
    [userId, refreshUserServices],
  );

  const analysisTopbarTitle = proposalAnalysisView
    ? proposalAnalysisView.snapshot.vendorName
    : merchantAnalysisView?.form.merchantName?.trim() || 'Merchant Processing Analysis';

  const shellTopbarTitle = themePickerOpen
    ? 'Pick Your Theme'
    : merchantAnalysisView || proposalAnalysisView
      ? analysisTopbarTitle
      : undefined;

  const finishAddServiceAndViewServices = () => {
    closeAddService();
    if (screen === 'admin') setAdminView('customers');
    else if (screen === 'member') setMemberView('mservices');
  };

  const handleFileSelect = (e: ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) void beginBillUpload(file);
    e.target.value = '';
  };
  const handleDrop = (e: DragEvent) => {
    e.preventDefault();
    setUploadDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void beginBillUpload(file);
  };

  // ── CHAT ────────────────────────────────────────────────────
  const sendChat = async (
    text?: string,
    opts?: { content?: string; displayText?: string },
  ) => {
    const msg = (opts?.content ?? text ?? chatInput).trim();
    if (!msg || chatLoading) return;
    setChatInput('');
    setChatLoading(true);
    const display = opts?.displayText ?? text ?? msg;
    setChatMessages(prev => [...prev, { type: 'user', text: display, time: now() }]);
    const historyWithUser = [...chatConversation, { role: 'user', content: msg }];
    try {
      const reply = await callHankAPI(historyWithUser);
      const finalConv = [...historyWithUser, { role: 'assistant', content: reply }];
      setChatConversation(finalConv);
      setChatMessages(prev => [...prev, { type: 'bot', text: reply, time: now() }]);
    } catch (err) {
      console.error('sendChat', err);
      const errText =
        "Something went wrong and I couldn't finish that reply. Please try again.";
      setChatConversation([
        ...historyWithUser,
        { role: 'assistant', content: errText },
      ]);
      setChatMessages(prev => [...prev, { type: 'bot', text: errText, time: now() }]);
    } finally {
      setChatLoading(false);
    }
  };

  // ── QUOTE ───────────────────────────────────────────────────
  const submitQuote = () => {
    if (!quoteName.trim() || !quoteCompany.trim() || !quoteEmail.trim() || !quotePhone.trim()) {
      setQuoteError('Please fill in your name, company, email, and phone number.'); return;
    }
    setQuoteError('');
    const selected = quoteSelectedPills.join(', ');
    const kind = quoteMode === 'add-services' ? 'add services / users to your existing setup' : 'a new quote';
    setQuoteConfirmText(`Thank you, <strong>${quoteName}</strong>. Your request to ${kind} has been sent to the Candid team. A specialist will reach out to <strong>${quoteEmail}</strong> within 1 business day${selected ? ' regarding: ' + selected : ''}.`);
    // Best-effort: record the request so the team sees it (non-blocking).
    void fetch('/api/portal/quote-request', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        mode: quoteMode,
        name: quoteName,
        company: quoteCompany,
        email: quoteEmail,
        phone: quotePhone,
        services: quoteSelectedPills,
      }),
    }).catch(() => {});
    setQuoteStage('confirm');
  };

  // ── SERVICEABILITY ──────────────────────────────────────────
  const runServiceability = () => {
    setSaResults([
      { name: 'Comcast Business', speed: '500 Mbps / 1 Gbps', price: '$220/mo', tag: 'Best value' },
      { name: 'AT&T Fiber', speed: '1 Gbps symmetric', price: '$190/mo', tag: 'Fastest' },
      { name: 'Spectrum Business', speed: '400 Mbps', price: '$175/mo', tag: 'Available now' },
      { name: 'Lumen/CenturyLink', speed: '100–500 Mbps', price: '$140/mo', tag: 'Budget option' },
      { name: 'Verizon Business', speed: '1 Gbps', price: '$210/mo', tag: 'Enterprise grade' },
      { name: 'Cox Business', speed: '300 Mbps', price: '$160/mo', tag: 'Regional option' },
    ]);
  };

  // ── PROSPECT ────────────────────────────────────────────────
  const addProspectFiles = (files: File[]) => {
    setProspectFiles(prev => {
      const next = [...prev];
      files.forEach(f => { if (!next.find(e => e.name === f.name)) next.push(f); });
      return next;
    });
  };

  const submitProspectForm = async () => {
    if (!pName.trim() || !pCompany.trim() || !pPhone.trim() || !pEmail.trim()) {
      setPError('Please fill in your name, company, phone number, and email address before submitting.');
      return;
    }
    if (!pEmail.includes('@') || !pEmail.includes('.')) {
      setPError('Please enter a valid email address.');
      return;
    }
    if (pHasBill === null) {
      setPError('Please tell us whether you have a current bill or contract to upload.');
      return;
    }
    if (pHasBill === 'yes' && prospectFiles.length === 0) {
      setPError('Please attach at least one bill, or choose “I don’t have a bill” below.');
      return;
    }
    if (pHasBill === 'no' && pCategories.length === 0 && !pLookingFor.trim() && !pVendorInterest.trim()) {
      setPError('Tell us what you’re looking for a quote on — pick a category or describe it.');
      return;
    }

    setPError('');
    setProspectStage('processing');
    setPProcessingLabel(
      pHasBill === 'yes'
        ? 'Sending your bills to the Candid team...'
        : 'Sending your quote request to the Candid team...',
    );

    const pdfBill =
      pHasBill === 'yes'
        ? prospectFiles.find(
            (f) => f.type === 'application/pdf' || f.name.toLowerCase().endsWith('.pdf'),
          )
        : undefined;

    try {
      if (pdfBill) {
        setPProcessingLabel('Analyzing your bill...');
        await parseBillFromFile(pdfBill);
      }
    } catch (err) {
      console.error('prospect analysis', err);
    }

    const cats = pCategories.map((id) => solutionCategoryLabel(id)).join(', ');
    const interestBits = [pVendorInterest.trim(), pLookingFor.trim(), cats].filter(Boolean);
    const interestLine = interestBits.length
      ? ` Looking for: <strong>${interestBits.join(' · ')}</strong>.`
      : '';
    const teamNote = pTeamEmails.trim() ? ` A copy will also be sent to: ${pTeamEmails}.` : '';

    if (pHasBill === 'yes') {
      setPConfirmText(
        `<strong>${pName}</strong>, your bills have been received by the Candid team. We detected your document type and a specialist will verify everything before sharing savings numbers.${interestLine} You'll hear from us at <strong>${pEmail}</strong> within 24 hours.${teamNote}`,
      );
    } else {
      setPConfirmText(
        `<strong>${pName}</strong>, your quote request is in the queue.${interestLine} A Candid specialist will follow up at <strong>${pEmail}</strong> within 24 hours — no bill required to get started.${teamNote}`,
      );
    }
    setProspectStage('confirm');
  };

  const resetProspect = () => {
    setProspectFiles([]);
    setProspectStage('form');
    setProspectAnalysisSnapshot(null);
    setPName('');
    setPCompany('');
    setPPhone('');
    setPEmail('');
    setPTeamEmails('');
    setPLookingFor('');
    setPCategories([]);
    setPVendorInterest('');
    setPHasBill(prospectIntent === 'quote' ? 'no' : null);
    setCalendarOpen(false);
  };

  const toggleProspectCategory = (id: SolutionCategoryId) => {
    setPCategories((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  };

  // ═══════════════════════════════════════════════════════════
  // ── RENDER ─────────────────────────────────────────────────
  // ═══════════════════════════════════════════════════════════

  const returningMember = isReturningMemberEmail(loginEmail);
  const loginTitle =
    role === 'prospect'
      ? prospectIntent === 'quote'
        ? 'Get a quote.'
        : 'Get your free analysis.'
      : returningMember
        ? 'Welcome back.'
        : 'Welcome to Candid.';
  const loginSubtitle =
    role === 'prospect'
      ? prospectIntent === 'quote'
        ? 'Tell us what you need — bill optional'
        : 'Upload a bill or request a quote — no account required'
      : returningMember
        ? 'Sign in to your Candid Intelligence account'
        : 'Sign in to access your intelligence platform';

  const memberDashboardRequests = useMemo(
    () =>
      buildMemberDashboardRequests({
        quoteRequests: memberQuoteRequests,
        pendingBills: pendingQuotes,
        readyBills: readyQuotes,
        openTickets: memberTicketsForPortal,
        reviewRequests: memberReviewRequestsForPortal.filter((r) => r.status !== 'resolved'),
        serviceRequests: memberPortalServiceRequests,
      }),
    [
      memberQuoteRequests,
      pendingQuotes,
      readyQuotes,
      memberTicketsForPortal,
      memberReviewRequestsForPortal,
      memberPortalServiceRequests,
    ],
  );

  const handleMemberRequestNavigate = useCallback(
    (target: MemberDashboardRequestTarget) => {
      if (target.view === 'msavings') {
        if ('publishedQuoteId' in target && target.publishedQuoteId) {
          setActivePublishedQuoteId(target.publishedQuoteId);
          markQuoteSeen(memberQuoteSeenId(target.publishedQuoteId));
        }
        setMemberView('msavings');
      } else if (target.view === 'mmessages') {
        setMemberView('mmessages');
      } else {
        setMemberView('mservices');
      }
    },
    [markQuoteSeen],
  );

  return (
    <ContactContext.Provider value={contact}>
    <>
      {/* Global in-portal document popup (TASK-030) */}
      <DocumentViewerHost />
      {/* ── LOGIN ─────────────────────────────────────────── */}
      {screen === 'login' && (
        <div className="login-screen">
          <div className="login-left">
            <div className="login-logo">
              <CandidLogo size="login" variant="white" />
            </div>
            <div className="login-tagline">
              Know what you're paying.<br />
              Know what you should be.<br />
              <span>Fix the difference.</span>
            </div>
            <p className="login-desc">
              Candid Intelligence Platform gives your business complete visibility into every technology cost — with AI-powered analysis, contract tracking, and real savings already negotiated on your behalf.
            </p>
            <div className="login-stats">
              <div><div className="ls-val">$8,240</div><div className="ls-label">LIFETIME SAVINGS</div></div>
              <div><div className="ls-val">5</div><div className="ls-label">SERVICES MANAGED</div></div>
              <div><div className="ls-val">2</div><div className="ls-label">EXPIRING SOON</div></div>
            </div>
          </div>

          <div className="login-right">
            <div className="login-card">
              <div className="login-card-logo">
                <CandidLogo size="login" variant="white" />
              </div>
              <h2>{loginTitle}</h2>
              <p>{loginSubtitle}</p>

              {/* Member vs prospect — admin access is determined by your email after sign-in */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 8, marginBottom: 24 }}>
                {(['member', 'prospect'] as Role[]).map(r => (
                  <div
                    key={r}
                    className={`role-pill${role === r ? ' active' : ''}`}
                    onClick={() => setRole(r)}
                  >
                    <div style={{ fontSize: 16, marginBottom: 4 }}>{r === 'member' ? <AppIcon name="building" size={16} /> : <AppIcon name="sparkles" size={16} />}</div>
                    <div style={{ fontSize: 11, fontWeight: 700 }}>{r === 'member' ? 'Member' : 'New Here?'}</div>
                    <div style={{ fontSize: 10, opacity: 0.85 }}>{r === 'member' ? 'Client portal' : 'Quote or free analysis'}</div>
                  </div>
                ))}
              </div>

              {role !== 'prospect' && (
                <div className="login-mode-toggle">
                  {(['password', 'magic'] as const).map((mode) => (
                    <button
                      key={mode}
                      type="button"
                      className={`login-mode-btn${loginMode === mode ? ' active' : ''}`}
                      onClick={() => setLoginMode(mode)}
                    >
                      {mode === 'magic' ? 'Email link' : 'Password'}
                    </button>
                  ))}
                </div>
              )}

              <form onSubmit={doLogin} noValidate>
              <div className="form-group">
                <label htmlFor="login-email">Email Address</label>
                <input id="login-email" type="email" value={loginEmail} onChange={e => setLoginEmail(e.target.value)} placeholder="you@company.com" autoComplete="email" />
              </div>

              {role !== 'prospect' && loginMode === 'password' && (
                <div className="form-group">
                  <label htmlFor="login-pass">Password</label>
                  <input id="login-pass" type="password" value={loginPass} onChange={e => setLoginPass(e.target.value)} placeholder="••••••••" autoComplete="current-password" />
                </div>
              )}

              {role !== 'prospect' && loginMode === 'magic' && (
                <div className="login-prospect-notice" style={{ marginBottom: 16 }}>
                  We&apos;ll email you a secure one-time sign-in link. No password needed.
                </div>
              )}

              {role === 'prospect' && (
                <div className="login-prospect-notice">
                  <HankMark size={13} /> <strong>No account needed.</strong> Request a quote, upload a
                  bill for savings analysis, or both — our team follows up within 24 hours.
                </div>
              )}

              {loginError && role !== 'prospect' ? (
                <div
                  style={{
                    border: '1px solid rgba(200,40,30,0.35)',
                    background: 'rgba(200,40,30,0.1)',
                    color: '#FCA5A5',
                    padding: '10px 12px',
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  {loginError}
                </div>
              ) : null}

              {loginNotice && role !== 'prospect' ? (
                <div
                  style={{
                    border: '1px solid rgba(26,122,74,0.35)',
                    background: 'rgba(26,122,74,0.12)',
                    color: '#6EE7B7',
                    padding: '10px 12px',
                    borderRadius: 6,
                    marginBottom: 16,
                    fontSize: 13,
                    lineHeight: 1.45,
                  }}
                >
                  {loginNotice}
                </div>
              ) : null}

              <button type="submit" className="login-btn" disabled={loginLoading}>
                {loginLoading
                  ? 'Please wait…'
                  : role === 'prospect'
                    ? 'Continue →'
                    : loginMode === 'magic'
                      ? 'Send Sign-In Link →'
                      : 'Sign In →'}
              </button>
              </form>

              <div className="login-footer-note">
                {role === 'prospect'
                  ? <span>Already a member? <span style={{ color: 'var(--red-light)', cursor: 'pointer' }} onClick={() => setRole('member')}>Sign in here →</span></span>
                  : <span>{loginMode === 'magic' ? <>Prefer a password? <span style={{ color: 'var(--red-light)', cursor: 'pointer' }} onClick={() => setLoginMode('password')}>Sign in with password</span><br /></> : <>Use <span style={{ color: 'var(--red-light)', cursor: 'pointer' }} onClick={() => setLoginMode('magic')}>email link</span> instead<br /></>}Not a client yet? <span style={{ color: 'var(--red-light)', cursor: 'pointer' }} onClick={() => { setRole('prospect'); setProspectIntent('analysis'); }}>Get started →</span></span>
                }
                <div style={{ marginTop: 10 }}>
                  <a href="/welcome" style={{ color: 'var(--red-light)' }}>
                    Explore Candid IQ →
                  </a>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── ADMIN SHELL ───────────────────────────────────── */}
      {screen === 'admin' && (
        <div className={`app-shell${shellClass}`} style={{ minHeight: '100vh' }}>
          <PortalSidebar
            className="sidebar"
            collapsed={effectiveCollapsed}
            onToggleCollapsed={toggleSidebar}
            userName={contact.name}
            userCompany={contact.company}
            userBadge="Candid Team"
            showUserBlock={false}
            logo={<CandidLogo size="sb" compact={effectiveCollapsed} />}
            onLogout={doLogout}
            bottomSlot={
              <>
                <AdminSidebarEditControls
                  collapsed={effectiveCollapsed}
                  editMode={adminNavEditMode}
                  onEditModeChange={setAdminNavEditMode}
                  onRestoreDefaults={() => {
                    const prefs = defaultAdminSidebarPreferences();
                    setAdminNavPrefs(prefs);
                    setAdminNavEditMode(false);
                    void persistAdminSidebarPreferences(prefs);
                  }}
                />
                <PersistenceModeControls collapsed={effectiveCollapsed} />
                <ClaudeUsageAnalyticsPanel collapsed={effectiveCollapsed} />
              </>
            }
          >
            <AdminSidebarNav
              order={adminNavPrefs.order}
              hidden={adminNavPrefs.hidden}
              onReorder={(next) => {
                const prefs = { ...adminNavPrefs, order: next };
                setAdminNavPrefs(prefs);
                void persistAdminSidebarPreferences(prefs);
              }}
              onToggleHidden={(id, visible) => {
                const hidden = visible
                  ? adminNavPrefs.hidden.filter((h) => h !== id)
                  : adminNavPrefs.hidden.includes(id)
                    ? adminNavPrefs.hidden
                    : [...adminNavPrefs.hidden, id];
                const prefs = { ...adminNavPrefs, hidden };
                setAdminNavPrefs(prefs);
                void persistAdminSidebarPreferences(prefs);
              }}
              editMode={adminNavEditMode}
              collapsed={effectiveCollapsed}
              adminView={adminView}
              setAdminView={setAdminView}
              closeThemePicker={closeThemePicker}
              closeMerchantAnalysis={closeMerchantAnalysis}
              actionCenterOpen={actionCenterOpen}
              setActionCenterOpen={setActionCenterOpen}
              actionCenterTab={actionCenterTab}
              setActionCenterTab={setActionCenterTab}
              selectedAnalysisReviewId={selectedAnalysisReviewId}
              setSelectedAnalysisReviewId={setSelectedAnalysisReviewId}
              selectedQuoteRequestId={selectedQuoteRequestId}
              setSelectedQuoteRequestId={setSelectedQuoteRequestId}
              selectedCustomerMessageThreadId={selectedCustomerMessageThreadId}
              setSelectedCustomerMessageThreadId={setSelectedCustomerMessageThreadId}
              adminCustomerId={adminCustomerId}
              setAdminCustomerId={setAdminCustomerId}
              adminSupplierId={adminSupplierId}
              setAdminSupplierId={setAdminSupplierId}
              merchantAnalysisView={!!merchantAnalysisView}
              proposalAnalysisView={!!proposalAnalysisView}
              adminOpenTicketCount={adminOpenTicketCount}
              actionCenterOpenCountByTab={actionCenterOpenCountByTab}
              unreadCustomerMessageCount={unreadCustomerMessageCount}
              setMessageCenterSection={setMessageCenterSection}
              adminCommissionPartnerKey={adminCommissionPartnerKey}
              setAdminCommissionPartnerKey={setAdminCommissionPartnerKey}
            />
          </PortalSidebar>

          <div className="main">
            {/* Topbar */}
            <div className="topbar">
              <div className="topbar-title">
                {shellTopbarTitle ?? (merchantAnalysisView || proposalAnalysisView ? analysisTopbarTitle : ADMIN_VIEW_TITLES[adminView])}
              </div>
              <div className="topbar-right">
                <div className="topbar-brand-mobile" aria-hidden="true">
                  <CandidLogo size="sb" compact />
                </div>
                <AdminTopbarClock currentUserEmail={contact.email} />
                <GlobalSearch
                  collapsible
                  placeholder="Search accounts, partners, actions…"
                  query={adminGlobalQuery}
                  onQueryChange={setAdminGlobalQuery}
                  items={adminSearchItems}
                />
                <AdminQuickActions actions={adminQuickActions} />
                <AlertsBell
                  items={adminAlertItems}
                  unreadCount={adminOpenTicketCount}
                  title="Alerts"
                  emptyLabel="No open portal work right now."
                />
                <div className="avatar-wrap" style={{ position: 'relative' }}>
                  <div className="topbar-avatar" onClick={e => { e.stopPropagation(); setAvatarMenuOpen(o => !o); }}>{contact.initials}</div>
                  {avatarMenuOpen && (
                    <div className="avatar-menu open" onClick={e => e.stopPropagation()}>
                      <div style={{ padding: '16px', borderBottom: '1px solid var(--gray-border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)' }}>{contact.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{contact.email}</div>
                        <div style={{ fontSize: 10, fontWeight: 700, color: 'var(--red)', marginTop: 3, letterSpacing: '0.06em', textTransform: 'uppercase' }}>Admin</div>
                      </div>
                      {themeMounted && (
                        <>
                          <div
                            className="avatar-menu-item"
                            onClick={() => {
                              openThemePicker();
                            }}
                          >
                            <AppIcon name="settings" size={14} />
                            Pick your theme
                          </div>
                          <div
                            className="avatar-menu-item"
                            onClick={() => {
                              toggleTheme();
                              setAvatarMenuOpen(false);
                            }}
                          >
                            <AppIcon name={isDark ? 'sun' : 'moon'} size={14} />
                            {isDark ? 'Light mode' : 'Dark mode'}
                          </div>
                        </>
                      )}
                      <div
                        className="avatar-menu-item"
                        onClick={() => {
                          closeMerchantAnalysis();
                          setAdminView('adminsettings');
                          setAvatarMenuOpen(false);
                        }}
                      >
                        <AppIcon name="settings" size={14} />
                        Settings
                      </div>
                      <div style={{ borderTop: '1px solid var(--gray-border)' }}>
                        <ZohoMailboxMenu />
                      </div>
                      <div style={{ borderTop: '1px solid var(--gray-border)' }}>
                        <div onClick={doLogout} style={{ padding: '11px 16px', fontSize: 13, color: 'var(--red)', cursor: 'pointer' }}>Sign Out</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            {/* Content / Views */}
            <div className="content">
              <DevPersistenceBanner />
              {themePickerOpen ? (
                <ThemePickerView onBack={closeThemePicker} />
              ) : merchantAnalysisView || proposalAnalysisView ? (
                proposalAnalysisView ? (
                  proposalAnalysisView.snapshot.ucaasQuote ? (
                    <MemberUcaasProposal
                      snapshot={proposalAnalysisView.snapshot}
                      onBack={closeMerchantAnalysis}
                      allowAccept={false}
                    />
                  ) : (
                    <EmbeddedProposalAnalysis
                      reviewId={proposalAnalysisView.reviewId}
                      snapshot={proposalAnalysisView.snapshot}
                      onBack={closeMerchantAnalysis}
                      allowAccept={false}
                    />
                  )
                ) : (
                <EmbeddedMerchantAnalysis
                  snapshot={merchantAnalysisView!}
                  serviceId={merchantAnalysisServiceId ?? undefined}
                  isAdmin
                  userId={userId}
                  customerName={contact.name}
                  customerEmail={contact.email}
                  onBack={closeMerchantAnalysis}
                />
                )
              ) : (
              <>
              {adminView === 'tickets' && (
                <AdminActionCenterView
                  tab={actionCenterTab}
                  onTabChange={setActionCenterTab}
                  tickets={adminUnifiedTickets}
                  customerTickets={customerTickets}
                  analysisTickets={analysisTickets}
                  portalCustomers={crmCustomers}
                  selectedAnalysisReviewId={selectedAnalysisReviewId}
                  onSelectAnalysisReview={(id) => {
                    if (id) setAnalysisReviewReturnCustomerId(null);
                    setSelectedAnalysisReviewId(id);
                    setSelectedQuoteRequestId(null);
                    setSelectedCustomerMessageThreadId(null);
                  }}
                  onClearAnalysisReview={closeAnalysisReview}
                  selectedQuoteRequestId={selectedQuoteRequestId}
                  onSelectQuoteRequest={(id) => {
                    if (id) {
                      setSelectedQuoteRequestId(id);
                      setSelectedCustomerMessageThreadId(null);
                    }
                  }}
                  onClearQuoteRequest={closeQuoteRequest}
                  onOpenCustomerMessage={(threadId) => {
                    rememberActionReturn('tickets');
                    openCustomerMessageCenter(threadId);
                  }}
                  onOpenOutreach={openOutreachFromActionCenter}
                  onQuoteUpdated={() => setQuoteRequestEpoch((e) => e + 1)}
                  onResolveServiceTicket={resolveCustomerTicket}
                  onResolveAnalysisTicket={resolveAnalysisTicket}
                  onDismissStatementReview={dismissStatementReview}
                  onSetServiceInProgress={setServiceTicketInProgress}
                  onAnalysisPublished={() => void refreshAnalysisReviews()}
                  customers={crmCustomers}
                  onOpenCustomer={openCustomerAccount}
                  onOpenLead={openLeadAccount}
                  initialSelectedTicketId={actionCenterTicketId}
                  currentUserId={userId}
                  onActionWorkUpdated={() => {
                    refreshActionWork();
                    refreshContractPipeline();
                  }}
                  reviewRequests={memberReviewRequests}
                  onResolveReviewRequest={resolveReviewRequest}
                  onSetReviewInProgress={setReviewRequestInProgress}
                  quoteRequests={quoteRequests}
                  onResolveQuoteRequest={resolveQuoteRequest}
                  onSetQuoteInProgress={setQuoteRequestInProgress}
                  contractSubmitActions={contractSubmitActions}
                  onResolveContractSubmit={resolveContractSubmitAction}
                  onSetContractSubmitInProgress={setContractSubmitInProgress}
                  onReplyServiceTicket={replyToServiceTicket}
                  portalLeads={portalLeads}
                  onConvertLead={handleConvertLead}
                  onOpenLeads={() => setAdminView('leads')}
                  onRefreshLeads={refreshPortalLeads}
                  onReplyReviewRequest={replyToReviewRequest}
                  onTicketDetailClose={handleTicketDetailClose}
                />
              )}
              {adminView === 'assistant' && (
                <AdminAssistantView
                  currentUserId={userId ?? ''}
                  currentUserName={contact.name}
                  customers={crmCustomers}
                  leads={[...portalLeads, ...INITIAL_LEADS]}
                  onOpenCustomer={openCustomerAccount}
                  onOpenLead={openLeadAccount}
                  onOpenMessageCenter={() => {
                    closeMerchantAnalysis();
                    setAdminView('messages');
                  }}
                  onOpenAction={(action) => {
                    rememberActionReturn('assistant');
                    if (action.kind === 'analysis_review') {
                      openAnalysisReviewFromActionCenter(action.sourceId);
                    } else if (action.kind === 'ticket') {
                      openActionCenterTicket(`svc-${action.sourceId}`, 'service');
                    } else if (action.kind === 'review_request') {
                      openActionCenterTicket(`review-req-${action.sourceId}`, 'review_request');
                    } else if (action.kind === 'quote_request') {
                      openActionCenterTicket(`quote-req-${action.sourceId}`, 'quote_request');
                    } else {
                      openActionCenter('all');
                    }
                  }}
                />
              )}
              {adminView === 'customers' && (
                <AdminCustomersView
                  selectedCustomerId={adminCustomerId}
                  onSelectedCustomerIdChange={setAdminCustomerId}
                  analysisTickets={analysisTickets}
                  analysisReviews={analysisReviews}
                  memberReviewRequests={memberReviewRequests}
                  onResolveReviewRequest={resolveReviewRequest}
                  onOpenAnalysisReview={openAnalysisReviewFromAccount}
                  onViewAsContact={enterPortalPreview}
                  onResolveTicket={async (ticketId) => {
                    const supabase = createSupabaseBrowserClient();
                    await supabase
                      .from('analysis_tickets')
                      .update({ status: 'resolved' })
                      .eq('id', ticketId);
                    await refreshAnalysisTickets();
                  }}
                  openAddCustomerFromLead={leadConversionTarget}
                  onAddCustomerFromLeadConsumed={() => setLeadConversionTarget(null)}
                  onCustomerCreatedFromLead={handleCustomerCreatedFromLead}
                  pipelineLeads={portalLeads}
                  contractSubmitActions={contractSubmitActions}
                  onContractPipelineUpdated={refreshContractPipeline}
                />
              )}
              {adminView === 'leads' && (
                <AdminLeadsView
                  portalLeads={portalLeads}
                  onRefreshLeads={refreshPortalLeads}
                  onOpenQuoteRequest={(id) => openActionCenterTicket(`quote-req-${id}`, 'quote_request')}
                  onConvertLead={handleConvertLead}
                  onOpenCustomer={openCustomerAccount}
                  onOpenAnalysisReview={openAnalysisReviewFromActionCenter}
                  focusLeadKey={adminLeadFocusId}
                  onFocusLeadConsumed={() => setAdminLeadFocusId(null)}
                  contractSubmitActions={contractSubmitActions}
                  onContractPipelineUpdated={refreshContractPipeline}
                />
              )}
              {adminView === 'agents' && (
                <AdminAgentsView
                  onSelectCustomer={(customerId) => {
                    setAdminCustomerId(customerId);
                    setAdminView('customers');
                  }}
                />
              )}
              {adminView === 'commissions' && <AdminCommissionsView />}
              {adminView === 'expenses' && (
                <AdminExpensesView
                  accounts={crmCustomers.map((c) => ({ id: c.id, company: c.company, agent: c.agent }))}
                />
              )}
              {adminView === 'marketinghub' && <AdminMarketingHubView />}
              {adminView === 'outreach' && (
                <AdminOutreachView
                  customers={crmCustomers.map((c) => ({ id: c.id, company: c.company }))}
                  initialSelectedId={outreachDeepLinkId}
                  onInitialSelectedConsumed={() => setOutreachDeepLinkId(null)}
                  onOpenCustomer={(customerId) => {
                    setAdminCustomerId(customerId);
                    setAdminView('customers');
                  }}
                />
              )}
              {adminView === 'adminsettings' && <AdminSettingsView />}
              {adminView === 'partners' && (
                <AdminPartnersView
                  selectedSupplierId={adminSupplierId}
                  onSelectSupplier={setAdminSupplierId}
                  selectedCommissionPartnerKey={adminCommissionPartnerKey}
                  onSelectCommissionPartner={setAdminCommissionPartnerKey}
                />
              )}
              {adminView === 'messages' && (
                <AdminMessageCenterView
                  currentUserId={userId ?? ''}
                  onOpenAction={(ticketKind, sourceId) => {
                    rememberActionReturn('messages');
                    if (ticketKind === 'analysis_review') {
                      openAnalysisReviewFromActionCenter(sourceId);
                      return;
                    }
                    const prefixByKind: Record<string, string> = {
                      service: 'svc-',
                      analysis: 'analysis-',
                      review_request: 'review-req-',
                      quote_request: 'quote-req-',
                      customer_message: 'cust-msg-',
                      statement: 'statement-',
                      renewal: 'portal-',
                      optimization: 'portal-',
                    };
                    const prefix = prefixByKind[ticketKind] ?? '';
                    if (ticketKind === 'customer_message') {
                      openCustomerMessageCenter(sourceId);
                      return;
                    }
                    openActionCenterTicket(`${prefix}${sourceId}`);
                  }}
                  onOpenCustomer={openCustomerAccount}
                />
              )}
              {adminView === 'custmessages' && (
                <AdminCustomerInboxView
                  initialThreadId={selectedCustomerMessageThreadId}
                  onThreadChange={() => setSelectedCustomerMessageThreadId(null)}
                  onThreadsUpdated={refreshCustomerMessageThreads}
                />
              )}
              </>
              )}
            </div>

            {adminView !== 'assistant' && (
              <AdminAssistantPanel
                pageContext={hankPageContext}
                onNavigateCommissions={() => {
                  closeMerchantAnalysis();
                  setAdminView('commissions');
                }}
              />
            )}
            <AdminZohoComposeHost />
            <MarketingAssetPickerHost />
            <MarketingAssetComposeBridge />
          </div>
        </div>
      )}

      {/* ── PROSPECT SHELL ────────────────────────────────── */}
      {screen === 'prospect' && (
        <div className="prospect-shell">
          <div className="prospect-wrap">
            <div className="prospect-header">
              <CandidLogo size="prospect" />
            </div>
            <div className="prospect-card">
              <div className="prospect-card-header">
                <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--white)', marginBottom: 8 }}>
                  {prospectIntent === 'quote' ? 'Get a quote from Candid.' : 'Get your free savings analysis.'}
                </div>
                <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.65)', lineHeight: 1.6 }}>
                  {prospectIntent === 'quote'
                    ? 'Tell us what you need. Upload a bill if you have one — or skip it and we’ll still get quotes moving.'
                    : 'Drop in a bill for savings analysis, or tell us what you’re shopping for if you don’t have one yet.'}
                </div>
                {(pVendorInterest || pLookingFor || pCategories.length > 0) && (
                  <div
                    style={{
                      marginTop: 14,
                      padding: '10px 12px',
                      borderRadius: 8,
                      background: 'rgba(255,255,255,0.1)',
                      border: '1px solid rgba(255,255,255,0.2)',
                      fontSize: 12,
                      color: 'rgba(255,255,255,0.85)',
                      lineHeight: 1.5,
                    }}
                  >
                    <strong style={{ color: 'var(--white)' }}>From the marketplace:</strong>{' '}
                    {[
                      pVendorInterest,
                      pLookingFor && pLookingFor !== pVendorInterest ? pLookingFor : null,
                      pCategories.map((id) => solutionCategoryLabel(id)).join(', '),
                    ]
                      .filter(Boolean)
                      .join(' · ')}
                  </div>
                )}
                <div style={{ marginTop: 16, display: 'flex', gap: 12, flexWrap: 'wrap' }}>
                  {[{ icon: 'lock' as AppIconName, text: 'Completely confidential' }, { icon: 'bolt' as AppIconName, text: 'No obligation' }, { icon: 'hank' as AppIconName, text: 'AI + specialists' }].map(b => (
                    <div key={b.text} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11, color: 'rgba(255,255,255,0.55)' }}>
                      <AppIcon name={b.icon} size={12} />{b.text}
                    </div>
                  ))}
                </div>
              </div>
              <div className="prospect-card-body">
                {prospectStage === 'form' && (
                  <>
                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
                        What are you looking for?
                      </div>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 10 }}>
                        {SOLUTION_CATEGORIES.filter((c) => c.id !== 'other' && c.id !== 'international' && c.id !== 'iot' && c.id !== 'tem').map((c) => {
                          const on = pCategories.includes(c.id);
                          return (
                            <button
                              key={c.id}
                              type="button"
                              onClick={() => toggleProspectCategory(c.id)}
                              style={{
                                border: `1px solid ${on ? 'rgba(99,102,241,0.45)' : 'var(--gray-border)'}`,
                                background: on ? 'rgba(99,102,241,0.12)' : 'var(--white)',
                                color: on ? 'var(--accent-cool)' : 'var(--gray-dark)',
                                borderRadius: 999,
                                padding: '6px 12px',
                                fontSize: 12,
                                fontWeight: 600,
                                cursor: 'pointer',
                                fontFamily: 'inherit',
                              }}
                            >
                              {c.label}
                            </button>
                          );
                        })}
                      </div>
                      <input
                        value={pLookingFor}
                        onChange={(e) => setPLookingFor(e.target.value)}
                        placeholder="Anything else? e.g. 3 locations, Dialpad vs RingCentral, HIPAA…"
                        style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: 'inherit', fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }}
                      />
                    </div>

                    <div style={{ marginBottom: 18 }}>
                      <div style={{ fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 8 }}>
                        Do you have a current bill or contract?
                      </div>
                      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                        {(
                          [
                            { id: 'yes' as const, title: 'Yes — I’ll upload', sub: 'Free savings analysis' },
                            { id: 'no' as const, title: 'No bill yet', sub: 'Just get me a quote' },
                          ] as const
                        ).map((opt) => (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => {
                              setPHasBill(opt.id);
                              setProspectIntent(opt.id === 'yes' ? 'analysis' : 'quote');
                            }}
                            style={{
                              textAlign: 'left',
                              border: `1px solid ${pHasBill === opt.id ? 'rgba(225,29,72,0.45)' : 'var(--gray-border)'}`,
                              background: pHasBill === opt.id ? 'rgba(225,29,72,0.06)' : 'var(--white)',
                              borderRadius: 8,
                              padding: '12px 14px',
                              cursor: 'pointer',
                              fontFamily: 'inherit',
                            }}
                          >
                            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)' }}>{opt.title}</div>
                            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>{opt.sub}</div>
                          </button>
                        ))}
                      </div>
                    </div>

                    {pHasBill === 'yes' && (
                      <>
                        <div
                          style={{ border: `2px dashed ${prospectDragOver ? 'var(--red)' : 'var(--gray-border)'}`, borderRadius: 10, padding: '28px 24px', textAlign: 'center', cursor: 'pointer', background: prospectDragOver ? 'rgba(200,40,30,0.04)' : 'var(--gray-light)', marginBottom: 20, position: 'relative', transition: 'all 0.2s' }}
                          onDragOver={e => { e.preventDefault(); setProspectDragOver(true); }}
                          onDragLeave={() => setProspectDragOver(false)}
                          onDrop={e => { e.preventDefault(); setProspectDragOver(false); addProspectFiles(Array.from(e.dataTransfer.files)); }}
                        >
                          <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv" multiple style={{ position: 'absolute', inset: 0, opacity: 0, cursor: 'pointer', width: '100%', height: '100%' }} onChange={e => e.target.files && addProspectFiles(Array.from(e.target.files))} />
                          <div style={{ fontSize: 32, marginBottom: 10 }}><AppIcon name="file" size={32} /></div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 6 }}>Drop your bill here, or click to browse</div>
                          <div style={{ fontSize: 12, color: 'var(--gray)' }}>PDF, image, Excel, or CSV. Any format works — Frank handles the parsing.</div>
                        </div>

                        {prospectFiles.length > 0 && (
                          <div style={{ marginBottom: 20 }}>
                            <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gray)', letterSpacing: '0.06em', marginBottom: 8 }}>
                              {prospectFiles.length} file{prospectFiles.length > 1 ? 's' : ''} ready to submit
                            </div>
                            {prospectFiles.map((f, i) => (
                              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, background: 'var(--white)', border: '1px solid var(--gray-border)', borderRadius: 7, padding: '9px 12px', marginBottom: 6 }}>
                                <span><AppIcon name={fileTypeIcon(f.name)} size={14} /></span>
                                <span style={{ flex: 1, fontSize: 13, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{f.name}</span>
                                <span style={{ fontSize: 11, color: 'var(--gray)' }}>{(f.size / 1024).toFixed(0)} KB</span>
                                <span onClick={() => setProspectFiles(prev => prev.filter((_, j) => j !== i))} style={{ fontSize: 14, color: 'var(--gray)', cursor: 'pointer' }}>✕</span>
                              </div>
                            ))}
                          </div>
                        )}
                      </>
                    )}

                    {pHasBill === 'no' && (
                      <div
                        style={{
                          marginBottom: 20,
                          padding: '14px 16px',
                          borderRadius: 8,
                          background: 'var(--gray-light)',
                          border: '1px solid var(--gray-border)',
                          fontSize: 13,
                          color: 'var(--gray-mid)',
                          lineHeight: 1.55,
                        }}
                      >
                        No problem — we’ll use what you selected above to pull quotes from our marketplace.
                        You can always upload a bill later for a deeper savings review.
                      </div>
                    )}

                    <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                      {[
                        { label: 'Your Name', val: pName, set: setPName, placeholder: 'Jane Smith' },
                        { label: 'Company Name', val: pCompany, set: setPCompany, placeholder: 'Acme Corporation' },
                        { label: 'Phone Number', val: pPhone, set: setPPhone, placeholder: '(555) 555-5555' },
                        { label: 'Email Address', val: pEmail, set: setPEmail, placeholder: 'jane@acmecorp.com' },
                      ].map(f => (
                        <div key={f.label}>
                          <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>{f.label}</label>
                          <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: 'inherit', fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }} />
                        </div>
                      ))}
                    </div>
                    <div style={{ marginBottom: 20 }}>
                      <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>CC Team Members <span style={{ fontWeight: 400, textTransform: 'none' }}>(optional)</span></label>
                      <input value={pTeamEmails} onChange={e => setPTeamEmails(e.target.value)} placeholder="colleague@company.com, another@company.com" style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: 'inherit', fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }} />
                    </div>
                    {pError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{pError}</div>}
                    <button onClick={submitProspectForm} style={{ width: '100%', background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 8, padding: 15, fontFamily: 'inherit', fontSize: 15, fontWeight: 600, cursor: 'pointer', letterSpacing: '0.04em' }}>
                      {pHasBill === 'no' ? 'Request Quote →' : pHasBill === 'yes' ? 'Submit for Free Analysis →' : 'Continue →'}
                    </button>
                    <div style={{ marginTop: 16, fontSize: 12, color: 'var(--gray)', textAlign: 'center' }}>
                      Already a member? <span style={{ color: 'var(--red)', cursor: 'pointer' }} onClick={() => { setRole('member'); setScreen('login'); }}>Sign in →</span>
                    </div>
                  </>
                )}

                {prospectStage === 'processing' && (
                  <div style={{ textAlign: 'center', padding: '40px 0' }}>
                    <div style={{ display: 'flex', justifyContent: 'center', gap: 8, marginBottom: 16 }}>
                      {[0, 1, 2].map(i => (
                        <div key={i} style={{ width: 10, height: 10, borderRadius: '50%', background: i === 1 ? 'var(--gray)' : 'var(--red)', animation: 'pulse-dot 1.4s infinite', animationDelay: `${i * 0.2}s` }} />
                      ))}
                    </div>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 8 }}>
                      {pProcessingLabel.startsWith('Analyzing') ? (
                        <AnalyzingDotsLabel prefix="Analyzing your bill" />
                      ) : (
                        pProcessingLabel
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--gray)' }}>This usually takes less than a minute</div>
                  </div>
                )}

                {prospectStage === 'analysis' && prospectAnalysisSnapshot && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 12 }}>
                      Here&apos;s a preview of your savings — unlock the full report to see every detail.
                    </div>
                    <AnalysisUnlockGate
                      snapshot={prospectAnalysisSnapshot}
                      onScheduleMeeting={() => setCalendarOpen(true)}
                    >
                      <StatementEngine
                        initialSnapshot={prospectAnalysisSnapshot}
                        showInternalTab={false}
                        showAgentSidebar={false}
                        proposalTabLabel="Your savings preview"
                      />
                    </AnalysisUnlockGate>
                    <div style={{ marginTop: 16, textAlign: 'center' }}>
                      <button
                        type="button"
                        onClick={() => setCalendarOpen((o) => !o)}
                        style={{
                          background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))',
                          color: 'white',
                          border: 'none',
                          borderRadius: 7,
                          padding: '12px 28px',
                          fontFamily: "'DM Sans',sans-serif",
                          fontSize: 14,
                          fontWeight: 600,
                          cursor: 'pointer',
                        }}
                      >
                        Schedule a Discovery Call
                      </button>
                      {calendarOpen && (
                        <div style={{ marginTop: 16, background: 'var(--gray-light)', border: '1px solid var(--gray-border)', borderRadius: 8, padding: '20px', fontSize: 13, color: 'var(--gray)' }}>
                          <AppIcon name="calendar" size={14} /> Calendly embed — candidsolutions.com/schedule
                        </div>
                      )}
                      <div style={{ marginTop: 12 }}>
                      <span onClick={resetProspect} style={{ fontSize: 12, color: 'var(--gray)', cursor: 'pointer' }}>
                        Start another request →
                      </span>
                      </div>
                    </div>
                  </div>
                )}

                {prospectStage === 'confirm' && (
                  <div style={{ textAlign: 'center', padding: '20px 0' }}>
                    <div style={{ fontSize: 40, marginBottom: 16, color: 'var(--green)' }}><AppIcon name="check" size={40} /></div>
                    <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 12 }}>You&apos;re in the queue.</div>
                    <div style={{ fontSize: 14, color: 'var(--gray-mid)', lineHeight: 1.7, marginBottom: 24 }} dangerouslySetInnerHTML={{ __html: pConfirmText }} />
                    <button onClick={() => setCalendarOpen(o => !o)} style={{ background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 7, padding: '12px 28px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, fontWeight: 600, cursor: 'pointer', marginBottom: 12 }}>
                      Schedule a Discovery Call
                    </button>
                    {calendarOpen && (
                      <div style={{ marginTop: 16, background: 'var(--gray-light)', border: '1px solid var(--gray-border)', borderRadius: 8, padding: '20px', textAlign: 'center', fontSize: 13, color: 'var(--gray)' }}>
                        <AppIcon name="calendar" size={14} /> Calendly embed would go here — link to candidsolutions.com/schedule
                      </div>
                    )}
                    <div style={{ marginTop: 16 }}>
                      <span onClick={resetProspect} style={{ fontSize: 12, color: 'var(--gray)', cursor: 'pointer' }}>Start another request →</span>
                    </div>
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── MEMBER SHELL ──────────────────────────────────── */}
      {screen === 'member' && (
        <div className={`member-shell${shellClass}`}>
          <PortalSidebar
            className="member-sidebar"
            collapsed={effectiveCollapsed}
            onToggleCollapsed={toggleSidebar}
            userName={contact.name}
            userCompany={contact.company}
            userBadge="Member"
            logo={<CandidLogo size="sb" compact={effectiveCollapsed} />}
            onLogout={doLogout}
            bottomSlot={<PersistenceModeControls collapsed={effectiveCollapsed} />}
          >
            {([
              { id: 'mdashboard', icon: 'dashboard' as AppIconName, label: 'Dashboard' },
              {
                id: 'mservices',
                icon: 'services' as AppIconName,
                label: 'My Services',
                badge: memberServices.length > 0 ? String(memberServices.length) : undefined,
              },
              { id: 'msavings', icon: 'sparkles' as AppIconName, label: 'Quotes & Proposals', badge: quotesSidebarBadge ? String(quotesSidebarBadge) : undefined },
              { id: 'mfind', icon: 'search' as AppIconName, label: 'Find Solutions' },
              { id: 'mmessages', icon: 'messages' as AppIconName, label: 'Message Center', badge: unreadMemberMessages ? String(unreadMemberMessages) : undefined },
              ...(ENABLE_TECH_SPEND
                ? [{ id: 'mspend' as const, icon: 'card' as AppIconName, label: 'Tech Spend' }]
                : []),
              { id: 'msettings', icon: 'settings' as AppIconName, label: 'Settings' },
            ] as const).map((item) => (
              <SidebarNavItem
                key={item.id}
                active={memberView === item.id || (item.id === 'mservices' && (!!merchantAnalysisView || !!proposalAnalysisView))}
                icon={<AppIcon name={item.icon} />}
                label={item.label}
                badge={'badge' in item ? item.badge : undefined}
                onClick={() => {
                  setThemePickerOpen(false);
                  closeMerchantAnalysis();
                  setMemberView(item.id as MemberView);
                }}
              />
            ))}
          </PortalSidebar>

          <div className="member-main">
            <div className="topbar">
              <div className="topbar-title">
                {shellTopbarTitle ?? (merchantAnalysisView || proposalAnalysisView ? analysisTopbarTitle : MEMBER_VIEW_TITLES[memberView])}
              </div>
              <div className="topbar-right">
                <div className="topbar-brand-mobile" aria-hidden="true">
                  <CandidLogo size="sb" compact />
                </div>
                <GlobalSearch
                  placeholder="Search services, tickets…"
                  query={memberGlobalQuery}
                  onQueryChange={setMemberGlobalQuery}
                  items={memberSearchItems}
                />
                <AlertsBell
                  items={memberAlertItems}
                  unreadCount={quotesSidebarBadge + unreadMemberNotifications.length}
                  emptyLabel="No new alerts. You're all caught up."
                />
                <div className="avatar-wrap" style={{ position: 'relative' }}>
                  <div className="topbar-avatar" onClick={e => { e.stopPropagation(); setMemberAvatarMenuOpen(o => !o); }}>{contact.initials}</div>
                  {memberAvatarMenuOpen && (
                    <div className="avatar-menu open" onClick={e => e.stopPropagation()}>
                      <div style={{ padding: 16, borderBottom: '1px solid var(--gray-border)' }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)' }}>{contact.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--gray)' }}>{contact.email}</div>
                      </div>
                      {themeMounted && (
                        <>
                          <div
                            className="avatar-menu-item"
                            onClick={() => {
                              openThemePicker();
                            }}
                          >
                            <AppIcon name="settings" size={14} />
                            Pick your theme
                          </div>
                          <div
                            className="avatar-menu-item"
                            onClick={() => {
                              toggleTheme();
                              setMemberAvatarMenuOpen(false);
                            }}
                          >
                            <AppIcon name={isDark ? 'sun' : 'moon'} size={14} />
                            {isDark ? 'Light mode' : 'Dark mode'}
                          </div>
                        </>
                      )}
                      <div
                        className="avatar-menu-item"
                        onClick={() => { setMemberView('msettings'); setMemberAvatarMenuOpen(false); }}
                      >
                        Account Settings
                      </div>
                      <div style={{ borderTop: '1px solid var(--gray-border)' }}>
                        <div onClick={doLogout} style={{ padding: '11px 16px', fontSize: 13, color: 'var(--red)', cursor: 'pointer' }}>Sign Out</div>
                      </div>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="content">
              <DevPersistenceBanner />
              {portalPreviewActive && appRole === 'admin' && portalScope && (
                <div className="portal-preview-banner">
                  <div>
                    <strong>Admin preview</strong> — viewing the member portal as{' '}
                    <strong>{portalScope.contactName}</strong> ({contactEmailForPortalScope(portalScope) ?? 'contact'})
                    {' at '}
                    {portalScope.companyName}
                    {' · '}
                    <span style={{ color: 'var(--green)', fontWeight: 600 }}>{portalTierLabel(portalScope.tier)}</span>
                  </div>
                  <button type="button" className="portal-preview-exit" onClick={exitPortalPreview}>
                    Exit preview · Return to admin
                  </button>
                </div>
              )}
              {portalScopeForMember && !(portalPreviewActive && appRole === 'admin') && (
                <div
                  style={{
                    marginBottom: 20,
                    padding: '12px 16px',
                    borderRadius: 8,
                    border: '1px solid rgba(26,122,74,0.25)',
                    background: 'var(--green-light)',
                    fontSize: 13,
                    color: 'var(--gray-dark)',
                  }}
                >
                  <div style={{ display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 12 }}>
                    <div style={{ flex: 1, minWidth: 200 }}>
                      Signed in as <strong>{portalScopeForMember.contactName}</strong>
                      {contactEmailForPortalScope(portalScopeForMember) ? (
                        <> ({contactEmailForPortalScope(portalScopeForMember)})</>
                      ) : null}
                      {' · '}
                      {portalScopeForMember.companyName}
                      {' · '}
                      <span style={{ color: 'var(--green)', fontWeight: 600 }}>
                        {portalTierLabel(portalScopeForMember.tier)}
                      </span>
                    </div>
                    {(portalHasMasterAccess || memberHasMasterLocationAccess(portalScopeForMember, portalCustomer)) &&
                      (portalCustomer?.locations.length ?? 0) > 1 && (
                        <label className="portal-location-filter">
                          <span>Viewing</span>
                          <select
                            value={
                              portalLocationViewFilter === null || portalLocationViewFilter === ''
                                ? '__all__'
                                : portalLocationViewFilter
                            }
                            onChange={(e) => {
                              const v = e.target.value;
                              setPortalLocationViewFilter(v === '__all__' ? '' : v);
                            }}
                          >
                            <option value="__all__">All locations</option>
                            {(portalCustomer?.locations ?? []).map((loc) => (
                              <option key={loc.id} value={loc.id}>
                                {loc.label}
                                {loc.isPrimary ? ' (primary)' : ''}
                              </option>
                            ))}
                          </select>
                        </label>
                      )}
                  </div>
                </div>
              )}
              {themePickerOpen ? (
                <ThemePickerView onBack={closeThemePicker} />
              ) : proposalAnalysisView ? (
                proposalAnalysisView.snapshot.ucaasQuote ? (
                  <MemberUcaasProposal
                    snapshot={proposalAnalysisView.snapshot}
                    onBack={closeMerchantAnalysis}
                    reviewId={proposalAnalysisView.reviewId}
                    accountServiceId={proposalAnalysisView.serviceId}
                    contactName={contact.name}
                    contactEmail={contact.email}
                  />
                ) : (
                  <EmbeddedProposalAnalysis
                    reviewId={proposalAnalysisView.reviewId}
                    snapshot={proposalAnalysisView.snapshot}
                    onBack={closeMerchantAnalysis}
                    accountServiceId={proposalAnalysisView.serviceId}
                    contactName={contact.name}
                    contactEmail={contact.email}
                  />
                )
              ) : activePublishedQuote?.published_quote_snapshot ? (
                <MemberQuoteProposal
                  snapshot={activePublishedQuote.published_quote_snapshot}
                  subject={activePublishedQuote.subject ?? undefined}
                  quoteRequestId={activePublishedQuote.id}
                  contactName={contact.name}
                  contactEmail={contact.email}
                  onBack={() => setActivePublishedQuoteId(null)}
                />
              ) : merchantAnalysisView ? (
                <EmbeddedMerchantAnalysis
                  snapshot={merchantAnalysisView!}
                  serviceId={merchantAnalysisServiceId ?? undefined}
                  isAdmin={false}
                  userId={userId}
                  customerName={contact.name}
                  customerEmail={contact.email}
                  contentGated={analysisContentGated}
                  isCandidManaged={merchantAnalysisCandidManaged}
                  onUnlock={() => {
                    if (!userId) return;
                    void unlockAnalysisInDb(userId).then(() => setAnalysisUnlocked(true));
                  }}
                  onBack={closeMerchantAnalysis}
                />
              ) : (
              <>
              {memberView === 'mdashboard' && (
                <MemberDashboardView
                  onViewChange={setMemberView}
                  onOpenNewQuote={() => openNewQuote()}
                  onOpenGetHelp={() => openGetHelp()}
                  services={memberServices}
                  accountSavings={portalCustomer?.savings ?? null}
                  openTickets={memberTicketsForPortal}
                  readyQuotes={readyQuotes}
                  pendingQuotes={pendingQuotes}
                  newQuoteCount={quotesSidebarBadge}
                  notifications={memberNotificationsForPortal}
                  onMarkNotificationRead={markMemberNotificationRead}
                  dashboardRequests={memberDashboardRequests}
                  onRequestNavigate={handleMemberRequestNavigate}
                  customerId={portalScopeForMember?.customerId ?? null}
                />
              )}
              {memberView === 'mservices' && (
                <MemberServicesView
                  services={memberServices}
                  userId={userId}
                  customerName={contact.name}
                  customerEmail={contact.email}
                  pendingBillReview={pendingBillReview}
                  onDismissPendingBillReview={() => setPendingBillReview(null)}
                  onCompletePendingBillReview={() => {
                    setPendingBillReview(null);
                    setMemberView('mdashboard');
                  }}
                  onBillConfirmed={() => void refreshMemberMessages()}
                  onOpenMerchantAnalysis={openMerchantAnalysis}
                  onOpenProposalAnalysis={openProposalAnalysis}
                  onOpenPendingReview={(svc) => {
                    if (svc.pendingParseResult) {
                      setPendingBillReview({
                        reviewId: svc.analysisReviewId ?? undefined,
                        vendorName: svc.name,
                        parseResult: svc.pendingParseResult,
                        categories: svc.pendingCategories,
                      });
                    }
                  }}
                  onGetHelp={
                    userId
                      ? (svc) => openGetHelp({ service: svc, requestSource: 'my_services' })
                      : undefined
                  }
                  onRenewNow={
                    userId
                      ? (svc) =>
                          openGetHelp({
                            service: svc,
                            requestSource: 'my_services',
                            category: 'contract_renewal',
                          })
                      : undefined
                  }
                  onRequestNewQuote={(svc) => {
                    const vendor = svc.vendor?.split('—')[0]?.trim() || svc.name;
                    openNewQuote({
                      vendorNames: vendor ? [vendor] : [],
                      additionalComments: `Requesting a renewal quote for ${svc.name}${svc.expTxt ? ` (${svc.expTxt})` : ''}.`,
                    });
                  }}
                  helpInProgress={isHelpInProgress}
                  onOpenServiceDetail={(svc) => setServiceDetail(svc)}
                  onRemoveService={removeMemberService}
                  onAddExternalService={userId ? () => setExternalServiceModal('new') : undefined}
                  onEditExternalService={userId ? (svc) => setExternalServiceModal(svc) : undefined}
                />
              )}
              {memberView === 'msavings' && (
                <MemberSavingsOpportunitiesView
                  services={memberSavingsOpportunities}
                  quoteRequests={memberQuoteRequests}
                  userId={userId}
                  customerName={contact.name}
                  customerEmail={contact.email}
                  customerId={portalScopeForMember?.customerId ?? null}
                  onBillUploaded={handleSavingsBillUpload}
                  onOpenManualQuote={openNewQuote}
                  onOpenPublishedQuote={(id) => {
                    setActivePublishedQuoteId(id);
                    markQuoteSeen(memberQuoteSeenId(id));
                  }}
                  onOpenAnalysis={openMerchantAnalysis}
                  onOpenProposalAnalysis={openProposalAnalysis}
                  onOpenServiceDetail={(svc) => setServiceDetail(svc)}
                  onAddToMemberServices={(svc) => void addSavingsOpportunityToServices(svc)}
                  pendingBillReview={pendingBillReview}
                  onDismissPendingBillReview={() => setPendingBillReview(null)}
                  onCompletePendingBillReview={() => {
                    setPendingBillReview(null);
                    setMemberView('mdashboard');
                  }}
                  onBillConfirmed={() => void refreshMemberMessages()}
                  onGetHelp={
                    userId
                      ? (svc) => openGetHelp({ service: svc, requestSource: 'savings_opportunity' })
                      : undefined
                  }
                  helpInProgress={isHelpInProgress}
                />
              )}
              {memberView === 'mmessages' && (
                <MemberMessageCenterView portalPreviewActive={portalPreviewActive && Boolean(portalScopeForMember)} />
              )}
              {ENABLE_TECH_SPEND && memberView === 'mspend' && (
                <MemberTechSpendView
                  customerId={portalScopeForMember?.customerId ?? null}
                  services={memberServices}
                  onFindSolutions={() => setMemberView('mfind')}
                  onReviewBillFlag={(flag) => {
                    const svc = memberServices.find((s) => s.id === flag.serviceId);
                    openGetHelp({
                      service: svc,
                      requestSource: 'my_services',
                      category: 'bill_increase',
                    });
                  }}
                  onSubmitReviewFlag={(flag) => {
                    const svc = memberServices.find((s) => s.id === flag.serviceId);
                    openGetHelp({
                      service: svc,
                      requestSource: 'savings_opportunity',
                      category: 'review_services',
                    });
                  }}
                />
              )}
              {memberView === 'mfind' && (
                <FindSolutionsView
                  onRequestQuote={(category, supplier) => {
                    openNewQuote({
                      categoryId: category,
                      vendorNames: supplier ? [supplier] : [],
                    });
                  }}
                  onBuildQuoteFromShortlist={(vendorNames, categoryId) => {
                    openNewQuote({ categoryId, vendorNames });
                  }}
                />
              )}
              {memberView === 'msettings' && (
                <MemberSettingsView
                  name={contact.name}
                  email={contact.email}
                  company={contact.company}
                />
              )}
              </>
              )}
            </div>
          </div>

          {newQuoteOpen && (
            <NewQuoteFlowModal
              prefill={newQuotePrefill}
              customerName={contact.name}
              customerEmail={contact.email}
              customerCompany={contact.company}
              onSubmitted={() => setQuoteRequestEpoch((e) => e + 1)}
              onClose={() => {
                setNewQuoteOpen(false);
                setNewQuotePrefill(undefined);
              }}
            />
          )}

          {welcomeOpen && userId && (
            <WelcomeModal
              name={contact.name}
              onClose={() => {
                void markWelcomeSeenInDb(userId);
                setWelcomeOpen(false);
              }}
            />
          )}
          {serviceRequestContext && userId && (
            <ServiceRequestModal
              services={memberServices}
              companyName={
                portalScopeForMember?.companyName?.trim() ||
                portalCustomer?.company?.trim() ||
                contact.company?.trim() ||
                'Your company'
              }
              customerName={contact.name}
              customerEmail={contact.email}
              crmCustomerId={
                portalScopeForMember?.customerId ||
                findCustomerByContactEmail(crmCustomers, contact.email)?.id
              }
              context={serviceRequestContext === 'general' ? undefined : serviceRequestContext}
              onClose={() => setServiceRequestContext(null)}
              onSubmitted={async () => {
                setReviewRequestEpoch((e) => e + 1);
                await refreshCustomerTickets();
                await refreshMemberReviewRequests();
                await refreshMemberPortalServiceRequests();
                await refreshUserServices();
              }}
            />
          )}
          {serviceDetail && (
            <MemberServiceDetailModal
              service={serviceDetail}
              onClose={() => setServiceDetail(null)}
              onGetHelp={(svc) => {
                setServiceDetail(null);
                openGetHelp({ service: svc, requestSource: 'my_services' });
              }}
              onRenewNow={(svc) => {
                setServiceDetail(null);
                openGetHelp({
                  service: svc,
                  requestSource: 'my_services',
                  category: 'contract_renewal',
                });
              }}
              onRequestNewQuote={(svc) => {
                setServiceDetail(null);
                const vendor = svc.vendor?.split('—')[0]?.trim() || svc.name;
                openNewQuote({
                  vendorNames: vendor ? [vendor] : [],
                  additionalComments: `Requesting a renewal quote for ${svc.name}${svc.expTxt ? ` (${svc.expTxt})` : ''}.`,
                });
              }}
              canEditVendorName={
                !serviceDetail.candidManaged &&
                !serviceDetail.id.startsWith('portal-')
              }
              onRenameVendor={renameMemberService}
              onEditExternal={
                userId &&
                !serviceDetail.candidManaged &&
                !serviceDetail.id.startsWith('portal-')
                  ? () => {
                      setExternalServiceModal(serviceDetail);
                      setServiceDetail(null);
                    }
                  : undefined
              }
            />
          )}
          {externalServiceModal && userId && (
            <ExternalServiceModal
              userId={userId}
              service={externalServiceModal === 'new' ? null : externalServiceModal}
              crmCustomerId={portalScopeForMember?.customerId ?? null}
              onClose={() => setExternalServiceModal(null)}
              onSaved={refreshUserServices}
            />
          )}
          <MemberAssistantPanel
            vendorNames={memberVendorNames}
            companyName={
              portalScopeForMember?.companyName?.trim() ||
              portalCustomer?.company?.trim() ||
              contact.company?.trim() ||
              'Your company'
            }
            contactName={contact.name}
            contactEmail={contact.email}
            customerId={portalScopeForMember?.customerId}
            services={memberServices}
            hidden={!!merchantAnalysisView || !!proposalAnalysisView || themePickerOpen}
          />
        </div>
      )}

      {/* ── ADD SERVICE MODAL ─────────────────────────────── */}
      {addServiceOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) closeAddService(); }}>
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-hank-avatar"><HankMark size={18} /></div>
                <div>
                  <div className="modal-title">Add a Service</div>
                  <div className="modal-subtitle">Upload your bill — Hank analyzes it in seconds</div>
                </div>
              </div>
              <button className="modal-close" onClick={closeAddService}>✕</button>
            </div>
            <div className="modal-body">
              {addStage === 'upload' && (
                <>
                  <div style={{ marginBottom: 16 }}>
                    <label
                      htmlFor="add-service-product-name"
                      style={{
                        display: 'block',
                        fontSize: 11,
                        fontWeight: 600,
                        letterSpacing: '0.1em',
                        textTransform: 'uppercase',
                        color: 'var(--gray)',
                        marginBottom: 7,
                      }}
                    >
                      Product / service name <span style={{ fontWeight: 400, textTransform: 'none', letterSpacing: 0 }}>(required)</span>
                    </label>
                    <input
                      id="add-service-product-name"
                      type="text"
                      value={addServiceProductName}
                      onChange={e => setAddServiceProductName(e.target.value)}
                      placeholder="e.g. RingCentral, Comcast Business, Square"
                      style={{
                        width: '100%',
                        border: '1px solid var(--gray-border)',
                        borderRadius: 6,
                        padding: '11px 14px',
                        fontFamily: "'DM Sans',sans-serif",
                        fontSize: 14,
                        color: 'var(--gray-dark)',
                        outline: 'none',
                        background: 'var(--white)',
                      }}
                    />
                  </div>
                  {addServiceError ? (
                    <div
                      style={{
                        fontSize: 12,
                        color: 'var(--red)',
                        marginBottom: 12,
                        lineHeight: 1.45,
                      }}
                    >
                      {addServiceError}
                    </div>
                  ) : null}
                  <div
                    className={`upload-zone${uploadDragOver ? ' drag-over' : ''}`}
                    onDragOver={e => { e.preventDefault(); setUploadDragOver(true); }}
                    onDragLeave={() => setUploadDragOver(false)}
                    onDrop={handleDrop}
                  >
                    <input type="file" accept=".pdf,.png,.jpg,.jpeg,.xlsx,.csv" onChange={handleFileSelect} />
                    <div className="upload-icon"><AppIcon name="file" size={36} /></div>
                    <div className="upload-title">Drop your invoice here</div>
                    <div className="upload-sub">Any bill, statement, or invoice — PDF, image, or spreadsheet<br />Hank will identify the service type and analyze your spend automatically</div>
                    <div className="upload-types">
                      {['PDF', 'JPG / PNG', 'XLSX', 'CSV'].map(t => <span key={t} className="upload-type-pill">{t}</span>)}
                    </div>
                  </div>
                  <div className="hank-quip">
                    <span className="hank-quip-icon"><HankMark size={16} /></span>
                    <span>Most invoices I've seen could buy a small car's worth of savings annually. Let's see what's hiding in yours.</span>
                  </div>
                </>
              )}

              {addStage === 'processing' && (
                <div className="processing-wrap">
                  <div style={{ fontSize: 32, marginBottom: 12 }}><AppIcon name="search" size={32} /></div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 4 }}>Hank is reading your bill...</div>
                  <div className="processing-dots"><span /><span /><span /></div>
                  <div className="processing-label">
                    {processingLabel.startsWith('Analyzing') ? (
                      <AnalyzingDotsLabel prefix="Analyzing your bill" />
                    ) : (
                      processingLabel
                    )}
                  </div>
                </div>
              )}

              {addStage === 'result' && addResult && (
                <>
                  <div className="result-service-banner">
                    <div className="result-eyebrow"><HankMark size={12} /> Hank's Analysis Complete</div>
                    <div className="result-service-name">{addResult.name}</div>
                    <div className="result-vendor">{addResult.vendor}</div>
                  </div>
                  <div className="result-stats">
                    <div className="result-stat">
                      <div className="result-stat-label">Your Current Rate</div>
                      <div className="result-stat-val red">{addResult.current}</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-label">Market Rate</div>
                      <div className="result-stat-val">{addResult.market}</div>
                    </div>
                    <div className="result-stat">
                      <div className="result-stat-label">Savings Identified</div>
                      <div className="result-stat-val green">{addResult.savings}</div>
                    </div>
                  </div>
                  <div className="result-hank-note"><HankMark size={12} /> <strong>Hank's take:</strong> {addResult.note}</div>
                  <div className="result-actions">
                    <button className="btn-primary" onClick={closeAddService}>Schedule a Review Call →</button>
                    <button className="btn-secondary" onClick={closeAddService}>Close</button>
                  </div>
                </>
              )}

              {addStage === 'human-review' && (
                <div className="human-review-wrap">
                  <div className="human-review-icon"><AppIcon name="specialist" size={40} /></div>
                  <div className="human-review-title">Sending to your Candid specialist</div>
                  <div className="human-review-sub">
                    {addBillParseResult
                      ? `We classified your bill as ${addBillParseResult.categoryLabel}. A specialist will verify the details and confirm savings before you see numbers in the portal.`
                      : "This one's going to a real human. We'll verify your bill and have a full savings analysis back to you within 24 hours — often much sooner."}
                  </div>
                  <button type="button" className="btn-primary" style={{ width: '100%', marginBottom: 10 }} onClick={() => setAddStage('confirm')}>Confirm Submission →</button>
                  <button type="button" className="btn-secondary" style={{ width: '100%' }} onClick={closeAddService}>Cancel</button>
                </div>
              )}

              {addStage === 'confirm' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12, color: 'var(--green)' }}><AppIcon name="check" size={36} /></div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 8 }}>
                    {userId ? 'Bill submitted for analysis' : 'Bill received.'}
                  </div>
                  <div style={{ fontSize: 13, color: 'var(--gray)', lineHeight: 1.65, marginBottom: 20 }}>
                    {userId
                      ? 'Your service is on My Services with status Pending Analysis. We will notify you when Hank finishes the review.'
                      : 'Your Candid specialist will have a savings analysis back to you within 24 hours.'}
                  </div>
                  <button
                    className="btn-primary"
                    style={{ width: '100%' }}
                    onClick={userId ? finishAddServiceAndViewServices : closeAddService}
                  >
                    {userId ? 'View My Services' : 'Done'}
                  </button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* ── QUOTE MODAL ───────────────────────────────────── */}
      {quoteOpen && (
        <div className="modal-overlay open" onClick={e => { if (e.target === e.currentTarget) { setQuoteOpen(false); setQuoteStage('form'); } }}>
          <div className="modal-box">
            <div className="modal-header">
              <div className="modal-header-left">
                <div className="modal-hank-avatar"><AppIcon name="reports" size={18} /></div>
                <div>
                  <div className="modal-title">Request a Quote</div>
                  <div className="modal-subtitle">Tell us what you need — we'll handle the rest</div>
                </div>
              </div>
              <button className="modal-close" onClick={() => { setQuoteOpen(false); setQuoteStage('choose'); }}>✕</button>
            </div>
            <div className="modal-body">
              {quoteStage === 'choose' && (
                <div className="quote-options">
                  <div style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 16, lineHeight: 1.6 }}>How would you like to get pricing? Pick the path that fits — you don&apos;t need a bill to get started.</div>
                  <button
                    type="button"
                    className="quote-option-card"
                    onClick={() => { setQuoteOpen(false); setQuoteStage('choose'); openAddService(); }}
                  >
                    <span className="quote-option-icon" style={{ background: 'var(--red)' }}><AppIcon name="file" size={18} /></span>
                    <span className="quote-option-text">
                      <span className="quote-option-title">Upload &amp; analyze a bill</span>
                      <span className="quote-option-desc">Have a statement? We&apos;ll analyze it and surface savings automatically.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="quote-option-card"
                    onClick={() => { setQuoteMode('request'); setQuoteStage('form'); }}
                  >
                    <span className="quote-option-icon" style={{ background: '#1D4ED8' }}><AppIcon name="sparkles" size={18} /></span>
                    <span className="quote-option-text">
                      <span className="quote-option-title">Request a quote</span>
                      <span className="quote-option-desc">Want a service you don&apos;t have yet, or ready to switch? Tell us what you need.</span>
                    </span>
                  </button>
                  <button
                    type="button"
                    className="quote-option-card"
                    onClick={() => { setQuoteMode('add-services'); setQuoteStage('form'); }}
                  >
                    <span className="quote-option-icon" style={{ background: 'var(--green, #15803d)' }}><AppIcon name="add" size={18} /></span>
                    <span className="quote-option-text">
                      <span className="quote-option-title">Add services or users</span>
                      <span className="quote-option-desc">Already have the service? Add seats, lines, terminals, or locations.</span>
                    </span>
                  </button>
                </div>
              )}
              {quoteStage === 'form' && (
                <>
                  <button type="button" className="quote-back-link" onClick={() => setQuoteStage('choose')}>← Back to options</button>
                  <div style={{ fontSize: 13, color: 'var(--gray)', margin: '10px 0 16px', lineHeight: 1.6 }}>{quoteMode === 'add-services' ? 'Which services or users would you like to add?' : 'What services are you looking to add or replace?'}</div>
                  <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginBottom: 20 }}>
                    {['Internet / Broadband', 'UCaaS / Phone System', 'Merchant Processing', 'Microsoft 365', 'Google Workspace', 'Cybersecurity', 'Cloud / Backup', 'IT Managed Services', 'CCaaS / Contact Center', 'IoT / Smart Office'].map(p => (
                      <button key={p} className={`q-pill${quoteSelectedPills.includes(p) ? ' selected' : ''}`} onClick={() => setQuoteSelectedPills(prev => prev.includes(p) ? prev.filter(x => x !== p) : [...prev, p])}>{p}</button>
                    ))}
                  </div>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 14 }}>
                    {[
                      { label: 'Your Name', val: quoteName, set: setQuoteName, placeholder: 'Jane Smith' },
                      { label: 'Company', val: quoteCompany, set: setQuoteCompany, placeholder: 'Acme Corp' },
                      { label: 'Email', val: quoteEmail, set: setQuoteEmail, placeholder: 'jane@acmecorp.com' },
                      { label: 'Phone', val: quotePhone, set: setQuotePhone, placeholder: '(555) 555-5555' },
                    ].map(f => (
                      <div key={f.label}>
                        <label style={{ display: 'block', fontSize: 11, fontWeight: 600, letterSpacing: '0.1em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 7 }}>{f.label}</label>
                        <input value={f.val} onChange={e => f.set(e.target.value)} placeholder={f.placeholder} style={{ width: '100%', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '11px 14px', fontFamily: "'DM Sans',sans-serif", fontSize: 14, color: 'var(--gray-dark)', outline: 'none' }} />
                      </div>
                    ))}
                  </div>
                  {quoteError && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 10 }}>{quoteError}</div>}
                  <button className="btn-primary" style={{ width: '100%' }} onClick={submitQuote}>Request Custom Quote →</button>
                </>
              )}
              {quoteStage === 'confirm' && (
                <div style={{ textAlign: 'center', padding: '20px 0' }}>
                  <div style={{ fontSize: 36, marginBottom: 12, color: 'var(--green)' }}><AppIcon name="check" size={36} /></div>
                  <div style={{ fontFamily: 'var(--font-display)', fontSize: 20, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 12 }}>Request sent.</div>
                  <div style={{ fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.7, marginBottom: 20 }} dangerouslySetInnerHTML={{ __html: quoteConfirmText }} />
                  <button className="btn-primary" style={{ width: '100%' }} onClick={() => { setQuoteOpen(false); setQuoteStage('choose'); }}>Done</button>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

    </>
    </ContactContext.Provider>
  );
}

// ═══════════════════════════════════════════════════════════
// ── GLOBAL SEARCH ───────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function GlobalSearch(props: {
  placeholder: string;
  query: string;
  onQueryChange: (q: string) => void;
  items: GlobalSearchItem[];
  footerAction?: { label: string; onClick: () => void };
  collapsible?: boolean;
}) {
  const { placeholder, query, onQueryChange, items, footerAction, collapsible = false } = props;
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(!collapsible);
  const wrapRef = useRef<HTMLInputElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const matches = useMemo(() => filterGlobalSearchItems(items, query, 12), [items, query]);

  useEffect(() => {
    const handler = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
        if (collapsible && !query.trim()) setExpanded(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [collapsible, query]);

  useEffect(() => {
    if (expanded) wrapRef.current?.focus();
  }, [expanded]);

  const showPanel = open && expanded && (matches.length > 0 || (footerAction && query.trim().length > 0));

  if (collapsible && !expanded) {
    return (
      <button
        type="button"
        className="topbar-search-toggle"
        aria-label="Search"
        onClick={() => {
          setExpanded(true);
          setOpen(true);
        }}
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden>
          <circle cx="11" cy="11" r="8" />
          <line x1="21" y1="21" x2="16.65" y2="16.65" />
        </svg>
      </button>
    );
  }

  return (
    <div
      ref={containerRef}
      className={`topbar-search-wrap${collapsible ? ' topbar-search-wrap--expanded' : ''}`}
    >
      <div style={{ position: 'relative' }}>
        <div style={{ position: 'absolute', left: 12, top: '50%', transform: 'translateY(-50%)', color: 'var(--gray)', pointerEvents: 'none' }}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </div>
        <input
          ref={wrapRef}
          value={query}
          onChange={(e) => { onQueryChange(e.target.value); setOpen(true); }}
          onFocus={() => setOpen(true)}
          placeholder={placeholder}
          style={{
            width: '100%',
            background: 'var(--white)',
            border: '1px solid var(--gray-border)',
            borderRadius: 10,
            padding: '10px 12px 10px 34px',
            fontFamily: "'DM Sans', sans-serif",
            fontSize: 13,
            color: 'var(--gray-dark)',
            outline: 'none',
          }}
        />
      </div>

      {showPanel && (
        <div
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: 0,
            right: 0,
            background: 'var(--white)',
            border: '1px solid var(--gray-border)',
            borderRadius: 12,
            boxShadow: '0 18px 50px rgba(0,0,0,0.18)',
            overflow: 'hidden',
            zIndex: 900,
          }}
        >
          {matches.length === 0 && query.trim() && (
            <div style={{ padding: '14px 16px', fontSize: 13, color: 'var(--gray)' }}>
              No matches for &ldquo;{query.trim()}&rdquo;
            </div>
          )}
          {matches.map((it) => (
            <div
              key={it.id}
              onClick={() => { it.onSelect(); setOpen(false); onQueryChange(''); }}
              style={{
                padding: '12px 14px',
                borderBottom: '1px solid var(--gray-border)',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                gap: 12,
              }}
              onMouseOver={(e) => (e.currentTarget.style.background = 'var(--gray-light)')}
              onMouseOut={(e) => (e.currentTarget.style.background = 'transparent')}
            >
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {it.label}
                </div>
                {it.meta && (
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 3, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {it.meta}
                  </div>
                )}
              </div>
              <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: it.kind === 'action' ? 'var(--amber)' : it.kind === 'service' ? 'var(--blue)' : it.kind === 'account' ? 'var(--red)' : 'var(--gray)' }}>
                {GLOBAL_SEARCH_KIND_LABEL[it.kind]}
              </div>
            </div>
          ))}
          {footerAction && query.trim() && (
            <div style={{ padding: 12, display: 'flex', justifyContent: 'flex-end' }}>
              <button
                type="button"
                onClick={() => { footerAction.onClick(); setOpen(false); }}
                style={{
                  background: 'var(--gray-dark)',
                  color: 'var(--white)',
                  border: 'none',
                  borderRadius: 10,
                  padding: '10px 14px',
                  fontFamily: "'DM Sans', sans-serif",
                  fontSize: 12,
                  fontWeight: 700,
                  cursor: 'pointer',
                }}
              >
                {footerAction.label} →
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// ── VIEW COMPONENTS ─────────────────────────────────────────
// ═══════════════════════════════════════════════════════════

function AdminPlaceholderView({ title, description }: { title: string; description: string }) {
  return (
    <>
      <div className="greeting">
        <h2>
          <span style={{ color: 'var(--red)' }}>{title}</span>
        </h2>
        <p>{description}</p>
      </div>
      <div
        className="card"
        style={{
          padding: 32,
          textAlign: 'center',
          color: 'var(--gray-mid)',
          fontSize: 14,
          lineHeight: 1.6,
        }}
      >
        Content for this section is coming next.
      </div>
    </>
  );
}

function AdminCustomersView({
  selectedCustomerId,
  onSelectedCustomerIdChange,
  analysisTickets = [],
  analysisReviews = [],
  memberReviewRequests = [],
  onResolveReviewRequest,
  onOpenAnalysisReview,
  onResolveTicket,
  onViewAsContact,
  openAddCustomerFromLead = null,
  onAddCustomerFromLeadConsumed,
  onCustomerCreatedFromLead,
  pipelineLeads = [],
  contractSubmitActions = [],
  onContractPipelineUpdated,
}: {
  selectedCustomerId?: string | null;
  onSelectedCustomerIdChange?: (id: string | null) => void;
  analysisTickets?: AnalysisTicketRow[];
  analysisReviews?: BillAnalysisReviewRow[];
  memberReviewRequests?: MemberReviewRequestRow[];
  onResolveReviewRequest?: (requestId: string) => void | Promise<void>;
  onOpenAnalysisReview?: (reviewId: string) => void;
  onResolveTicket?: (ticketId: string) => void | Promise<void>;
  onViewAsContact?: (contact: Contact, customer: Customer) => void;
  openAddCustomerFromLead?: Lead | null;
  onAddCustomerFromLeadConsumed?: () => void;
  onCustomerCreatedFromLead?: (customerId: string, lead: Lead) => void | Promise<void>;
  pipelineLeads?: Lead[];
  contractSubmitActions?: import('@/lib/services/contract-submit-actions').ContractSubmitActionRow[];
  onContractPipelineUpdated?: () => void;
}) {
  return (
    <>
      {!selectedCustomerId && analysisTickets.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Open analysis questions</div>
          </div>
          <div className="card-body" style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {analysisTickets.map((t) => (
              <div
                key={t.id}
                style={{
                  background: 'var(--gray-light)',
                  border: '1px solid var(--gray-border)',
                  borderLeft: '4px solid var(--red)',
                  borderRadius: 8,
                  padding: '16px 18px',
                }}
              >
                <div style={{ fontSize: 14, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 6 }}>
                  {t.merchant_name || 'Merchant processing'} — {t.customer_name || t.customer_email}
                </div>
                <div style={{ fontSize: 13, color: 'var(--gray-mid)', marginBottom: 8 }}>
                  <strong>Question:</strong> {t.question}
                </div>
                <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 10 }}>
                  {formatTicketTime(t.created_at)}
                </div>
                {onResolveTicket && (
                  <button
                    type="button"
                    onClick={() => void onResolveTicket(t.id)}
                    style={{
                      background: 'var(--white)',
                      border: '1px solid var(--gray-border)',
                      borderRadius: 6,
                      padding: '6px 12px',
                      fontSize: 12,
                      fontWeight: 600,
                      cursor: 'pointer',
                    }}
                  >
                    Mark resolved
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <CustomersView
        selectedId={selectedCustomerId}
        onSelectedIdChange={onSelectedCustomerIdChange}
        onViewAsContact={onViewAsContact}
        analysisReviews={analysisReviews}
        onOpenAnalysisReview={onOpenAnalysisReview}
        memberReviewRequests={memberReviewRequests}
        onResolveReviewRequest={onResolveReviewRequest}
        openAddCustomerFromLead={openAddCustomerFromLead}
        onAddCustomerFromLeadConsumed={onAddCustomerFromLeadConsumed}
        onCustomerCreatedFromLead={onCustomerCreatedFromLead}
        pipelineLeads={pipelineLeads}
        contractSubmitActions={contractSubmitActions}
        onContractPipelineUpdated={onContractPipelineUpdated}
      />
    </>
  );
}

function AdminLeadsView({
  portalLeads,
  onRefreshLeads,
  onOpenQuoteRequest,
  onConvertLead,
  onOpenCustomer,
  onOpenAnalysisReview,
  focusLeadKey,
  onFocusLeadConsumed,
  contractSubmitActions = [],
  onContractPipelineUpdated,
}: {
  portalLeads: Lead[];
  onRefreshLeads?: () => void | Promise<void>;
  onOpenQuoteRequest?: (quoteRequestId: string) => void;
  onConvertLead?: (lead: Lead) => void;
  onOpenCustomer?: (customerId: string) => void;
  onOpenAnalysisReview?: (reviewId: string) => void;
  focusLeadKey?: string | null;
  onFocusLeadConsumed?: () => void;
  contractSubmitActions?: import('@/lib/services/contract-submit-actions').ContractSubmitActionRow[];
  onContractPipelineUpdated?: () => void;
}) {
  return (
    <LeadsView
      portalLeads={portalLeads}
      onRefreshLeads={onRefreshLeads}
      onOpenQuoteRequest={onOpenQuoteRequest}
      onConvertLead={onConvertLead}
      onOpenCustomer={onOpenCustomer}
      onOpenAnalysisReview={onOpenAnalysisReview}
      focusLeadKey={focusLeadKey}
      onFocusLeadConsumed={onFocusLeadConsumed}
      contractSubmitActions={contractSubmitActions}
      onContractPipelineUpdated={onContractPipelineUpdated}
    />
  );
}

function AdminAgentsView({
  onSelectCustomer,
}: {
  onSelectCustomer?: (customerId: string) => void;
}) {
  return <PartnersHubView onSelectCustomer={onSelectCustomer} />;
}

function AdminCommissionsView() {
  return <CommissionsView />;
}

function AdminPartnersView({
  selectedSupplierId,
  onSelectSupplier,
  selectedCommissionPartnerKey,
  onSelectCommissionPartner,
}: {
  selectedSupplierId: string | null;
  onSelectSupplier: (id: string | null) => void;
  selectedCommissionPartnerKey: string | null;
  onSelectCommissionPartner: (key: string | null) => void;
}) {
  return (
    <SuppliersView
      selectedProviderId={selectedSupplierId}
      onSelectProvider={onSelectSupplier}
      selectedCommissionPartnerKey={selectedCommissionPartnerKey}
      onSelectCommissionPartner={onSelectCommissionPartner}
    />
  );
}

function DashboardView({
  onViewChange,
  analysisTickets = [],
  customerTickets = [],
  onResolveCustomerTicket,
  onResolveTicket,
}: {
  onViewChange: (v: any) => void;
  analysisTickets?: AnalysisTicketRow[];
  customerTickets?: CustomerTicketRow[];
  onResolveCustomerTicket?: (ticketId: string) => void;
  onResolveTicket?: (ticketId: string) => void | Promise<void>;
}) {
  const { name, company } = useContact();
  const first = name.split(/\s+/)[0] ?? 'there';
  return (
    <>
      <div className="greeting">
        <h2>Good morning, {first}.</h2>
        <p>Here's your technology cost snapshot for {company} — April 2026.</p>
      </div>

      <div className="savings-report-card">
        <div className="src-eyebrow"><AppIcon name="report" size={14} /> April 2026 Monthly Savings Report</div>
        <div className="src-headline">Your portfolio is performing. Here's where you stand.</div>
        <div className="src-stats">
          <div className="src-stat">
            <div className="src-stat-label">This Month's Savings</div>
            <div className="src-stat-val green">$1,715</div>
            <div className="src-sub">vs. pre-Candid baseline</div>
          </div>
          <div className="src-stat">
            <div className="src-stat-label">Lifetime Savings</div>
            <div className="src-stat-val green">$8,240</div>
            <div className="src-sub">since joining Candid</div>
          </div>
          <div className="src-stat">
            <div className="src-stat-label">Remaining Opportunity</div>
            <div className="src-stat-val">$1,715</div>
            <div className="src-sub">additional savings available</div>
          </div>
        </div>
      </div>

      <div className="kpi-strip">
        <div className="kpi red"><div className="kpi-label">Monthly Spend</div><div className="kpi-value">$4,820</div><div className="kpi-sub">across 5 services</div></div>
        <div className="kpi green"><div className="kpi-label">Savings Identified</div><div className="kpi-value">$1,715</div><div className="kpi-sub">$20,580 annually</div></div>
        <div className="kpi amber"><div className="kpi-label">Expiring Soon</div><div className="kpi-value">2</div><div className="kpi-sub">within 60 days</div></div>
        <div className="kpi blue"><div className="kpi-label">Account Status</div><div className="kpi-value" style={{ fontSize: 18, marginTop: 4 }}>Fees Waived</div><div className="kpi-sub">Active Candid client</div></div>
      </div>

      {customerTickets.length > 0 && (
        <div className="card" style={{ marginBottom: 20 }}>
          <div className="card-header">
            <div className="card-title">Customer Tickets</div>
            <div className="card-action" onClick={() => onViewChange('customers')}>View customers →</div>
          </div>
          <div className="card-body">
            {customerTickets.map((t) => (
              <div key={t.id} className="alert-item">
                <div className="alert-dot red" />
                <div style={{ flex: 1 }}>
                  <div className="alert-text">
                    <strong>{t.service_name}</strong> — {t.customer_name}: {t.subject}
                  </div>
                  <div className="alert-time">{formatCustomerTicketTime(t.created_at)}</div>
                </div>
                {onResolveCustomerTicket && (
                  <button
                    type="button"
                    onClick={() => onResolveCustomerTicket(t.id)}
                    style={{
                      fontSize: 11,
                      fontWeight: 600,
                      padding: '6px 10px',
                      borderRadius: 5,
                      border: '1px solid var(--gray-border)',
                      background: 'var(--white)',
                      cursor: 'pointer',
                    }}
                  >
                    Resolve
                  </button>
                )}
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="dash-grid wide">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Active Services</div>
            <div className="card-action" onClick={() => onViewChange('customers')}>View all →</div>
          </div>
          <div className="card-body">
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo ringcentral">RC</div><div><div className="svc-name">UCaaS / Phone System</div><div className="svc-vendor">RingCentral — 25 seats</div></div></div>
              <div className="svc-right"><div className="svc-amount">$1,250/mo</div><div className="svc-exp urgent">Expires Jun 1, 2026</div></div>
            </div>
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo comcast">CB</div><div><div className="svc-name">Internet Service</div><div className="svc-vendor">Comcast Business — 500 Mbps</div></div></div>
              <div className="svc-right"><div className="svc-amount">$420/mo</div><div className="svc-exp warn">Expires Jul 15, 2026</div></div>
            </div>
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo square">SQ</div><div><div className="svc-name">Merchant Processing</div><div className="svc-vendor">Square — 3.1% effective</div><div className="bill-flag">Bill up $94 this month</div></div></div>
              <div className="svc-right"><div className="svc-amount">$1,954/mo</div><div className="svc-exp ok">Month-to-month</div></div>
            </div>
            <div className="svc-row">
              <div className="svc-left"><div className="vendor-logo microsoft">MS</div><div><div className="svc-name">Microsoft 365</div><div className="svc-vendor">Direct — 22 licenses (4 inactive)</div></div></div>
              <div className="svc-right"><div className="svc-amount">$660/mo</div><div className="svc-exp ok">Expires Mar 2027</div></div>
            </div>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Alerts &amp; Actions</div>
            <div className="card-action" onClick={() => onViewChange('customers')}>View all →</div>
          </div>
          <div className="card-body">
            {analysisTickets.map((t) => (
              <div key={t.id} className="alert-item">
                <div className="alert-dot red" />
                <div>
                  <div className="alert-text">
                    <strong>Analysis question — {t.merchant_name || 'Merchant processing'}</strong>{' '}
                    {t.customer_name || t.customer_email || 'Customer'}: {t.question}
                  </div>
                  <div className="alert-time">{formatTicketTime(t.created_at)}</div>
                </div>
              </div>
            ))}
            {[
              { cls: 'red', title: 'Bill increase detected on Square.', body: '$94 above expected — fax plan overage.', time: 'Ask your AI assistant for details' },
              { cls: 'red', title: 'RingCentral expiring in 40 days.', body: '40% above market rate. Ideal window to renegotiate.', time: 'Action recommended now' },
              { cls: 'amber', title: 'Comcast renewal window opens in 55 days.', body: '$280/mo available — $140 savings.', time: 'Review in 2 weeks' },
              { cls: 'blue', title: '4 inactive Microsoft 365 licenses.', body: 'Rightsizing saves $80/mo with no contract change.', time: 'Quick win available now' },
            ].map((a, i) => (
              <div key={i} className="alert-item">
                <div className={`alert-dot ${a.cls}`} />
                <div><div className="alert-text"><strong>{a.title}</strong> {a.body}</div><div className="alert-time">{a.time}</div></div>
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Savings Opportunity by Category</div>
          <div className="card-action" onClick={() => onViewChange('reports')}>Full report →</div>
        </div>
        <div className="card-body">
          <div className="savings-bars">
            {[
              { label: 'Merchant', pct: 76, val: '$650/mo' },
              { label: 'UCaaS', pct: 58, val: '$500/mo' },
              { label: 'Internet', pct: 33, val: '$140/mo' },
              { label: 'Microsoft 365', pct: 26, val: '$220/mo' },
              { label: 'IT Services', pct: 24, val: '$205/mo' },
            ].map(b => (
              <div key={b.label} className="sbar-row">
                <div className="sbar-label">{b.label}</div>
                <div className="sbar-track"><div className="sbar-fill" style={{ width: `${b.pct}%` }} /></div>
                <div className="sbar-val">{b.val}</div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </>
  );
}

function EmbeddedMerchantAnalysis({
  snapshot,
  serviceId,
  isAdmin,
  userId,
  customerName,
  customerEmail,
  contentGated = false,
  isCandidManaged = false,
  onUnlock,
  onBack,
}: {
  snapshot: MerchantAnalysisSnapshot;
  serviceId?: string;
  isAdmin: boolean;
  userId?: string;
  customerName: string;
  customerEmail: string;
  contentGated?: boolean;
  isCandidManaged?: boolean;
  onUnlock?: () => void;
  onBack: () => void;
}) {
  const displaySnapshot = useMemo((): MerchantAnalysisSnapshot => {
    if (!customerEmail && !customerName) return snapshot;
    return {
      ...snapshot,
      form: {
        ...snapshot.form,
        contactEmail: snapshot.form.contactEmail || customerEmail,
        contactName: snapshot.form.contactName || customerName,
      },
    };
  }, [snapshot, customerEmail, customerName]);

  const proposalLabel = isCandidManaged && !isAdmin ? 'Your savings this month' : 'Customer proposal';
  const engine = (
    <StatementEngine
      initialSnapshot={displaySnapshot}
      onBack={onBack}
      showInternalTab={isAdmin}
      showAgentSidebar={isAdmin}
      proposalTabLabel={proposalLabel}
    />
  );

  return (
    <div className="merchant-analysis-embed">
      {!isAdmin && !contentGated && (
        <AnalysisAskPanel
          snapshot={displaySnapshot}
          userId={userId}
          serviceId={serviceId}
          customerName={customerName}
          customerEmail={customerEmail}
        />
      )}
      {contentGated && !isAdmin ? (
        <AnalysisUnlockGate
          snapshot={displaySnapshot}
          onUnlockPayment={onUnlock}
          onScheduleMeeting={() => window.open('https://candid.solutions', '_blank')}
        >
          {engine}
        </AnalysisUnlockGate>
      ) : (
        engine
      )}
    </div>
  );
}

function serviceMatchesFilter(svc: ServiceCardModel, filter: string) {
  if (filter === 'all') return true;
  if (filter === 'candid') return svc.filter.includes('candid');
  if (filter === 'external') return svc.cls === 'external-svc';
  if (filter === 'expiring') return svc.filter.includes('expiring');
  return true;
}

function ServiceCard({
  svc,
  onOpenMerchantAnalysis,
  onOpenProposalAnalysis,
  onOpenPendingReview,
  onGetHelp,
  onRenewNow,
  onRequestNewQuote,
  onOpenServiceDetail,
  onRemoveService,
  onEditExternalService,
  helpInProgress,
}: {
  svc: ServiceCardModel;
  onOpenMerchantAnalysis?: (snapshot: MerchantAnalysisSnapshot, serviceId: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onOpenPendingReview?: (svc: ServiceCardModel) => void;
  onGetHelp?: (svc: ServiceCardModel) => void;
  onRenewNow?: (svc: ServiceCardModel) => void;
  onRequestNewQuote?: (svc: ServiceCardModel) => void;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onRemoveService?: (svc: ServiceCardModel) => void;
  onEditExternalService?: (svc: ServiceCardModel) => void;
  helpInProgress?: boolean;
}) {
  const snapshot = svc.merchantAnalysis;
  const proposalSnapshot = svc.analysisSnapshot;
  const proposalReviewId = svc.analysisReviewId;
  const hasProposal = Boolean(
    (proposalSnapshot?.proposalDocument || proposalSnapshot?.ucaasQuote) &&
      proposalReviewId &&
      onOpenProposalAnalysis,
  );
  const openAnalysis = onOpenMerchantAnalysis;
  const isUserExternal =
    !svc.candidManaged && !svc.id.startsWith('portal-') && !svc.pending;
  const openEditExternal = isUserExternal && onEditExternalService;
  const hasDetail =
    Boolean(svc.contractId || svc.locationLabel) ||
    (isUserExternal && !openEditExternal);
  const openDetail = onOpenServiceDetail && hasDetail;
  const inRenewalWindow = isCandidServiceInRenewalWindow(svc);
  const showRenewalActions = inRenewalWindow && Boolean(onRenewNow || onRequestNewQuote);
  const showGetHelp = Boolean(onGetHelp) && (!svc.candidManaged || !showRenewalActions);
  const savingsDisplay = computeServiceSavingsDisplay({
    snapshot: svc.analysisSnapshot ?? null,
    baseline: svc.savingsBaseline ?? null,
    addedSeatCount: svc.addedSeatCount ?? 0,
    categoryLabel: svc.analysisSnapshot?.categoriesLabel ?? svc.analysisSnapshot?.categoryLabel ?? null,
  }) ?? (() => {
    const preview = quoteSavingsPreview(svc);
    return preview && preview.monthly > 0
      ? { original: preview, adjusted: null, addedSeatCount: 0 }
      : null;
  })();
  const showActions =
    showGetHelp ||
    showRenewalActions ||
    Boolean(openDetail) ||
    Boolean(snapshot && openAnalysis) ||
    hasProposal ||
    Boolean(onRemoveService && !svc.candidManaged);
  const clickable = Boolean(
    (svc.pending && onOpenPendingReview) ||
      (snapshot && openAnalysis) ||
      hasProposal ||
      openEditExternal ||
      openDetail,
  );
  const handleCardClick = () => {
    if (svc.pending && onOpenPendingReview) onOpenPendingReview(svc);
    else if (snapshot && openAnalysis) openAnalysis(snapshot, svc.id);
    else if (hasProposal && proposalSnapshot && proposalReviewId) {
      onOpenProposalAnalysis!(proposalSnapshot, proposalReviewId, svc.id);
    } else if (openEditExternal) onEditExternalService!(svc);
    else if (openDetail) onOpenServiceDetail!(svc);
  };
  return (
    <div
      className={`service-card ${svc.cls}${clickable ? ' service-card-clickable' : ''}`}
      role={clickable ? 'button' : undefined}
      tabIndex={clickable ? 0 : undefined}
      onClick={clickable ? handleCardClick : undefined}
      onKeyDown={
        clickable
          ? (e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                handleCardClick();
              }
            }
          : undefined
      }
    >
      <div className="sc-top">
        <SupplierLogo
          vendor={svc.vendor?.split('·')[0]?.trim() || svc.name}
          serviceName={svc.productName || svc.name}
          logoKey={svc.logo}
          size={44}
          variant="card"
        />
        <div className="sc-badges">
          <div className={`sc-status ${svc.status}`}>{svc.statusTxt}</div>
          {svc.badge === 'candid' && <div className="candid-badge">✓ With Candid</div>}
          {svc.badge === 'external' && <div className="external-badge">Not with Candid</div>}
        </div>
      </div>
      <div className="sc-name" style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <span style={{ flex: 1, minWidth: 0 }}>{svc.name}</span>
        {svc.documentUrl ? (
          <button
            type="button"
            title={svc.documentFilename ? `View ${svc.documentFilename}` : 'View agreement'}
            onClick={(e) => {
              e.stopPropagation();
              openDocumentViewer({
                url: svc.documentUrl!,
                title: svc.documentFilename ?? `${svc.name} agreement`,
                filename: svc.documentFilename ?? undefined,
              });
            }}
            style={{
              display: 'inline-flex',
              alignItems: 'center',
              justifyContent: 'center',
              width: 26,
              height: 26,
              borderRadius: 5,
              border: '1px solid var(--gray-border)',
              background: 'var(--white)',
              color: 'var(--blue)',
              flexShrink: 0,
              cursor: 'pointer',
              padding: 0,
            }}
          >
            <AppIcon name="file" size={14} />
          </button>
        ) : null}
      </div>
      <div className="sc-vendor">{svc.vendor}</div>
      {svc.locationLabel && (
        <div className="sc-location">
          <span className="sc-location-label">{svc.locationLabel}</span>
          {svc.locationAddress ? (
            <span className="sc-location-addr">{svc.locationAddress}</span>
          ) : null}
        </div>
      )}
      <hr className="sc-divider" />
      <div className="sc-footer">
        {svc.pending ? (
          <div className="sc-pending-label sc-pending-footer">PENDING ANALYSIS</div>
        ) : (
          <>
            <div className="sc-amount-block">
              {svc.merchantRateSummary ? (
                <div className="sc-pending-label" style={{ marginBottom: 4, color: 'var(--gray-dark)' }}>
                  {svc.merchantRateSummary}
                </div>
              ) : null}
              {svc.monthlyVolumeLabel ? (
                <div className="sc-pending-label" style={{ marginBottom: 6 }}>
                  {svc.monthlyVolumeLabel}
                </div>
              ) : null}
              {svc.amountBeforeTax || svc.amount ? (
                <div className="sc-amount">
                  {svc.amountBeforeTax || svc.amount}{' '}
                  <span>
                    /mo{svc.volumeBasedEstimate ? ' est.' : ' before tax'}
                  </span>
                </div>
              ) : hasProposal ? (
                <div className="sc-pending-label" style={{ color: 'var(--green)' }}>
                  Analysis ready
                </div>
              ) : null}
              {svc.taxEstimate ? (
                <div className="sc-pending-label" style={{ marginTop: 4 }}>
                  Tax est. {svc.taxEstimate}/mo
                </div>
              ) : null}
              {savingsDisplay && (
                <div className="sc-savings-block">
                  <div className="sc-savings-row">
                    <span className="sc-savings-label">
                      {savingsDisplay.adjusted ? 'Original proposed savings' : 'Proposed savings'}
                    </span>
                    <span className="sc-savings-value">
                      {formatSavingsMoney(savingsDisplay.original.monthly)}/mo
                      <span className="sc-savings-annual">
                        · {formatSavingsMoney(savingsDisplay.original.annual)}/yr
                      </span>
                    </span>
                  </div>
                  {savingsDisplay.adjusted && (
                    <div className="sc-savings-row sc-savings-row--adjusted">
                      <span className="sc-savings-label">
                        Adjusted vs old provider
                        {savingsDisplay.addedSeatCount > 0
                          ? ` (+${savingsDisplay.addedSeatCount} added)`
                          : ''}
                      </span>
                      <span className="sc-savings-value">
                        {formatSavingsMoney(savingsDisplay.adjusted.monthly)}/mo
                        <span className="sc-savings-annual">
                          · {formatSavingsMoney(savingsDisplay.adjusted.annual)}/yr
                        </span>
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>
            <div className="sc-exp-wrap">
              {hasProposal && !svc.amount ? null : (
                <>
                  <div className={`sc-exp-date${svc.exp ? ` ${svc.exp}` : ''}`}>{svc.expTxt}</div>
                  {svc.expSub ? (
                    <div className={`sc-exp-date${svc.exp ? ` ${svc.exp}` : ''}`}>{svc.expSub}</div>
                  ) : null}
                </>
              )}
            </div>
          </>
        )}
      </div>
      {showActions && (
        <div className="service-card-actions" onClick={(e) => e.stopPropagation()}>
          {clickable && snapshot && openAnalysis && (
            <button
              type="button"
              className="service-card-action-btn primary"
              onClick={() => openAnalysis(snapshot, svc.id)}
            >
              View analysis
            </button>
          )}
          {clickable && hasProposal && proposalSnapshot && proposalReviewId && onOpenProposalAnalysis && (
            <button
              type="button"
              className="service-card-action-btn primary"
              onClick={() => onOpenProposalAnalysis(proposalSnapshot, proposalReviewId, svc.id)}
            >
              View analysis
            </button>
          )}
          {openDetail && (
            <button
              type="button"
              className="service-card-action-btn primary"
              onClick={() => onOpenServiceDetail!(svc)}
            >
              View details
            </button>
          )}
          {showRenewalActions && onRenewNow && (
            <button
              type="button"
              className="service-card-action-btn primary"
              disabled={helpInProgress}
              onClick={() => !helpInProgress && onRenewNow(svc)}
              style={helpInProgress ? { cursor: 'default', opacity: 0.75 } : undefined}
            >
              {helpInProgress ? 'Renewal in progress' : 'Renew now'}
            </button>
          )}
          {showRenewalActions && onRequestNewQuote && (
            <button
              type="button"
              className="service-card-action-btn"
              onClick={() => onRequestNewQuote(svc)}
            >
              Request new quote
            </button>
          )}
          {showGetHelp && (
            <button
              type="button"
              className="service-card-action-btn primary"
              disabled={helpInProgress}
              onClick={() => !helpInProgress && onGetHelp!(svc)}
              style={helpInProgress ? { cursor: 'default', opacity: 0.75 } : undefined}
            >
              {helpInProgress ? 'Help in progress' : 'Get help'}
            </button>
          )}
          {onRemoveService && !svc.candidManaged && (
            <button
              type="button"
              className="service-card-action-btn"
              style={{ color: 'var(--red)', borderColor: 'rgba(200, 40, 30, 0.35)' }}
              onClick={() => void onRemoveService(svc)}
            >
              Remove
            </button>
          )}
        </div>
      )}
    </div>
  );
}

function ServicesGrid({
  services,
  filter,
  onOpenAddService,
  showAddCard = true,
  showDemoExternal,
  addCardLabel,
  addCardHint,
  onOpenMerchantAnalysis,
  onOpenProposalAnalysis,
  onOpenPendingReview,
  onGetHelp,
  onRenewNow,
  onRequestNewQuote,
  onOpenServiceDetail,
  onRemoveService,
  onEditExternalService,
  helpInProgress,
}: {
  services: ServiceCardModel[];
  filter?: string;
  onOpenAddService?: () => void;
  showAddCard?: boolean;
  showDemoExternal?: boolean;
  addCardLabel?: string;
  addCardHint?: string;
  onOpenMerchantAnalysis?: (snapshot: MerchantAnalysisSnapshot, serviceId: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onOpenPendingReview?: (svc: ServiceCardModel) => void;
  onGetHelp?: (svc: ServiceCardModel) => void;
  onRenewNow?: (svc: ServiceCardModel) => void;
  onRequestNewQuote?: (svc: ServiceCardModel) => void;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onRemoveService?: (svc: ServiceCardModel) => void;
  onEditExternalService?: (svc: ServiceCardModel) => void;
  helpInProgress?: (svc: ServiceCardModel) => boolean;
}) {
  const visible = filter
    ? services.filter(svc => serviceMatchesFilter(svc, filter))
    : services;

  return (
    <div className="services-grid">
      {visible.map(svc => (
        <ServiceCard
          key={svc.id}
          svc={svc}
          onOpenMerchantAnalysis={onOpenMerchantAnalysis}
          onOpenProposalAnalysis={onOpenProposalAnalysis}
          onOpenPendingReview={onOpenPendingReview}
          onGetHelp={onGetHelp}
          onRenewNow={onRenewNow}
          onRequestNewQuote={onRequestNewQuote}
          onOpenServiceDetail={onOpenServiceDetail}
          onRemoveService={onRemoveService}
          onEditExternalService={onEditExternalService}
          helpInProgress={helpInProgress?.(svc)}
        />
      ))}

      {showDemoExternal && (!filter || filter === 'all' || filter === 'external') && (
        <div className="service-card external-svc">
          <div className="sc-top">
            <div className="sc-logo external"><AppIcon name="link" size={16} /></div>
            <div className="sc-badges">
              <div className="sc-status external">External</div>
              <div className="external-badge">Not with Candid</div>
            </div>
          </div>
          <div className="sc-name">Google Workspace</div>
          <div className="sc-vendor">Direct — 15 licenses</div>
          <hr className="sc-divider" />
          <div className="candid-compare">
            <div className="compare-box without">
              <div className="compare-label">Without Candid</div>
              <div className="compare-amount">$210</div>
              <div className="compare-sub">/mo currently</div>
            </div>
            <div className="compare-box with">
              <div className="compare-label">With Candid</div>
              <div className="compare-amount">$150</div>
              <div className="compare-sub">/mo estimated</div>
            </div>
          </div>
          <div className="sc-footer">
            <div className="sc-exp-wrap">
              <div className="sc-exp-date warn">Contract expires Aug 2026</div>
              <div className="switch-now">Switch now: save $60/mo</div>
            </div>
          </div>
        </div>
      )}

      {showAddCard && onOpenAddService && (
        <div className="add-service-card" onClick={onOpenAddService}>
          <div className="plus"><AppIcon name="add" size={28} /></div>
          <div className="label">{addCardLabel ?? 'Add a Service'}</div>
          <div style={{ fontSize: 11, color: 'var(--gray)', textAlign: 'center', marginTop: 4 }}>
            {addCardHint ?? (
              <>
                Upload an invoice or bill
                <br />
                Hank will take it from there
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function ServicesView({
  filter,
  onFilterChange,
  onOpenAddService,
  services,
  showDemoExternal,
  onOpenMerchantAnalysis,
}: {
  filter: string;
  onFilterChange: (f: string) => void;
  onOpenAddService: () => void;
  services: ServiceCardModel[];
  showDemoExternal?: boolean;
  onOpenMerchantAnalysis?: (snapshot: MerchantAnalysisSnapshot, serviceId: string) => void;
}) {
  const filters = ['all', 'candid', 'external', 'expiring'];

  return (
    <>
      <div className="greeting">
        <h2>
          My <span style={{ color: 'var(--red)' }}>Services</span>
        </h2>
        <p>
          All services under management. Candid services show verified savings. External
          services show what you&apos;d save by switching.
        </p>
      </div>
      <div className="services-toolbar">
        {filters.map(f => (
          <button
            key={f}
            className={`filter-btn${filter === f ? ' active' : ''}`}
            onClick={() => onFilterChange(f)}
          >
            {f === 'all'
              ? 'All Services'
              : f === 'candid'
                ? 'With Candid'
                : f === 'external'
                  ? 'External'
                  : 'Expiring Soon'}
          </button>
        ))}
      </div>
      <ServicesGrid
        services={services}
        filter={filter}
        onOpenAddService={onOpenAddService}
        showDemoExternal={showDemoExternal}
        onOpenMerchantAnalysis={onOpenMerchantAnalysis}
      />
    </>
  );
}

function ServiceabilityView({ saStreet, setSaStreet, saCity, setSaCity, saState, setSaState, saResults, onRun, onOpenAddService, onOpenQuote, onViewChange }: any) {
  return (
    <>
      <div className="greeting">
        <h2>Add a <span style={{ color: 'var(--red)' }}>New Service</span></h2>
        <p>Upload a bill, search for a service, or tell Hank what you need. We'll handle the rest.</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(2,1fr)', gap: 16, marginBottom: 28 }}>
        {[
          { icon: 'file' as AppIconName, title: 'Analyze an Existing Bill', desc: 'Upload any invoice or statement. Hank identifies the service type and surfaces savings opportunities — automatically.', cta: 'Upload invoice →', color: 'var(--red)', onClick: onOpenAddService },
          { icon: 'add' as AppIconName, title: 'Need a New Service?', desc: "Starting from scratch? Tell us what you need and we'll put together a custom quote — internet, phones, payments, security, and more.", cta: 'Request a quote →', color: '#1D4ED8', onClick: onOpenQuote },
          { icon: 'dashboard' as AppIconName, title: 'Browse by Category', desc: 'Explore every service category Candid supports — Network, UCaaS, CCaaS, Security, Cloud, Commerce, IoT, and more.', cta: 'Browse all services →', color: 'var(--green)', onClick: () => {} },
          { icon: 'hank' as AppIconName, title: 'Ask Hank', desc: "Not sure what you need? Describe your situation to Hank and he'll identify services, find savings, and walk you through your options.", cta: 'Chat with Hank →', color: 'var(--red-light)', dark: true, onClick: () => onViewChange('chat') },
        ].map((c, i) => (
          <div key={i} onClick={c.onClick} style={{ background: c.dark ? 'var(--gray-dark)' : 'var(--white)', border: '1px solid var(--gray-border)', borderRadius: 7, padding: 24, cursor: 'pointer', position: 'relative', overflow: 'hidden', transition: 'all 0.2s' }}>
            <div style={{ position: 'absolute', top: 0, left: 0, right: 0, height: 3, background: `linear-gradient(90deg,${c.color},${c.color}88)` }} />
            <div style={{ marginBottom: 14, fontSize: 22 }}><AppIcon name={c.icon} size={22} /></div>
            <div style={{ fontSize: 14, fontWeight: 600, color: c.dark ? 'var(--white)' : 'var(--gray-dark)', marginBottom: 6 }}>{c.title}</div>
            <div style={{ fontSize: 12, color: c.dark ? '#888' : 'var(--gray)', lineHeight: 1.6 }}>{c.desc}</div>
            <div style={{ marginTop: 14, fontSize: 11, fontWeight: 600, color: c.color }}>{c.cta}</div>
          </div>
        ))}
      </div>

      {/* Serviceability lookup */}
      <div className="serviceability-card">
        <div className="sa-header">
          <div className="sa-icon"><AppIcon name="broadcast" size={24} /></div>
          <div>
            <div className="sa-title">Internet Service Availability Lookup</div>
            <div className="sa-sub">Enter a business address to see what carriers are available and at what price</div>
          </div>
        </div>
        <div className="sa-form">
          <div className="sa-input-wrap" style={{ flex: 2 }}>
            <label>Street Address</label>
            <input className="sa-input" value={saStreet} onChange={e => setSaStreet(e.target.value)} placeholder="123 Main Street" />
          </div>
          <div className="sa-input-wrap">
            <label>City</label>
            <input className="sa-input" value={saCity} onChange={e => setSaCity(e.target.value)} placeholder="Chicago" />
          </div>
          <div className="sa-input-wrap" style={{ flex: '0 0 80px' }}>
            <label>State</label>
            <input className="sa-input" value={saState} onChange={e => setSaState(e.target.value)} placeholder="IL" />
          </div>
          <button className="sa-btn" onClick={onRun}>Check Availability</button>
        </div>

        {saResults && (
          <div className="sa-results show">
            <div className="sa-result-label">Providers available at your address</div>
            <div className="sa-provider-grid">
              {saResults.map((p: any) => (
                <div key={p.name} className="sa-provider">
                  <div className="sa-provider-name">{p.name}</div>
                  <div className="sa-provider-speed">{p.speed}</div>
                  <div className="sa-provider-price">{p.price}</div>
                  <div style={{ fontSize: 10, color: 'var(--gray)', marginTop: 4 }}>{p.tag}</div>
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </>
  );
}

function ChatView({ messages, loading, input, onInputChange, onSend, onSuggestion, messagesRef, userInitials }: {
  messages: ChatMsg[]; loading: boolean; input: string;
  onInputChange: (v: string) => void;
  onSend: (opts?: { content: string; displayText: string }) => void | Promise<void>;
  onSuggestion: (t: string) => void; messagesRef: RefObject<HTMLDivElement | null>;
  userInitials: string;
}) {
  const { company } = useContact();
  const {
    attachments,
    readyAttachments,
    processing: attachmentProcessing,
    addFiles,
    removeAttachment,
    clearAttachments,
    canAddMore,
  } = useChatAttachments();

  const handleSend = () => {
    const msg = input.trim();
    if ((!msg && !readyAttachments.length) || loading || attachmentProcessing) return;
    const content = formatUserMessageWithAttachments(msg, attachments);
    const displayText = formatUserMessageDisplay(
      msg,
      readyAttachments.map((a) => a.name),
    );
    void onSend({ content, displayText });
    clearAttachments();
    onInputChange('');
  };

  return (
    <>
      <div className="greeting">
        <h2><span style={{ color: 'var(--red)' }}>Hank</span> — Your AI Assistant</h2>
        <p>Account-aware assistant for {company}. Every session is logged to your Zoho CRM record automatically.</p>
      </div>
      <div className="chat-layout">
        <div className="chat-main">
          <div className="chat-header">
            <div className="chat-avatar"><HankMark size={16} /></div>
            <div>
              <div className="chat-agent-name">Hank — Candid AI Assistant</div>
              <div className="chat-agent-status">Online — knows your account</div>
            </div>
            <div className="chat-zoho-badge"><AppIcon name="reports" size={12} /> Syncing to Zoho CRM</div>
          </div>
          <div className="chat-messages" ref={messagesRef}>
            {messages.map((m, i) => (
              <div key={i} className={`msg ${m.type} fade-up`}>
                <div className={`msg-avatar ${m.type}`}>{m.type === 'bot' ? <HankMark size={12} /> : userInitials}</div>
                <div>
                  <div className="msg-bubble" dangerouslySetInnerHTML={{ __html: m.text }} />
                  <div className="msg-time">{m.time}</div>
                </div>
              </div>
            ))}
            {loading && (
              <div className="msg bot fade-up">
                <div className="msg-avatar bot"><HankMark size={12} /></div>
                <div><div className="msg-bubble"><div className="typing"><span /><span /><span /></div></div></div>
              </div>
            )}
          </div>
          <div className="chat-suggestions">
            {['Why did my Square bill go up?', 'RingCentral is expiring — what should I do?', "What's my biggest savings opportunity?", 'How much have I saved since joining Candid?', 'Which services are expiring soon?', 'Schedule a call with my specialist'].map(s => (
              <div key={s} className="chip" onClick={() => onSuggestion(s)}>{s}</div>
            ))}
          </div>
          <ChatAttachmentChips
            attachments={attachments}
            onRemoveAttachment={removeAttachment}
            variant="chat"
          />
          <div className="chat-input-row">
            <ChatAttachmentUploadButton
              processing={attachmentProcessing}
              canAddMore={canAddMore}
              onAddFiles={addFiles}
              variant="chat"
            />
            <input
              className="chat-input"
              placeholder="Ask about your services, bills, contracts, savings..."
              value={input}
              onChange={e => onInputChange(e.target.value)}
              onKeyDown={e => e.key === 'Enter' && handleSend()}
              disabled={loading || attachmentProcessing}
            />
            <button
              className="chat-send"
              onClick={handleSend}
              disabled={loading || attachmentProcessing || (!input.trim() && !readyAttachments.length)}
            >
              <AppIcon name="send" size={14} />
            </button>
          </div>
          <div className="zoho-note"><AppIcon name="sync" size={12} /> This conversation will be saved to your Zoho CRM record as a note after the session ends.</div>
        </div>

        <div className="chat-sidebar">
          <div className="ctx-card">
            <div className="ctx-header">Your Account Snapshot</div>
            <div className="ctx-body">
              {[['Company', company], ['Monthly Spend', '$4,820'], ['Savings Found', '$1,715/mo', 'green'], ['Lifetime Savings', '$8,240', 'green'], ['Fee Status', 'Waived', 'green'], ['Bill Alerts', '1 flagged', 'red'], ['Expiring Soon', '2 services', 'amber']].map(([k, v, cls]) => (
                <div key={k} className="ctx-row"><span>{k}</span><span className={cls || ''}>{v}</span></div>
              ))}
            </div>
            <div className="zoho-sync-row"><AppIcon name="sync" size={12} /> Synced with Zoho CRM</div>
          </div>
          <div className="ctx-card">
            <div className="ctx-header">Contract Dates</div>
            <div className="ctx-body">
              {([
                { label: 'RingCentral', value: 'Jun 1', cls: 'red', warn: true },
                { label: 'Comcast', value: 'Jul 15', cls: 'amber' },
                { label: 'Square', value: 'M-t-M', cls: 'green' },
                { label: 'MS 365', value: 'Mar 2027', cls: 'green' },
                { label: 'Google WS', value: 'Aug 2026', cls: 'amber' },
              ] as const).map((row, i) => (
                <div key={i} className="ctx-row">
                  <span>{row.label}</span>
                  <span className={row.cls}>
                    {row.value}
                    {'warn' in row && row.warn ? (
                      <>
                        {' '}
                        <AppIcon name="warning" size={10} />
                      </>
                    ) : null}
                  </span>
                </div>
              ))}
            </div>
          </div>
          <div className="ctx-card">
            <div className="ctx-header">Your Specialist</div>
            <div className="ctx-body" style={{ textAlign: 'center', padding: '20px 16px' }}>
              <div style={{ fontSize: 32, marginBottom: 8 }}><AppIcon name="handshake" size={32} /></div>
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--gray-dark)', marginBottom: 2 }}>Candid Solutions Team</div>
              <div style={{ fontSize: 11, color: 'var(--gray)', marginBottom: 14 }}>candidsolutions.com</div>
              <button style={{ width: '100%', background: 'linear-gradient(135deg,var(--red-dark),var(--red-light))', color: 'white', border: 'none', borderRadius: 6, padding: 10, fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Schedule a Call</button>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function AlertsView({
  onViewChange,
  analysisTickets = [],
  onResolveTicket,
}: {
  onViewChange: (v: any) => void;
  analysisTickets?: AnalysisTicketRow[];
  onResolveTicket?: (ticketId: string) => void | Promise<void>;
}) {
  const ticketCount = analysisTickets.length;
  return (
    <>
      <div className="greeting">
        <h2>Alerts &amp; <span style={{ color: 'var(--red)' }}>Actions</span></h2>
        <p>
          {ticketCount > 0
            ? `${ticketCount} customer analysis question${ticketCount === 1 ? '' : 's'} plus other items below.`
            : '4 items need your attention. Prioritized by urgency and savings impact.'}
        </p>
      </div>
      <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {analysisTickets.map((t) => (
          <div
            key={t.id}
            style={{
              background: 'var(--white)',
              border: '1px solid #FECACA',
              borderLeft: '4px solid var(--red)',
              borderRadius: 8,
              padding: '20px 24px',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}>
                  <AppIcon name="hank" size={20} />
                </span>
                <div>
                  <div
                    style={{
                      fontSize: 10,
                      fontWeight: 700,
                      letterSpacing: '0.1em',
                      textTransform: 'uppercase',
                      color: 'var(--red)',
                      marginBottom: 3,
                    }}
                  >
                    Customer analysis question
                  </div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-dark)' }}>
                    {t.merchant_name || 'Merchant processing'} — {t.customer_name || t.customer_email}
                  </div>
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--gray)', whiteSpace: 'nowrap', marginTop: 2 }}>
                {formatTicketTime(t.created_at)}
              </span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.6, marginBottom: 10 }}>
              <strong>Question:</strong> {t.question}
            </div>
            {t.last_ai_reply && (
              <div
                style={{
                  fontSize: 12,
                  color: 'var(--gray)',
                  lineHeight: 1.5,
                  marginBottom: 14,
                  padding: '10px 12px',
                  background: 'var(--gray-light)',
                  borderRadius: 6,
                }}
              >
                <strong>Hank&apos;s reply:</strong> {t.last_ai_reply.replace(/<[^>]+>/g, '')}
              </div>
            )}
            <div style={{ display: 'flex', gap: 10 }}>
              {onResolveTicket && (
                <button
                  type="button"
                  onClick={() => void onResolveTicket(t.id)}
                  style={{
                    background: 'var(--white)',
                    color: 'var(--gray-dark)',
                    border: '1px solid var(--gray-border)',
                    borderRadius: 6,
                    padding: '8px 18px',
                    fontFamily: "'DM Sans',sans-serif",
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Mark resolved
                </button>
              )}
            </div>
          </div>
        ))}
        {[
          { icon: 'warning' as AppIconName, severity: 'Critical — Bill Anomaly', severityCls: 'var(--red)', borderCls: '#FECACA', borderLeft: 'var(--red)', title: 'Square Merchant Processing — Unexpected $94 Increase', date: 'Detected Apr 22, 2026', body: 'Your Square bill came in at <strong>$1,954</strong> vs. the expected <strong>$1,860</strong>. The $94 overage is due to fax transmissions exceeding your plan\'s monthly limit.', btnTxt: 'Ask AI Assistant', btnColor: 'var(--red)', view: 'chat' },
          { icon: 'calendar' as AppIconName, severity: 'Critical — Contract Expiring', severityCls: 'var(--red)', borderCls: '#FECACA', borderLeft: 'var(--red)', title: 'RingCentral UCaaS — Expires in 40 Days', date: 'Expires Jun 1, 2026', body: 'Your RingCentral contract for 25 seats expires June 1st. You are currently paying <strong>$1,250/mo</strong> — which is <strong>40% above the current market rate</strong> of $750/mo.', btnTxt: 'Schedule Review Call', btnColor: 'var(--red)', view: 'chat' },
          { icon: 'broadcast' as AppIconName, severity: 'Watch — Renewal Window Opening', severityCls: 'var(--amber)', borderCls: '#FED7AA', borderLeft: 'var(--amber)', title: 'Comcast Business Internet — Renewal Window in 55 Days', date: 'Expires Jul 15, 2026', body: 'Your Comcast Business renewal window opens in approximately 55 days. Current promotions show comparable service available at <strong>$280/mo</strong> vs. your current rate of <strong>$420/mo</strong>.', btnTxt: 'Ask AI Assistant', btnColor: 'var(--amber)', view: 'chat' },
          { icon: 'lightbulb' as AppIconName, severity: 'Opportunity — Quick Win', severityCls: 'var(--blue)', borderCls: '#BFDBFE', borderLeft: 'var(--blue)', title: 'Microsoft 365 — 4 Inactive Licenses Detected', date: 'No contract change needed', body: 'Analysis of your Microsoft 365 invoice shows <strong>4 of 22 licenses</strong> have had zero activity for the past 60+ days. Removing these saves <strong>$80/mo immediately</strong>.', btnTxt: 'Have Candid Handle This', btnColor: 'var(--blue)', view: 'chat' },
        ].map((a, i) => (
          <div key={i} style={{ background: 'var(--white)', border: `1px solid ${a.borderCls}`, borderLeft: `4px solid ${a.borderLeft}`, borderRadius: 7, padding: '20px 24px' }}>
            <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: 10 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontSize: 20 }}><AppIcon name={a.icon} size={20} /></span>
                <div>
                  <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.1em', textTransform: 'uppercase', color: a.severityCls, marginBottom: 3 }}>{a.severity}</div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: 'var(--gray-dark)' }}>{a.title}</div>
                </div>
              </div>
              <span style={{ fontSize: 11, color: 'var(--gray)', whiteSpace: 'nowrap', marginTop: 2 }}>{a.date}</span>
            </div>
            <div style={{ fontSize: 13, color: 'var(--gray-mid)', lineHeight: 1.6, marginBottom: 14 }} dangerouslySetInnerHTML={{ __html: a.body }} />
            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => onViewChange(a.view)} style={{ background: a.btnColor, color: 'white', border: 'none', borderRadius: 6, padding: '8px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>{a.btnTxt}</button>
              <button style={{ background: 'var(--white)', color: 'var(--gray-dark)', border: '1px solid var(--gray-border)', borderRadius: 6, padding: '8px 18px', fontFamily: "'DM Sans',sans-serif", fontSize: 12, fontWeight: 600, cursor: 'pointer' }}>Dismiss</button>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function RoadmapView() {
  const phases = [
    { num: 1, title: 'Phase 1 — Core Platform Foundation', status: 'done', items: [
      { s: 'done', t: 'Design system, CSS variables, typography, component library' },
      { s: 'done', t: 'Login screen with role selector (Admin / Member / Prospect)' },
      { s: 'done', t: 'Admin shell — sidebar navigation, topbar, view routing' },
      { s: 'done', t: 'Dashboard — KPI strip, savings report card, service rows, alert feed' },
      { s: 'done', t: 'Services view — grid layout, filter tabs, Candid vs. external comparison' },
    ]},
    { num: 2, title: 'Phase 2 — AI Layer & Analysis Engine', status: 'active', items: [
      { s: 'done', t: 'Hank AI assistant UI — chat layout, message bubbles, typing indicator' },
      { s: 'done', t: 'Claude API integration — real responses using account context system prompt' },
      { s: 'active', t: 'Bill upload flow — drag-and-drop, file type detection, processing animation' },
      { s: 'active', t: 'Service type detection — keyword matching against filename/content' },
      { s: 'pending', t: 'Real PDF parsing via Claude document API — extract actual bill data' },
    ]},
    { num: 3, title: 'Phase 3 — Member Portal', status: 'active', items: [
      { s: 'done', t: 'Member shell — simplified sidebar, dashboard, services, chat' },
      { s: 'active', t: 'Member-specific views — add service, reports, alerts, settings' },
      { s: 'pending', t: 'Supabase auth — real login, session management, row-level security' },
    ]},
    { num: 4, title: 'Phase 4 — Supabase Backend', status: 'pending', items: [
      { s: 'pending', t: 'Supabase project setup — auth, database schema, RLS policies' },
      { s: 'pending', t: 'Service table — store actual customer service data, not mock data' },
      { s: 'pending', t: 'Bill storage — upload invoices to Supabase Storage, link to services' },
      { s: 'pending', t: 'Alert engine — detect bill anomalies, contract expiry, flag automatically' },
    ]},
  ];

  return (
    <>
      <div className="greeting">
        <h2>Platform <span style={{ color: 'var(--red)' }}>Roadmap</span></h2>
        <p>Full build plan — what's complete, in progress, and planned. Updated after every session.</p>
      </div>
      <div className="build-plan">
        {phases.map(p => (
          <div key={p.num} className="phase-card">
            <div className="phase-header">
              <div className={`phase-num ${p.status}`}>{p.status === 'done' ? '✓' : p.num}</div>
              <div className="phase-title">{p.title}</div>
              <div className={`phase-status ${p.status}`}>{p.status === 'done' ? 'Complete' : p.status === 'active' ? 'In Progress' : 'Planned'}</div>
            </div>
            <div className="phase-body">
              <div className="phase-items">
                {p.items.map((item, i) => (
                  <div key={i} className="phase-item">
                    <span className={`pi-check ${item.s}`}>{item.s === 'done' ? '✓' : item.s === 'active' ? '◉' : '○'}</span>
                    {item.t}
                  </div>
                ))}
              </div>
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

// ── MEMBER-SPECIFIC VIEWS ─────────────────────────────────────
function parseMoney(v?: string): number {
  if (!v) return 0;
  const n = parseFloat(v.replace(/[^0-9.]/g, ''));
  return Number.isFinite(n) ? n : 0;
}

function greetingForNow(): string {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 18) return 'Good afternoon';
  return 'Good evening';
}

type DashboardKpi = {
  key: string;
  accent: 'red' | 'green' | 'amber' | 'blue';
  label: string;
  value: string;
  sub: string;
  detailTitle: string;
  detail: ReactNode;
  cta: { label: string; onClick: () => void };
};

function MemberDashboardView({
  onViewChange,
  onOpenNewQuote,
  onOpenGetHelp,
  services = [],
  accountSavings = null,
  openTickets = [],
  readyQuotes = [],
  pendingQuotes = [],
  newQuoteCount = 0,
  notifications = [],
  onMarkNotificationRead,
  dashboardRequests = [],
  onRequestNavigate,
  customerId = null,
}: {
  onViewChange: (v: any) => void;
  onOpenNewQuote?: () => void;
  onOpenGetHelp?: () => void;
  services?: ServiceCardModel[];
  /** CRM account recurring monthly savings (when set). */
  accountSavings?: number | null;
  openTickets?: CustomerTicketRow[];
  readyQuotes?: ServiceCardModel[];
  pendingQuotes?: ServiceCardModel[];
  newQuoteCount?: number;
  notifications?: MemberNotificationLite[];
  onMarkNotificationRead?: (id: string) => void;
  dashboardRequests?: import('@/lib/member-dashboard-requests').MemberDashboardRequest[];
  onRequestNavigate?: (target: import('@/lib/member-dashboard-requests').MemberDashboardRequestTarget) => void;
  /** Portal customer id — used for pending contracts in admin preview. */
  customerId?: string | null;
}) {
  const { name, company } = useContact();
  const first = name.split(/\s+/)[0] ?? 'there';
  const [openTile, setOpenTile] = useState<string | null>(null);

  const activeServices = services.filter((s) => s.status !== 'inactive');
  const candidManaged = activeServices.filter((s) => s.candidManaged);
  const monthlySpend = activeServices.reduce((sum, s) => sum + parseMoney(s.amount), 0);
  const expiringServices = activeServices.filter((s) => s.exp === 'urgent' || s.exp === 'warn');
  const spendLabel = monthlySpend > 0 ? `$${monthlySpend.toLocaleString('en-US', { maximumFractionDigits: 0 })}` : '—';

  const recurring = useMemo(
    () => accountRecurringMonthlySavings(activeServices, accountSavings),
    [activeServices, accountSavings],
  );
  const hasRecurringSavings = recurring.monthly > 0;
  const recurringMonthlyLabel = formatSavingsMoney(recurring.monthly);
  const recurringAnnualLabel = formatSavingsMoney(recurring.annual);

  const alertCount =
    notifications.filter((n) => !n.read_at).length +
    pendingQuotes.length +
    openTickets.length +
    (readyQuotes.length > 0 ? 1 : 0);
  const hasAlerts = alertCount > 0 || readyQuotes.length > 0 || notifications.length > 0;

  const kpis: DashboardKpi[] = [
    {
      key: 'spend',
      accent: 'red',
      label: 'Monthly Spend',
      value: spendLabel,
      sub: `across ${activeServices.length} service${activeServices.length === 1 ? '' : 's'}`,
      detailTitle: 'Where your money goes',
      detail:
        activeServices.length === 0 ? (
          <p className="dash-detail-empty">No services tracked yet. Add a service to see your spend.</p>
        ) : (
          <ul className="dash-detail-list">
            {activeServices
              .slice()
              .sort((a, b) => parseMoney(b.amount) - parseMoney(a.amount))
              .slice(0, 6)
              .map((s) => (
                <li key={s.id} className="dash-detail-row">
                  <span className="dash-detail-name">
                    {s.name}
                    {!s.candidManaged && <span className="dash-detail-tag">Not with Candid</span>}
                  </span>
                  <span className="dash-detail-val">{s.amount ?? '—'}<span className="dash-detail-permo">/mo</span></span>
                </li>
              ))}
          </ul>
        ),
      cta: { label: 'View all services →', onClick: () => onViewChange('mservices') },
    },
    {
      key: 'savings',
      accent: 'green',
      label: hasRecurringSavings
        ? 'Recurring Savings'
        : readyQuotes.length > 0
          ? 'Savings Ready'
          : 'Savings',
      value: hasRecurringSavings
        ? `${recurringMonthlyLabel}/mo`
        : readyQuotes.length > 0
          ? String(readyQuotes.length)
          : pendingQuotes.length > 0
            ? '…'
            : '0',
      sub: hasRecurringSavings
        ? `${recurringAnnualLabel} every year`
        : readyQuotes.length > 0
          ? `${readyQuotes.length === 1 ? 'quote' : 'quotes'} ready to review`
          : pendingQuotes.length > 0
            ? `${pendingQuotes.length} in review`
            : 'upload a bill to start',
      detailTitle: hasRecurringSavings ? 'Your ongoing savings' : 'Your savings pipeline',
      detail: hasRecurringSavings ? (
        <ul className="dash-detail-list">
          <li className="dash-detail-row">
            <span className="dash-detail-name">Monthly recurring</span>
            <span className="dash-detail-val dash-detail-val--ok">{recurringMonthlyLabel}</span>
          </li>
          <li className="dash-detail-row">
            <span className="dash-detail-name">Annualized</span>
            <span className="dash-detail-val dash-detail-val--ok">{recurringAnnualLabel}</span>
          </li>
          {recurring.serviceCount > 0 && (
            <li className="dash-detail-row">
              <span className="dash-detail-name">Services contributing</span>
              <span className="dash-detail-val">{recurring.serviceCount}</span>
            </li>
          )}
          {readyQuotes.length > 0 && (
            <li className="dash-detail-row">
              <span className="dash-detail-name">Additional quotes ready</span>
              <span className="dash-detail-val dash-detail-val--ok">{readyQuotes.length}</span>
            </li>
          )}
        </ul>
      ) : (
        <ul className="dash-detail-list">
          {readyQuotes.slice(0, 4).map((q) => (
            <li key={q.id} className="dash-detail-row">
              <span className="dash-detail-name">{q.vendor || q.name}</span>
              <span className="dash-detail-val dash-detail-val--ok">Ready</span>
            </li>
          ))}
          {pendingQuotes.slice(0, 4).map((q) => (
            <li key={q.id} className="dash-detail-row">
              <span className="dash-detail-name">{q.vendor || q.name}</span>
              <span className="dash-detail-val dash-detail-val--warn">In review</span>
            </li>
          ))}
          {readyQuotes.length === 0 && pendingQuotes.length === 0 && (
            <p className="dash-detail-empty">
              Upload any bill and Candid will hunt for savings — usually within one business day.
            </p>
          )}
        </ul>
      ),
      cta: {
        label: hasRecurringSavings || readyQuotes.length > 0 ? 'Open quotes →' : 'Find savings →',
        onClick: () => onViewChange('msavings'),
      },
    },
    {
      key: 'expiring',
      accent: 'amber',
      label: 'Expiring Soon',
      value: String(expiringServices.length),
      sub: 'within 60 days',
      detailTitle: 'Renewals coming up',
      detail:
        expiringServices.length === 0 ? (
          <p className="dash-detail-empty">Nothing expiring in the next 60 days. You&apos;re in good shape.</p>
        ) : (
          <ul className="dash-detail-list">
            {expiringServices.map((s) => (
              <li key={s.id} className="dash-detail-row">
                <span className="dash-detail-name">{s.name}</span>
                <span className={`dash-detail-val ${s.exp === 'urgent' ? 'dash-detail-val--urgent' : 'dash-detail-val--warn'}`}>
                  {s.expTxt?.replace('Expires ', '') ?? 'Soon'}
                </span>
              </li>
            ))}
          </ul>
        ),
      cta: { label: 'Review services →', onClick: () => onViewChange('mservices') },
    },
    {
      key: 'status',
      accent: 'blue',
      label: 'Member Status',
      value: 'Active',
      sub: 'Platform fee waived',
      detailTitle: 'Your membership',
      detail: (
        <ul className="dash-detail-list">
          <li className="dash-detail-row">
            <span className="dash-detail-name">Candid-managed services</span>
            <span className="dash-detail-val">{candidManaged.length}</span>
          </li>
          <li className="dash-detail-row">
            <span className="dash-detail-name">Platform fee</span>
            <span className="dash-detail-val dash-detail-val--ok">Waived</span>
          </li>
          <li className="dash-detail-row">
            <span className="dash-detail-name">Support</span>
            <span className="dash-detail-val">Concierge included</span>
          </li>
        </ul>
      ),
      cta: { label: 'Account settings →', onClick: () => onViewChange('msettings') },
    },
  ];

  const activeKpi = kpis.find((k) => k.key === openTile) ?? null;

  return (
    <>
      <div className={`greeting${hasRecurringSavings ? ' greeting--with-savings' : ''}`}>
        <div className="greeting-copy">
          <h2>{greetingForNow()}, {first}.</h2>
          <p>
            {hasRecurringSavings
              ? `You're saving ${recurringMonthlyLabel} every month with Candid — that's ${recurringAnnualLabel} a year.`
              : "Here's everything that needs your attention — and everything that doesn't."}
          </p>
        </div>
        {hasRecurringSavings && (
          <div className="dash-greeting-savings" aria-label={`Recurring monthly savings ${recurringMonthlyLabel}`}>
            <span className="dash-greeting-savings-eyebrow">Recurring savings</span>
            <span className="dash-greeting-savings-value">{recurringMonthlyLabel}<span>/mo</span></span>
            <span className="dash-greeting-savings-sub">{recurringAnnualLabel}/yr ongoing</span>
          </div>
        )}
      </div>

      <div className="dash-cta-row">
        <button type="button" className="dash-cta dash-cta--primary" onClick={() => onOpenNewQuote?.()}>
          <span className="dash-cta-icon"><AppIcon name="sparkles" size={16} /></span>
          <span className="dash-cta-text">
            <span className="dash-cta-title">New Quote</span>
            <span className="dash-cta-sub">Request pricing — no bill needed</span>
          </span>
        </button>
        <button type="button" className="dash-cta" onClick={() => onOpenGetHelp?.()}>
          <span className="dash-cta-icon"><AppIcon name="messages" size={16} /></span>
          <span className="dash-cta-text">
            <span className="dash-cta-title">Get help</span>
            <span className="dash-cta-sub">Billing, renewals, support &amp; more</span>
          </span>
        </button>
        <button type="button" className="dash-cta" onClick={() => onViewChange('msavings')}>
          <span className="dash-cta-icon"><AppIcon name="file" size={16} /></span>
          <span className="dash-cta-text">
            <span className="dash-cta-title">Analyze My Bill</span>
            <span className="dash-cta-sub">Upload — Hank reviews it</span>
          </span>
        </button>
        <button type="button" className="dash-cta" onClick={() => onViewChange('mfind')}>
          <span className="dash-cta-icon"><AppIcon name="search" size={16} /></span>
          <span className="dash-cta-text">
            <span className="dash-cta-title">Find Solutions</span>
            <span className="dash-cta-sub">Compare suppliers &amp; pricing</span>
          </span>
        </button>
      </div>

      <MemberPendingContractsPanel customerId={customerId} />

      {readyQuotes.length > 0 && (
        <div
          className="quotes-ready-banner"
          role="button"
          tabIndex={0}
          onClick={() => onViewChange('msavings')}
          onKeyDown={(e) => e.key === 'Enter' && onViewChange('msavings')}
        >
          <div className="quotes-ready-banner-icon">
            <AppIcon name="sparkles" size={22} />
          </div>
          <div className="quotes-ready-banner-body">
            <div className="quotes-ready-banner-title">
              {readyQuotes.length === 1
                ? 'Your savings quote is ready'
                : `${readyQuotes.length} savings quotes are ready`}
              {newQuoteCount > 0 && <span className="quotes-ready-banner-new">{newQuoteCount} new</span>}
            </div>
            <div className="quotes-ready-banner-sub">
              Candid finished reviewing {readyQuotes.map((q) => q.vendor || q.name).slice(0, 3).join(', ')}
              {readyQuotes.length > 3 ? ` +${readyQuotes.length - 3} more` : ''}. Open to see your savings.
            </div>
          </div>
          <span className="quotes-ready-banner-cta">View quotes →</span>
        </div>
      )}

      <div className="kpi-strip">
        {kpis.map((k) => (
          <button
            key={k.key}
            type="button"
            className={`kpi ${k.accent} kpi-clickable${openTile === k.key ? ' kpi-active' : ''}`}
            onClick={() => setOpenTile((cur) => (cur === k.key ? null : k.key))}
            aria-expanded={openTile === k.key}
          >
            <div className="kpi-label">{k.label}</div>
            <div className="kpi-value" style={k.value === 'Active' ? { fontSize: 18, marginTop: 4 } : undefined}>
              {k.value}
            </div>
            <div className="kpi-sub">{k.sub}</div>
            <span className="kpi-expand-hint">{openTile === k.key ? 'Hide' : 'Details'}</span>
          </button>
        ))}
      </div>

      {activeKpi && (
        <div className={`dash-detail-drawer dash-detail-drawer--${activeKpi.accent}`}>
          <div className="dash-detail-head">
            <span className="dash-detail-title">{activeKpi.detailTitle}</span>
            <button type="button" className="dash-detail-close" onClick={() => setOpenTile(null)} aria-label="Close">
              <AppIcon name="close" size={13} />
            </button>
          </div>
          {activeKpi.detail}
          <button type="button" className="dash-detail-cta" onClick={activeKpi.cta.onClick}>
            {activeKpi.cta.label}
          </button>
        </div>
      )}

      {dashboardRequests.length > 0 && onRequestNavigate && (
        <MemberRequestsPanel requests={dashboardRequests} onNavigate={onRequestNavigate} />
      )}

      <div className="dash-grid">
        <div className="card dash-alerts-card">
          <div className="card-header">
            <div className="card-title">Alerts &amp; Actions</div>
            <span className="dash-alerts-count">
              {alertCount > 0 ? `${alertCount} need${alertCount === 1 ? 's' : ''} attention` : 'All clear'}
            </span>
          </div>
          <div className="card-body">
            {!hasAlerts && (
              <div className="dash-allclear">
                <div className="dash-allclear-icon"><AppIcon name="check" size={20} /></div>
                <div>
                  <div className="dash-allclear-title">You&apos;re all caught up</div>
                  <div className="dash-allclear-sub">No alerts right now. We&apos;ll flag anything that needs you.</div>
                </div>
              </div>
            )}

            {readyQuotes.length > 0 && (
              <div className="alert-item alert-item--rich" onClick={() => onViewChange('msavings')}>
                <div className="alert-dot green" />
                <div className="alert-item-body">
                  <div className="alert-text">
                    <strong>{readyQuotes.length === 1 ? 'A savings quote is ready' : `${readyQuotes.length} savings quotes are ready`}</strong>
                  </div>
                  <div className="alert-sub">
                    {readyQuotes.map((q) => q.vendor || q.name).slice(0, 2).join(', ')}
                    {readyQuotes.length > 2 ? ` +${readyQuotes.length - 2} more` : ''} — review your proposed savings.
                  </div>
                </div>
                <span className="alert-go">Review →</span>
              </div>
            )}

            {notifications.map((n) => (
              <div
                key={`notif-${n.id}`}
                className="alert-item alert-item--rich"
                onClick={() => {
                  if (!n.read_at) onMarkNotificationRead?.(n.id);
                  onViewChange('msavings');
                }}
              >
                <div className={`alert-dot ${n.read_at ? 'blue' : 'green'}`} />
                <div className="alert-item-body">
                  <div className="alert-text"><strong>{n.title}</strong></div>
                  <div className="alert-sub">{n.body}</div>
                </div>
                <span className="alert-go">Open →</span>
              </div>
            ))}

            {pendingQuotes.map((q) => (
              <div
                key={`pending-${q.id}`}
                className="alert-item alert-item--rich"
                onClick={() => onViewChange('msavings')}
              >
                <div className="alert-dot amber" />
                <div className="alert-item-body">
                  <div className="alert-text">
                    <strong>{q.vendor || q.name}</strong> is being reviewed
                  </div>
                  <div className="alert-sub">Candid is analyzing this for savings — usually within one business day.</div>
                </div>
                <span className="alert-go">Track →</span>
              </div>
            ))}

            {expiringServices.slice(0, 3).map((s) => (
              <div
                key={`exp-${s.id}`}
                className="alert-item alert-item--rich"
                onClick={() => onViewChange('mservices')}
              >
                <div className={`alert-dot ${s.exp === 'urgent' ? 'red' : 'amber'}`} />
                <div className="alert-item-body">
                  <div className="alert-text">
                    <strong>{s.name}</strong> {s.exp === 'urgent' ? 'expires very soon' : 'is expiring soon'}
                  </div>
                  <div className="alert-sub">
                    {s.expTxt ?? 'Renewal window open'} — ask Hank whether to renew, renegotiate, or switch.
                  </div>
                </div>
                <span className="alert-go">Review →</span>
              </div>
            ))}

            {openTickets.map((t) => (
              <div
                key={`ticket-${t.id}`}
                className="alert-item alert-item--rich"
                onClick={() => onViewChange('mservices')}
              >
                <div className="alert-dot amber" />
                <div className="alert-item-body">
                  <div className="alert-text">
                    <strong>{t.service_name}</strong> — {t.subject}
                  </div>
                  <div className="alert-sub">{formatCustomerTicketTime(t.created_at)} · Awaiting the Candid team</div>
                </div>
                <span className="alert-go">View →</span>
              </div>
            ))}
          </div>
        </div>

        <div className="dash-right-col">
          <div className="card dash-snapshot-card">
            <div className="card-header">
              <div className="card-title">Account snapshot</div>
              <span className="dash-snapshot-sync"><AppIcon name="sync" size={11} /> Live</span>
            </div>
            <div className="card-body">
              {hasRecurringSavings && (
                <div className="dash-snap-savings">
                  <div className="dash-snap-savings-copy">
                    <div className="dash-snap-savings-label">Recurring monthly savings</div>
                    <div className="dash-snap-savings-value">{recurringMonthlyLabel}<span>/mo</span></div>
                    <div className="dash-snap-savings-sub">
                      {recurringAnnualLabel}/yr ongoing
                      {recurring.serviceCount > 0
                        ? ` · across ${recurring.serviceCount} service${recurring.serviceCount === 1 ? '' : 's'}`
                        : ''}
                    </div>
                  </div>
                  <button
                    type="button"
                    className="dash-snap-savings-cta"
                    onClick={() => onViewChange('msavings')}
                  >
                    See details
                  </button>
                </div>
              )}
              <div className="dash-snap-grid">
                <div className="dash-snap-cell">
                  <div className="dash-snap-label">Company</div>
                  <div className="dash-snap-value">{company}</div>
                </div>
                <div className="dash-snap-cell">
                  <div className="dash-snap-label">Monthly spend</div>
                  <div className="dash-snap-value">{spendLabel}</div>
                </div>
                {hasRecurringSavings ? (
                  <div className="dash-snap-cell dash-snap-cell--savings">
                    <div className="dash-snap-label">Recurring savings</div>
                    <div className="dash-snap-value dash-snap-value--ok">{recurringMonthlyLabel}/mo</div>
                  </div>
                ) : (
                  <div className="dash-snap-cell">
                    <div className="dash-snap-label">Quotes ready</div>
                    <div className="dash-snap-value dash-snap-value--ok">{readyQuotes.length}</div>
                  </div>
                )}
                <div className="dash-snap-cell">
                  <div className="dash-snap-label">Services tracked</div>
                  <div className="dash-snap-value">{activeServices.length}</div>
                </div>
                <div className="dash-snap-cell">
                  <div className="dash-snap-label">Expiring soon</div>
                  <div className={`dash-snap-value${expiringServices.length ? ' dash-snap-value--warn' : ''}`}>
                    {expiringServices.length}
                  </div>
                </div>
                <div className="dash-snap-cell">
                  <div className="dash-snap-label">Member status</div>
                  <div className="dash-snap-value dash-snap-value--ok">Active</div>
                </div>
              </div>

              {expiringServices.length > 0 && (
                <div className="dash-snap-section">
                  <div className="dash-snap-section-title">Upcoming renewals</div>
                  {expiringServices.slice(0, 3).map((s) => (
                    <div key={`snap-exp-${s.id}`} className="dash-snap-renewal">
                      <span className="dash-snap-renewal-name">{s.name}</span>
                      <span className={`dash-snap-renewal-date${s.exp === 'urgent' ? ' urgent' : ''}`}>
                        {s.expTxt?.replace('Expires ', '') ?? 'Soon'}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              <div className="dash-snap-specialist">
                <div className="dash-snap-specialist-avatar"><AppIcon name="handshake" size={16} /></div>
                <div className="dash-snap-specialist-body">
                  <div className="dash-snap-specialist-name">Your Candid team</div>
                  <div className="dash-snap-specialist-sub">Here whenever you need us</div>
                </div>
                <button
                  type="button"
                  className="dash-snap-specialist-btn"
                  onClick={() => {
                    window.dispatchEvent(
                      new CustomEvent('candid:open-hank', {
                        detail: { prompt: 'Schedule a call with my specialist' },
                      }),
                    );
                  }}
                >
                  Schedule a call
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

function MemberServicesView({
  services,
  userId,
  customerName,
  customerEmail,
  pendingBillReview,
  onDismissPendingBillReview,
  onCompletePendingBillReview,
  onBillConfirmed,
  onOpenMerchantAnalysis,
  onOpenProposalAnalysis,
  onOpenPendingReview,
  onOpenServiceDetail,
  onRemoveService,
  onAddExternalService,
  onEditExternalService,
  onGetHelp,
  onRenewNow,
  onRequestNewQuote,
  helpInProgress,
}: {
  services: ServiceCardModel[];
  userId?: string;
  customerName?: string;
  customerEmail?: string;
  pendingBillReview?: {
    reviewId?: string;
    vendorName: string;
    parseResult: BillParseResult;
    categories?: string[] | null;
  } | null;
  onDismissPendingBillReview?: () => void;
  onCompletePendingBillReview?: () => void;
  onBillConfirmed?: () => void;
  onOpenMerchantAnalysis?: (snapshot: MerchantAnalysisSnapshot, serviceId: string) => void;
  onOpenProposalAnalysis?: (
    snapshot: PublishedAnalysisSnapshot,
    reviewId: string,
    serviceId: string,
  ) => void;
  onOpenPendingReview?: (svc: ServiceCardModel) => void;
  onGetHelp?: (svc: ServiceCardModel) => void;
  onRenewNow?: (svc: ServiceCardModel) => void;
  onRequestNewQuote?: (svc: ServiceCardModel) => void;
  onOpenServiceDetail?: (svc: ServiceCardModel) => void;
  onRemoveService?: (svc: ServiceCardModel) => void;
  onAddExternalService?: () => void;
  onEditExternalService?: (svc: ServiceCardModel) => void;
  helpInProgress?: (svc: ServiceCardModel) => boolean;
}) {
  const candidManaged = services.filter((s) => s.candidManaged);
  const notWithCandid = services.filter((s) => !s.candidManaged);
  const vendors = [...new Set(services.map((s) => s.vendor).filter(Boolean))];

  return (
    <>
      <div className="greeting">
        <h2>
          My <span style={{ color: 'var(--red)' }}>Services</span>
        </h2>
        <p>Candid-managed services and external services we can help you optimize.</p>
      </div>

      {pendingBillReview && (
        <div style={{ marginBottom: 24 }}>
          <MemberBillPendingReview
            vendorName={pendingBillReview.vendorName}
            parseResult={pendingBillReview.parseResult}
            categories={pendingBillReview.categories}
            reviewId={pendingBillReview.reviewId}
            userId={userId}
            customerName={customerName}
            customerEmail={customerEmail}
            alreadySubmitted={Boolean(pendingBillReview.parseResult.customerConfirmation)}
            onSubmitted={onBillConfirmed}
            onBack={onDismissPendingBillReview}
            onComplete={onCompletePendingBillReview ?? onDismissPendingBillReview}
          />
        </div>
      )}

      <div className="services-section-title">Candid Managed Services</div>
      {candidManaged.length === 0 ? (
        <p style={{ fontSize: 13, color: 'var(--gray)', marginBottom: 20 }}>No Candid-managed services yet.</p>
      ) : (
        <ServicesGrid
          services={candidManaged}
          showAddCard={false}
          onOpenMerchantAnalysis={onOpenMerchantAnalysis}
          onOpenProposalAnalysis={onOpenProposalAnalysis}
          onOpenPendingReview={onOpenPendingReview}
          onGetHelp={onGetHelp}
          onRenewNow={onRenewNow}
          onRequestNewQuote={onRequestNewQuote}
          onOpenServiceDetail={onOpenServiceDetail}
          helpInProgress={helpInProgress}
        />
      )}

      <div className="services-section-title">Services Not With Candid</div>
      {notWithCandid.length === 0 && !onAddExternalService ? (
        <p style={{ fontSize: 13, color: 'var(--gray)' }}>
          Track vendors you manage outside Candid — add services manually or upload a contract or bill.
        </p>
      ) : null}
      <ServicesGrid
        services={notWithCandid}
        showAddCard={Boolean(onAddExternalService)}
        onOpenAddService={onAddExternalService}
        addCardLabel="Add service not with Candid"
        addCardHint="Enter details or upload a contract / bill"
        onOpenMerchantAnalysis={onOpenMerchantAnalysis}
        onOpenProposalAnalysis={onOpenProposalAnalysis}
        onOpenPendingReview={onOpenPendingReview}
        onGetHelp={onGetHelp}
        onOpenServiceDetail={onOpenServiceDetail}
        onEditExternalService={onEditExternalService}
        onRemoveService={onRemoveService}
        helpInProgress={helpInProgress}
      />
      <MemberSupplierGuidesPanel vendors={vendors} />
    </>
  );
}

