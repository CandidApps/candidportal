import type { ActionCenterTab } from '@/components/admin/AdminActionCenterView';
import type { Customer } from '@/components/CustomersView';
import type { Lead } from '@/components/LeadsView';
import type { UnifiedAdminTicket } from '@/lib/admin-tickets';
import { TICKET_KIND_LABEL } from '@/lib/admin-tickets';
import type { BmwAgentRate, BmwDeal } from '@/lib/bmw/types';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import type { ServiceCardModel } from '@/lib/services/account-services';
import type { CustomerTicketRow } from '@/lib/services/customer-tickets';
import type { MerchantAnalysisSnapshot } from '@/lib/candid-pay/merchant-analysis';
import type { PublishedAnalysisSnapshot } from '@/lib/bill-parse-types';

export type GlobalSearchKind =
  | 'nav'
  | 'account'
  | 'action'
  | 'service'
  | 'contract'
  | 'document'
  | 'agent'
  | 'deal'
  | 'lead';

export type GlobalSearchItem = {
  id: string;
  label: string;
  meta?: string;
  kind: GlobalSearchKind;
  /** Additional text included when matching (not shown in the UI). */
  searchText: string;
  onSelect: () => void;
};

export const GLOBAL_SEARCH_KIND_LABEL: Record<GlobalSearchKind, string> = {
  nav: 'Page',
  account: 'Account',
  action: 'Action',
  service: 'Service',
  contract: 'Contract',
  document: 'Document',
  agent: 'Agent',
  deal: 'Deal',
  lead: 'Lead',
};

function searchBlob(...parts: (string | null | undefined | false)[]): string {
  return parts.filter(Boolean).join(' ');
}

function customerContracts(
  customerId: string,
  contractsByCustomerId: Record<string, CandidContractRecord[]>,
): CandidContractRecord[] {
  return contractsByCustomerId[customerId] ?? [];
}

function customerDocuments(
  customerId: string,
  documentsByCustomerId: Record<string, CustomerDocument[]>,
): CustomerDocument[] {
  return documentsByCustomerId[customerId] ?? [];
}

function customerSearchText(
  customer: Customer,
  contracts: CandidContractRecord[],
  documents: CustomerDocument[],
): string {
  const contacts = customer.contacts
    .map((c) => searchBlob(c.name, c.email, c.phone, c.role))
    .join(' ');
  const locations = customer.locations
    .map((l) => searchBlob(l.label, l.street, l.city, l.state, l.zip))
    .join(' ');
  const portal = customer.portal;
  const portalServices = (portal?.nonCandidServices ?? [])
    .map((s) => searchBlob(s.provider, s.product, s.accountNum, s.note))
    .join(' ');
  const contractText = contracts
    .map((c) => searchBlob(c.vendor, c.service, c.product, c.solution, c.paySource, c.providerAccountNum))
    .join(' ');
  const documentText = documents.map((d) => searchBlob(d.filename, d.recordKind)).join(' ');

  return searchBlob(
    customer.company,
    customer.companyLegal,
    customer.industry,
    customer.description,
    customer.website,
    customer.agent,
    customer.notes,
    customer.status,
    portal?.bmwMerchantName,
    portal?.displayName,
    portal?.previousProvider?.provider,
    contacts,
    locations,
    portalServices,
    contractText,
    documentText,
  );
}

function serviceSearchText(service: ServiceCardModel): string {
  return searchBlob(
    service.name,
    service.vendor,
    service.statusTxt,
    service.amount,
    service.expTxt,
    service.expSub,
    service.locationLabel,
    service.locationAddress,
    ...service.filter,
  );
}

function actionTabForKind(kind: UnifiedAdminTicket['kind']): ActionCenterTab {
  return kind;
}

