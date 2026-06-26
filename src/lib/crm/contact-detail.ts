export type ContactDetailType = 'account' | 'supplier' | 'team';

export type ContactDetail = {
  found: boolean;
  type: ContactDetailType | null;
  name: string;
  email: string;
  phone: string | null;
  role: string | null;
  org: string | null;
  customerId: string | null;
  website: string | null;
  category: string | null;
  agent: string | null;
  status: string | null;
};

export async function fetchContactDetail(email: string): Promise<ContactDetail> {
  const res = await fetch(`/api/admin/contacts/detail?email=${encodeURIComponent(email)}`);
  if (!res.ok) throw new Error('Failed to load contact');
  const json = (await res.json()) as { detail?: ContactDetail };
  if (!json.detail) throw new Error('Contact not found');
  return json.detail;
}
