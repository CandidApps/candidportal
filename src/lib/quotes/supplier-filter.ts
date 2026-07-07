import { QUOTE_SERVICE_TYPES } from '@/lib/quote-flow-config';
import type { SolutionCategoryId } from '@/lib/solutions/catalog';
import { providerCategoryToSolution } from '@/lib/solutions/catalog';
import type { QuoteSupplierOption } from '@/lib/quotes/types';
import {
  mapDbToRecord,
  type DbSolutionProvider,
  type DbSolutionProviderContact,
  type DbSolutionProviderSolution,
  type DbSolutionProviderSolutionRate,
} from '@/lib/solution-providers-db';

export function quoteServiceCategoryId(serviceTypeId: string | null | undefined): SolutionCategoryId | null {
  if (!serviceTypeId) return null;
  return QUOTE_SERVICE_TYPES.find((t) => t.id === serviceTypeId)?.categoryId ?? null;
}

function providerMatchesCategory(
  provider: DbSolutionProvider,
  targetCategory: SolutionCategoryId,
): boolean {
  const mapped = providerCategoryToSolution(provider.provider_category);
  if (mapped === targetCategory) return true;
  if (targetCategory === 'ucaas' && provider.provider_category === 'ucaas') return true;
  if (targetCategory === 'connectivity' && provider.provider_category === 'internet') return true;
  if (targetCategory === 'payments' && ['merchant_services', 'payments_ach'].includes(provider.provider_category ?? '')) {
    return true;
  }
  if (targetCategory === 'security' && provider.provider_category === 'security') return true;
  if (targetCategory === 'cloud' && provider.provider_category === 'cloud_saas') return true;
  return false;
}

export function filterSuppliersForQuoteCategory(
  providers: DbSolutionProvider[],
  contacts: DbSolutionProviderContact[],
  solutions: DbSolutionProviderSolution[],
  rates: DbSolutionProviderSolutionRate[],
  serviceTypeId: string | null | undefined,
): QuoteSupplierOption[] {
  const targetCategory = quoteServiceCategoryId(serviceTypeId);
  const filteredProviders = targetCategory
    ? providers.filter((p) => providerMatchesCategory(p, targetCategory))
    : providers;

  const options: QuoteSupplierOption[] = [];

  for (const provider of filteredProviders) {
    const record = mapDbToRecord(provider, contacts, solutions, rates);
    const providerContacts = record.contacts.filter((c) => c.email?.trim());
    if (!providerContacts.length) continue;

    const sorted = [...providerContacts].sort((a, b) => {
      if (a.clientFacing !== b.clientFacing) return a.clientFacing ? -1 : 1;
      if (a.isPrimary !== b.isPrimary) return a.isPrimary ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

    for (const contact of sorted) {
      const dbContactId = Number.parseInt(contact.id.replace(/^c-/, ''), 10);
      if (!Number.isFinite(dbContactId)) continue;
      options.push({
        providerId: provider.id,
        providerSlug: provider.slug,
        providerName: provider.display_name ?? provider.name,
        contactId: dbContactId,
        contactName: contact.name,
        contactEmail: contact.email.trim(),
        contactRole: contact.role,
        clientFacing: contact.clientFacing ?? false,
        categoryId: provider.provider_category,
      });
    }
  }

  return options.sort((a, b) => a.providerName.localeCompare(b.providerName));
}