export function scoreGlobalSearch(query: string, item: GlobalSearchItem): number {
  const q = query.trim().toLowerCase();
  if (!q) return 0;

  const tokens = q.split(/\s+/).filter(Boolean);
  const hay = `${item.label} ${item.meta ?? ''} ${item.searchText}`.toLowerCase();
  if (!tokens.every((token) => hay.includes(token))) return 0;

  const label = item.label.toLowerCase();
  if (label.startsWith(q)) return 100;
  if (tokens.every((token) => label.includes(token))) return 80;
  if (label.includes(q)) return 65;

  const meta = (item.meta ?? '').toLowerCase();
  if (meta.includes(q)) return 50;

  return 30;
}

export function filterGlobalSearchItems(
  items: GlobalSearchItem[],
  query: string,
  limit = 12,
): GlobalSearchItem[] {
  const q = query.trim();
  if (!q) return [];

  return items
    .map((item) => ({ item, score: scoreGlobalSearch(q, item) }))
    .filter((row) => row.score > 0)
    .sort((a, b) => b.score - a.score || a.item.label.localeCompare(b.item.label))
    .slice(0, limit)
    .map((row) => row.item);
}

export type AdminGlobalSearchActions = {
  openActionCenter: (tab?: ActionCenterTab) => void;
  openActionCenterTicket: (ticketId: string, tab?: ActionCenterTab) => void;
  openCustomerAccount: (customerId: string) => void;
  openAnalysisReview: (reviewId: string) => void;
  setAdminView: (
    view: 'assistant' | 'customers' | 'leads' | 'agents' | 'commissions' | 'partners' | 'tickets',
  ) => void;
  closeMerchantAnalysis: () => void;
};

