import type { SupplierId } from '@/lib/commissions/supplier-config';

/** Maps BMW Pay Source values to commission supplier IDs (when we have Supabase data). */
export const PAY_SOURCE_TO_SUPPLIER: Record<string, SupplierId> = {
  PaymentCloud: 'paymentcloud',
  Payjunction: 'payjunction',
  CardConnect_Commissions: 'cardconnect',
  AppDirect: 'appdirect',
  Intelisys: 'intelisys',
  Telarus: 'telarus',
  'Sandler Partners': 'sandlerpartners',
  Nuvei: 'nuvei',
  CheckCommerce: 'checkcommerce',
  Vendara: 'vendara',
  Mango: 'mango',
  Weave: 'weave',
};

export function supplierForPaySource(paySource: string): SupplierId | null {
  return PAY_SOURCE_TO_SUPPLIER[paySource] ?? null;
}

export function paySourceForSupplier(supplier: SupplierId): string {
  const entry = Object.entries(PAY_SOURCE_TO_SUPPLIER).find(([, id]) => id === supplier);
  return entry?.[0] ?? supplier;
}
