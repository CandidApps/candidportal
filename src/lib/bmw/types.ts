export type BmwDeal = {
  rowNum: number;
  paySource: string;
  dealUid: string;
  agentCommId: string;
  merchant: string;
  provider: string;
  product: string;
  providerAccount: string;
  uidHeader: string;
  sandlerDealId: string;
  serviceDescription: string;
  rate: number | null;
  contractMrc: number | null;
  activeDeal: boolean;
  status: string;
  street: string;
  city: string;
  state: string;
  zip: string;
  agentName: string;
  customerId: string;
  customerContactName: string;
  agentId: string;
  serviceId: string;
  uuid: string;
  cloverId: string;
};

export type BmwAgentRate = {
  rowNum: number;
  email: string;
  name: string;
  id: string;
  commissionRate: number;
  overridePartner: string;
  overrideRate: number | null;
  tempRate: number | null;
  tempRateEndDate: string;
  tempRateDetermine: string;
};

export type DealKey = string;
