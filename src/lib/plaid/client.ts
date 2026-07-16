import {
  Configuration,
  CountryCode,
  PlaidApi,
  PlaidEnvironments,
  Products,
} from 'plaid';

export function plaidEnvName(): 'sandbox' | 'development' | 'production' {
  const raw = (process.env.PLAID_ENV ?? process.env.NEXT_PUBLIC_PLAID_ENV ?? 'sandbox')
    .trim()
    .toLowerCase();
  if (raw === 'production' || raw === 'development' || raw === 'sandbox') return raw;
  return 'sandbox';
}

export function plaidConfigured(): boolean {
  return Boolean(process.env.PLAID_CLIENT_ID?.trim() && process.env.PLAID_SECRET?.trim());
}

let cached: PlaidApi | null = null;

export function getPlaidClient(): PlaidApi {
  if (cached) return cached;
  const clientId = process.env.PLAID_CLIENT_ID?.trim();
  const secret = process.env.PLAID_SECRET?.trim();
  if (!clientId || !secret) {
    throw new Error('Plaid is not configured. Set PLAID_CLIENT_ID and PLAID_SECRET.');
  }
  const env = plaidEnvName();
  cached = new PlaidApi(
    new Configuration({
      basePath: PlaidEnvironments[env],
      baseOptions: {
        headers: {
          'PLAID-CLIENT-ID': clientId,
          'PLAID-SECRET': secret,
        },
      },
    }),
  );
  return cached;
}

export const PLAID_PRODUCTS = [Products.Transactions];
export const PLAID_COUNTRY_CODES = [CountryCode.Us];
