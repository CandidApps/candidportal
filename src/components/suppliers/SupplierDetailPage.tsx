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

import { SupplierLogo } from '@/components/SupplierLogo';
import { PartnerEmailPanel } from '@/components/partners/PartnerEmailPanel';
import { CustomerCommunicationsPanel } from '@/components/customers/CustomerCommunicationsPanel';

type DetailTab =
  | 'overview'
  | 'guides'
  | 'documents'
  | 'schedule_a'
  | 'our_rate'
  | 'ucaas_catalog'
  | 'communications';

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
  const supplierName = record.displayName ?? record.name;

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
          <div style={{ flex: 1, minWidth: 200, display: 'flex', alignItems: 'center', gap: 14 }}>
            <SupplierLogo
              vendor={supplierName}
              website={record.website}
              size={48}
              variant="card"
            />
            <div>
              <div className="card-title">{supplierName}</div>
              <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
                Solution provider / vendor
                {record.providerCategory ? ` · ${providerCategoryLabel(record.providerCategory)}` : ''}
                {record.fromBmwOnly ? ' · from BMW master (save to persist)' : ''}
              </div>
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
              className={`comm-tab${tab === 'communications' ? ' active' : ''}`}
              onClick={() => setTab('communications')}
            >
              Communications
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
              providerName={supplierName}
              fromBmwOnly={record.fromBmwOnly}
            />
          ) : tab === 'schedule_a' ? (
            <SupplierScheduleATab provider={record} />
          ) : tab === 'our_rate' ? (
            <SupplierOurRateTab provider={record} />
          ) : tab === 'ucaas_catalog' ? (
            <SupplierUcaasCatalogTab provider={record} />
          ) : tab === 'communications' ? (
            <div style={{ display: 'grid', gap: 20 }}>
              <section>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-dark)' }}>Email</div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
                    Conversation threads with this supplier&apos;s contacts
                  </div>
                </div>
                <div
                  style={{
                    border: '1px solid var(--gray-border)',
                    borderRadius: 10,
                    padding: 16,
                    background: 'var(--white)',
                  }}
                >
                  <PartnerEmailPanel
                    entityName={supplierName}
                    contactEmail={primaryContact?.email}
                    contactName={primaryContact?.name}
                    extraContacts={extraMailContacts}
                  />
                </div>
              </section>

              <section>
                <div style={{ marginBottom: 10 }}>
                  <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--gray-dark)' }}>
                    Calls & meetings
                  </div>
                  <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 2 }}>
                    Dialpad calls and calendar meetings matched to this supplier&apos;s contacts
                  </div>
                </div>
                <div
                  style={{
                    border: '1px solid var(--gray-border)',
                    borderRadius: 10,
                    padding: 16,
                    background: 'var(--white)',
                  }}
                >
                  <CustomerCommunicationsPanel
                    customerName={supplierName}
                    entityLabel="supplier"
                    contacts={record.contacts.map((c) => ({
                      name: c.name,
                      email: c.email,
                      phone: c.phone,
                    }))}
                  />
                </div>
              </section>
            </div>
          ) : (
            <RegistryDocumentsSection
              embedded
              entityType="solution_provider"
              entityKey={record.id}
              entityLabel={supplierName}
            />
          )}
        </div>
      </div>
    </div>
  );
}