export function buildAdminGlobalSearchItems(args: {
  actions: AdminGlobalSearchActions;
  customers: Customer[];
  contractsByCustomerId: Record<string, CandidContractRecord[]>;
  documentsByCustomerId: Record<string, CustomerDocument[]>;
  adminTickets: UnifiedAdminTicket[];
  bmwDeals: BmwDeal[];
  agentRates: BmwAgentRate[];
  leads?: Lead[];
}): GlobalSearchItem[] {
  const {
    actions,
    customers,
    contractsByCustomerId,
    documentsByCustomerId,
    adminTickets,
    bmwDeals,
    agentRates,
    leads = [],
  } = args;
  const { openActionCenter, openActionCenterTicket, openCustomerAccount, openAnalysisReview, setAdminView, closeMerchantAnalysis } =
    actions;

  const nav: GlobalSearchItem[] = [
    {
      id: 'nav-assistant',
      label: 'MyAssistant',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'my assistant day week calendar meetings tasks mentions priorities',
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('assistant');
      },
    },
    {
      id: 'nav-tickets',
      label: 'Action Center',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'actions tickets renewals analysis reviews statements',
      onSelect: () => openActionCenter('all'),
    },
    {
      id: 'nav-analysis-review',
      label: 'Analysis Review',
      meta: 'Action Center',
      kind: 'nav',
      searchText: 'bill analysis review merchant processing',
      onSelect: () => openActionCenter('analysis_review'),
    },
    {
      id: 'nav-customers',
      label: 'Accounts',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'customers accounts companies crm',
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('customers');
      },
    },
    {
      id: 'nav-leads',
      label: 'Leads',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'prospects pipeline sales',
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('leads');
      },
    },
    {
      id: 'nav-agents',
      label: 'Agents',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'partners commissions reps',
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('agents');
      },
    },
    {
      id: 'nav-commissions',
      label: 'Commissions',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'payments deposits bmw',
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('commissions');
      },
    },
    {
      id: 'nav-partners',
      label: 'Partners',
      meta: 'Admin',
      kind: 'nav',
      searchText: 'suppliers vendors pay sources',
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('partners');
      },
    },
  ];

  const accounts: GlobalSearchItem[] = customers.map((customer) => {
    const contracts = customerContracts(customer.id, contractsByCustomerId);
    const documents = customerDocuments(customer.id, documentsByCustomerId);
    const primary =
      customer.contacts.find((c) => c.isPrimary) ?? customer.contacts[0];
    return {
      id: `account-${customer.id}`,
      label: customer.company,
      meta: searchBlob(primary?.name, primary?.email, customer.agent) || 'Account',
      kind: 'account',
      searchText: customerSearchText(customer, contracts, documents),
      onSelect: () => openCustomerAccount(customer.id),
    };
  });

  const contracts: GlobalSearchItem[] = customers.flatMap((customer) => {
    const rows = customerContracts(customer.id, contractsByCustomerId);
    return rows.map((contract) => ({
      id: `contract-${customer.id}-${contract.id}`,
      label: contract.service || contract.vendor || contract.product || 'Contract',
      meta: `${customer.company} · ${contract.vendor || contract.paySource || 'Contract'}`,
      kind: 'contract' as const,
      searchText: searchBlob(
        customer.company,
        contract.vendor,
        contract.service,
        contract.product,
        contract.solution,
        contract.paySource,
        contract.providerAccountNum,
        contract.agentOfRecord,
      ),
      onSelect: () => openCustomerAccount(customer.id),
    }));
  });

  const documents: GlobalSearchItem[] = customers.flatMap((customer) => {
    const rows = customerDocuments(customer.id, documentsByCustomerId);
    return rows.map((doc) => ({
      id: `document-${customer.id}-${doc.id}`,
      label: doc.filename,
      meta: `${customer.company} · ${doc.recordKind}`,
      kind: 'document' as const,
      searchText: searchBlob(customer.company, doc.filename, doc.recordKind, doc.uploadedBy),
      onSelect: () => openCustomerAccount(customer.id),
    }));
  });

  const actionsItems: GlobalSearchItem[] = adminTickets.map((ticket) => ({
    id: `action-${ticket.id}`,
    label: ticket.title,
    meta: `${ticket.customerName} · ${TICKET_KIND_LABEL[ticket.kind]}`,
    kind: 'action',
    searchText: searchBlob(
      ticket.title,
      ticket.detail,
      ticket.customerName,
      ticket.customerEmail,
      TICKET_KIND_LABEL[ticket.kind],
    ),
    onSelect: () => {
      if (ticket.kind === 'analysis_review') {
        openAnalysisReview(ticket.sourceId);
        return;
      }
      openActionCenterTicket(ticket.id, actionTabForKind(ticket.kind));
    },
  }));

  const deals: GlobalSearchItem[] = bmwDeals.map((deal) => ({
    id: `deal-${deal.uuid || deal.dealUid || deal.rowNum}`,
    label: deal.merchant || deal.serviceDescription || 'BMW deal',
    meta: searchBlob(deal.provider, deal.product, deal.agentName) || 'Deal',
    kind: 'deal',
    searchText: searchBlob(
      deal.merchant,
      deal.provider,
      deal.product,
      deal.serviceDescription,
      deal.agentName,
      deal.customerContactName,
      deal.paySource,
      deal.providerAccount,
      deal.city,
      deal.state,
    ),
    onSelect: () => {
      if (deal.customerId) openCustomerAccount(deal.customerId);
      else {
        closeMerchantAnalysis();
        setAdminView('commissions');
      }
    },
  }));

  const agents: GlobalSearchItem[] = agentRates.map((agent) => ({
    id: `agent-${agent.id}`,
    label: agent.name,
    meta: agent.email,
    kind: 'agent',
    searchText: searchBlob(agent.name, agent.email, agent.id, agent.overridePartner),
    onSelect: () => {
      closeMerchantAnalysis();
      setAdminView('agents');
    },
  }));

  const leadItems: GlobalSearchItem[] = leads.map((lead) => {
    const primary = lead.contacts.find((c) => c.isPrimary) ?? lead.contacts[0];
    return {
      id: `lead-${lead.id}`,
      label: lead.companyFriendly || lead.companyLegal || 'Lead',
      meta: searchBlob(primary?.name, primary?.email) || 'Lead',
      kind: 'lead',
      searchText: searchBlob(
        lead.companyFriendly,
        lead.companyLegal,
        lead.website,
        lead.helpWith,
        lead.currentTechnology,
        lead.contacts.map((c) => searchBlob(c.name, c.email, c.phone, c.role)).join(' '),
        lead.locations.map((l) => searchBlob(l.city, l.state, l.zip)).join(' '),
      ),
      onSelect: () => {
        closeMerchantAnalysis();
        setAdminView('leads');
      },
    };
  });

  return [...nav, ...accounts, ...actionsItems, ...contracts, ...documents, ...deals, ...agents, ...leadItems];
}

