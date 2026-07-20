'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  commissionSourceKey,
  dealsForPaySource,
  type CommissionPartnerRow,
} from '@/lib/commission-partners';
import type { PartnerSupplierRecord } from '@/lib/services/bank-deposits';
import { providerCategoryLabel } from '@/lib/provider-categories';
import { RegistryDocumentsSection } from '@/components/shared/RegistryDocumentsSection';
import { PhoneLink } from '@/components/shared/PhoneLink';
import { PartnerEmailPanel } from '@/components/partners/PartnerEmailPanel';
import { EditCommissionPartnerModal } from '@/components/suppliers/EditCommissionPartnerModal';

type DetailTab = 'overview' | 'customers' | 'documents' | 'email';

export function CommissionPartnerDetailPage({
  row,
  onBack,
  onUpdated,
}: {
  row: CommissionPartnerRow;
  partners: PartnerSupplierRecord[];
  onBack: () => void;
  onUpdated: () => void;
}) {
  const [tab, setTab] = useState<DetailTab>('overview');
  const [editOpen, setEditOpen] = useState(false);
  const [record, setRecord] = useState(row);
  const customers = useMemo(() => dealsForPaySource(record.paySource), [record.paySource]);
  const entityKey = commissionSourceKey(record.paySource);

  useEffect(() => {
    setRecord(row);
    setTab('overview');
  }, [row]);

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
            <div className="card-title">{record.paySource}</div>
            <div style={{ fontSize: 12, color: 'var(--gray)', marginTop: 4 }}>
              Commission partner
              {record.partner?.provider_category
                ? ` · ${providerCategoryLabel(record.partner.provider_category)}`
                : ''}
              {record.hasResidualImport ? ' · residual import' : ' · pay source only'}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="btn-secondary"
              style={{ fontSize: 12 }}
              onClick={() => setEditOpen(true)}
            >
              Edit
            </button>
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
                className={`comm-tab${tab === 'customers' ? ' active' : ''}`}
                onClick={() => setTab('customers')}
              >
                Customers ({customers.length})
              </button>
              <button
                type="button"
                className={`comm-tab${tab === 'documents' ? ' active' : ''}`}
                onClick={() => setTab('documents')}
              >
                Documents
              </button>
              <button
                type="button"
                className={`comm-tab${tab === 'email' ? ' active' : ''}`}
                onClick={() => setTab('email')}
              >
                Email
              </button>
            </div>
          </div>
        </div>

        <div className="card-body">
          {tab === 'overview' ? (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 16 }}>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
                  Bank ORIG name
                </div>
                <div style={{ fontSize: 14 }}>{record.bankOrigCoName ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
                  Bank ORIG ID
                </div>
                <div style={{ fontSize: 14, fontFamily: 'var(--font-mono)' }}>{record.bankOrigId ?? '—'}</div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
                  Commission website
                </div>
                <div style={{ fontSize: 14 }}>
                  {record.partner?.website ? (
                    <a href={record.partner.website.startsWith('http') ? record.partner.website : `https://${record.partner.website}`} target="_blank" rel="noopener noreferrer">
                      {record.partner.website}
                    </a>
                  ) : (
                    '—'
                  )}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
                  Candid commission rate
                </div>
                <div style={{ fontSize: 14 }}>
                  {record.commissionRate != null ? `${record.commissionRate}%` : '—'}
                </div>
              </div>
              <div>
                <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
                  Contact
                </div>
                <div style={{ fontSize: 14 }}>
                  {record.contactName && <div>{record.contactName}</div>}
                  {record.contactEmail && <div style={{ color: 'var(--gray)' }}>{record.contactEmail}</div>}
                  {record.contactPhone && <div style={{ color: 'var(--gray)' }}><PhoneLink phone={record.contactPhone} /></div>}
                  {!record.contactName && !record.contactEmail && !record.contactPhone && '—'}
                </div>
              </div>
              {record.partner?.notes && (
                <div style={{ gridColumn: '1 / -1' }}>
                  <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)', marginBottom: 6 }}>
                    Notes
                  </div>
                  <div style={{ fontSize: 14, whiteSpace: 'pre-wrap' }}>{record.partner.notes}</div>
                </div>
              )}
            </div>
          ) : tab === 'customers' ? (
            customers.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No BMW deals with this pay source.</p>
            ) : (
              <table className="admin-mini-table">
                <thead>
                  <tr>
                    <th>Merchant</th>
                    <th>Provider</th>
                    <th>Solution</th>
                    <th>Agent</th>
                    <th>Deal UID</th>
                    <th>Status</th>
                  </tr>
                </thead>
                <tbody>
                  {customers.map((deal) => (
                    <tr key={deal.rowNum}>
                      <td>{deal.merchant}</td>
                      <td style={{ fontSize: 12 }}>{deal.provider || '—'}</td>
                      <td style={{ fontSize: 12 }}>{deal.product || deal.serviceDescription || '—'}</td>
                      <td style={{ fontSize: 12 }}>{deal.agentCommId || '—'}</td>
                      <td style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>{deal.dealUid}</td>
                      <td style={{ fontSize: 11, fontWeight: 600, color: deal.activeDeal ? 'var(--green)' : 'var(--gray)' }}>
                        {deal.activeDeal ? 'Active' : 'Inactive'}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )
          ) : tab === 'documents' ? (
            <RegistryDocumentsSection
              embedded
              entityType="commission_partner"
              entityKey={entityKey}
              entityLabel={record.paySource}
            />
          ) : (
            <PartnerEmailPanel
              entityName={record.paySource}
              contactEmail={record.contactEmail}
              contactName={record.contactName}
            />
          )}
        </div>
      </div>

      {editOpen && (
        <EditCommissionPartnerModal
          row={record}
          onClose={() => setEditOpen(false)}
          onSave={() => {
            setEditOpen(false);
            onUpdated();
          }}
        />
      )}
    </div>
  );
}

export default CommissionPartnerDetailPage;
