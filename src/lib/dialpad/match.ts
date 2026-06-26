import 'server-only';

/** Last 10 digits for US-style phone matching. */
export function phoneKey(raw: string | null | undefined): string | null {
  const digits = (raw ?? '').replace(/\D/g, '');
  if (digits.length < 10) return null;
  return digits.slice(-10);
}

export type CrmContactMatchMaps = {
  byEmail: Map<string, string>;
  byPhone: Map<string, string>;
};

/** Builds email → customer_id and phone-key → customer_id maps from CRM contacts. */
export function buildCrmContactMaps(
  rows: { customer_id: string | null; email: string | null; phone: string | null; is_primary?: boolean | null }[],
): CrmContactMatchMaps {
  const byEmail = new Map<string, string>();
  const byPhone = new Map<string, string>();

  for (const row of rows) {
    const customerId = row.customer_id ? String(row.customer_id) : '';
    if (!customerId) continue;

    const email = String(row.email ?? '').trim().toLowerCase();
    if (email && !byEmail.has(email)) byEmail.set(email, customerId);

    const key = phoneKey(row.phone);
    if (key && !byPhone.has(key)) byPhone.set(key, customerId);
  }

  return { byEmail, byPhone };
}

export function matchCustomerId(
  maps: CrmContactMatchMaps,
  input: { email?: string | null; phone?: string | null; externalNumber?: string | null },
): string | null {
  const email = input.email?.trim().toLowerCase();
  if (email) {
    const hit = maps.byEmail.get(email);
    if (hit) return hit;
  }
  for (const raw of [input.phone, input.externalNumber]) {
    const key = phoneKey(raw);
    if (key) {
      const hit = maps.byPhone.get(key);
      if (hit) return hit;
    }
  }
  return null;
}
