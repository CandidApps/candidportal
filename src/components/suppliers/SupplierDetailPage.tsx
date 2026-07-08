'use client';

import { useEffect, useState } from 'react';
import type { PartnerSupplierRecord } from '@/lib/services/bank-deposits';
import type { SolutionProviderRecord } from '@/lib/solution-providers';
import { SupplierDetailPanel } from '@/components/suppliers/SupplierDetailPanel';
import { SupplierGuidesTab } from '@/components/suppliers/SupplierGuidesTab';
import { SupplierScheduleATab } from '@/components/suppliers/SupplierScheduleATab';
import { SupplierOurRateTab } from '@/components/suppliers/SupplierOurRateTab';
import { SupplierUcaasCatalogTab } from '@/components/suppliers/SupplierUcaasCatalogTab';
import { RegistryDocumentsSection } from '@/components/shared/RegistryDocumentsSection';
import { isMerchantServicesCategory, providerCategoryLabel, showOurRateTab, showUcaasCatalogTab } from '@/lib/provider-categories';

import { PartnerEmailPanel } from '@/components/partners/PartnerEmailPanel';

type DetailTab = 'overview' | 'guides' | 'documents' | 'schedule_a' | 'our_rate' | 'ucaas_catalog' | 'email';

export function SupplierDetailPage({
  provider,
  partners,
  onBack,
  onUpdated,
}: {
  provider: SolutionProviderRecord;
  partners: PartnerSupplierRecord[];
  onBack: () => void;
  onUpdated: (p: SolutionProviderRecord) => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [record, setRecord] = useState(provider);

  useEffect(() => {
    setRecord(provider);
    setTab('overview');
  }, [provider]);

  const primaryContact =
    record.contacts.find((contact) => contact.isPrimary && contact.email?.trim()) ??
    record.contacts.find((contact) => contact.email?.trim());
  const extraMailContacts = record.contacts
    .filter((contact) => contact.email?.trim())
    .map((contact) => ({
      name: contact.name,
      email: contact.email,
      role: contact.role,
    }));

  return (
    <div>
      <button
        type="button"
        className="btn-secondary"
        style={{ marginBottom: 16, fontSize: 12 }}
        onClick={onBack}
      >
        ← Back to partners
      </button>

      <div className="card">
        <div className="card-header" style={{ alignItems: 'flex-end', flexWrap: 'wrap', gap: 12 }}>
          <div style={{ flex: 1, minWidth: 200 }}>
            <div className="card-title">{record.displayName ?? record.name}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              Solution provider / vendor
              {record.providerCategory ? ` · ${providerCategoryLabel(record.providerCategory)}` : ''}
              {record.fromBmwOnly ? ' · from BMW master (save to persist)' : ''}
            </div>
          </div>
          <div className="comm-tabs" style={{ marginBottom: 0 }}>
            <button
              type="button"
              className={`comm-tab${tab === 'overview' ? ' active' : ''}`}
              onClick={() => setTab('overview')}
            >
              Overview
            </button>
            <button
              type="button"
              className={`comm-tab${tab === 'guides' ? ' active' : ''}`}
              onClick={() => setTab('guides')}
            >
              Guides & guidance
            </button>
            <button
              type="button"
              className={`comm-tab${tab === 'documents' ? ' active' : ''}`}
              onClick={() => setTab('documents')}
            >
              Documents
            </button>
            {isMerchantServicesCategory(record.providerCategory) && (
              <button
                type="button"
                className={`comm-tab${tab === 'schedule_a' ? ' active' : ''}`}
                onClick={() => setTab('schedule_a')}
              >
                Schedule A
              </button>
            )}
            {showOurRateTab(record) && (
              <button
                type="button"
                className={`comm-tab${tab === 'our_rate' ? ' active' : ''}`}
                onClick={() => setTab('our_rate')}
              >
                Our rate
              </button>
            )}
            {showUcaasCatalogTab(record) && (
              <button
                type="button"
                className={`comm-tab${tab === 'ucaas_catalog' ? ' active' : ''}`}
                onClick={() => setTab('ucaas_catalog')}
              >
                UCaaS catalog
              </button>
            )}
            <button
              type="button"
              className={`comm-tab${tab === 'email' ? ' active' : ''}`}
              onClick={() => setTab('email')}
            >
              Email
            </button>
          </div>
        </div>

        <div className="card-body">
          {tab === 'overview' ? (
            <SupplierDetailPanel
              layout="page"
              provider={record}
              partners={partners}
              onUpdated={(next) => {
                setRecord(next);
                onUpdated(next);
              }}
            />
          ) : tab === 'guides' ? (
            <SupplierGuidesTab
              providerId={record.id}
              providerDbId={record.dbId}
              providerName={record.displayName ?? record.name}
              fromBmwOnly={record.fromBmwOnly}
            />
          ) : tab === 'schedule_a' ? (
            <SupplierScheduleATab provider={record} />
          ) : tab === 'our_rate' ? (
            <SupplierOurRateTab provider={record} />
          ) : tab === 'ucaas_catalog' ? (
            <SupplierUcaasCatalogTab provider={record} />
          ) : tab === 'email' ? (
            <PartnerEmailPanel
              entityName={record.displayName ?? record.name}
              contactEmail={primaryContact?.email}
              contactName={primaryContact?.name}
              extraContacts={extraMailContacts}
            />
          ) : (
            <RegistryDocumentsSection
              embedded
              entityType="solution_provider"
              entityKey={record.id}
              entityLabel={record.displayName ?? record.name}
            />
          )}
        </div>
      </div>
    </div>
  );
}
