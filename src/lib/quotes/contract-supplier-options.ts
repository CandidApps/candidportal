export type ContractSupplierContactOption = {
  providerId: string;
  providerName: string;
  contactId: string;
  contactName: string;
  contactEmail: string;
  role: string | null;
  isPrimary: boolean;
};

export type PaysourceOption = {
  name: string;
  partnerId: string | null;
  contactEmail: string | null;
  contactName: string | null;
};