export type MemberPortalView =
  | 'mdashboard'
  | 'mservices'
  | 'msavings'
  | 'msettings';

export type MemberGlobalSearchActions = {
  setMemberView: (view: MemberPortalView) => void;
  closeMerchantAnalysis: () => void;
  openMerchantAnalysis: (snapshot: MerchantAnalysisSnapshot, serviceId?: string) => void;
  openProposalAnalysis: (snapshot: PublishedAnalysisSnapshot, reviewId: string, serviceId?: string) => void;
  openServiceDetail: (service: ServiceCardModel) => void;
};

export function buildMemberGlobalSearchItems(args: {
  actions: MemberGlobalSearchActions;
  userServices: ServiceCardModel[];
  customerTickets: CustomerTicketRow[];
}): GlobalSearchItem[] {
  const { actions, userServices, customerTickets } = args;
  const { setMemberView, closeMerchantAnalysis, openMerchantAnalysis, openProposalAnalysis, openServiceDetail } =
    actions;

  const nav: GlobalSearchItem[] = [
    {
      id: 'nav-mdashboard',
      label: 'Dashboard',
      meta: 'Portal',
      kind: 'nav',
      searchText: 'home overview savings',
      onSelect: () => {
        closeMerchantAnalysis();
        setMemberView('mdashboard');
      },
    },
    {
      id: 'nav-mservices',
      label: 'My Services',
      meta: 'Portal',
      kind: 'nav',
      searchText: 'contracts vendors bills',
      onSelect: () => {
        closeMerchantAnalysis();
        setMemberView('mservices');
      },
    },
    {
      id: 'nav-msavings',
      label: 'Quotes',
      meta: 'Portal',
      kind: 'nav',
      searchText: 'quotes savings opportunities optimization renewals analysis',
      onSelect: () => {
        closeMerchantAnalysis();
        setMemberView('msavings');
      },
    },
    {
      id: 'nav-msettings',
      label: 'Account Settings',
      meta: 'Portal',
      kind: 'nav',
      searchText: 'profile notifications theme team members',
      onSelect: () => {
        closeMerchantAnalysis();
        setMemberView('msettings');
      },
    },
  ];

  const services: GlobalSearchItem[] = userServices.map((service) => ({
    id: `svc-${service.id}`,
    label: service.name,
    meta: searchBlob(service.vendor, service.statusTxt, service.amount) || 'Service',
    kind: 'service',
    searchText: serviceSearchText(service),
    onSelect: () => {
      closeMerchantAnalysis();
      setMemberView('mservices');
      if (service.merchantAnalysis) {
        openMerchantAnalysis(service.merchantAnalysis, service.id);
        return;
      }
      if (service.analysisSnapshot && service.analysisReviewId) {
        openProposalAnalysis(service.analysisSnapshot, service.analysisReviewId, service.id);
        return;
      }
      openServiceDetail(service);
    },
  }));

  const tickets: GlobalSearchItem[] = customerTickets.map((ticket) => ({
    id: `ticket-${ticket.id}`,
    label: ticket.subject,
    meta: searchBlob(ticket.service_name, ticket.status) || 'Support ticket',
    kind: 'action',
    searchText: searchBlob(ticket.subject, ticket.message, ticket.service_name, ticket.status),
    onSelect: () => {
      closeMerchantAnalysis();
      setMemberView('mservices');
      const service = userServices.find((s) => s.id === ticket.service_id);
      if (service) openServiceDetail(service);
    },
  }));

  return [...nav, ...services, ...tickets];
}
