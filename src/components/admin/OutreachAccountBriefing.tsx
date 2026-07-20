'use client';

import { useMemo } from 'react';
import type { Customer } from '@/components/CustomersView';
import { CustomerRelationshipPulse } from '@/components/customers/CustomerRelationshipPulse';
import { CustomerActionsBanner } from '@/components/customers/CustomerActionsBanner';
import { mergeCustomerActions, getResolvedActionsForCustomer } from '@/lib/customer-actions-store';
import type { CandidContractRecord } from '@/lib/customer-records';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';

type Props = {
  customer: Customer | null;
  companyFallback: string;
  contracts?: CandidContractRecord[];
};

function formatMrc(value?: number | null): string | null {
  if (value == null || Number.isNaN(value) || value <= 0) return null;
  return `$${Math.round(value).toLocaleString('en-US')}/mo`;
}

export function OutreachAccountBriefing({
  customer,
  companyFallback,
  contracts = [],
}: Props) {
  const primary =
    customer?.contacts.find((c) => c.isPrimary) ?? customer?.contacts[0] ?? null;
  const openActions = useMemo(
    () => mergeCustomerActions(customer?.id ?? '', customer?.portal?.actions ?? []),
    [customer?.id, customer?.portal?.actions],
  );
  const resolvedActions = useMemo(
    () => (customer ? getResolvedActionsForCustomer(customer.id) : []),
    [customer],
  );

  const activeServices = useMemo(() => {
    const fromContracts = contracts
      .filter((c) => {
        const status = String(c.dealStatus ?? '').toLowerCase();
        return status !== 'cancelled' && status !== 'lost' && status !== 'churned';
      })
      .slice(0, 8)
      .map((c) => ({
        key: c.id,
        label:
          [c.solution, c.service, c.product].filter(Boolean).join(' · ') ||
          c.vendor ||
          'Service',
        meta: [c.vendor, formatMrc(c.mrr ?? c.mrc ?? c.monthly)].filter(Boolean).join(' · '),
      }));
    if (fromContracts.length > 0) return fromContracts;

    const nonCandid = customer?.portal?.nonCandidServices ?? [];
    return nonCandid.slice(0, 8).map((svc, i) => ({
      key: `nc-${i}`,
      label: `${svc.provider}${svc.product ? ` — ${svc.product}` : ''}`,
      meta: formatMrc(svc.mrc) ?? 'Non-Candid',
    }));
  }, [contracts, customer?.portal?.nonCandidServices]);

  const keyContacts = (customer?.contacts ?? []).slice(0, 5);

  if (!customer) {
    return (
      <div className="outreach-brief-section">
        <h4>Account</h4>
        <p className="outreach-brief-empty">
          {companyFallback} — full CRM record not loaded. Use View more for the complete account.
        </p>
      </div>
    );
  }

  return (
    <>
      <div className="outreach-brief-section">
        <h4>Key information</h4>
        <dl className="outreach-brief-kv">
          <div>
            <dt>Industry</dt>
            <dd>{customer.industry || '—'}</dd>
          </div>
          <div>
            <dt>Sales agent</dt>
            <dd>{customer.agent || '—'}</dd>
          </div>
          <div>
            <dt>Member since</dt>
            <dd>{customer.since || '—'}</dd>
          </div>
          <div>
            <dt>Candid MRC</dt>
            <dd>
              {formatMrc(customer.portal?.totalCandidMrc) ??
                (customer.spend > 0 ? formatMrc(customer.spend) : '—')}
            </dd>
          </div>
          <div>
            <dt>Primary contact</dt>
            <dd>
              {primary
                ? `${primary.name}${primary.role ? ` · ${primary.role}` : ''}`
                : '—'}
            </dd>
          </div>
          <div>
            <dt>Website</dt>
            <dd>
              {customer.website ? (
                <a
                  href={
                    /^https?:\/\//i.test(customer.website)
                      ? customer.website
                      : `https://${customer.website}`
                  }
                  target="_blank"
                  rel="noreferrer"
                >
                  {customer.website.replace(/^https?:\/\//, '')}
                </a>
              ) : (
                '—'
              )}
            </dd>
          </div>
        </dl>
      </div>

      <div className="outreach-brief-section">
        <CustomerRelationshipPulse
          customerId={customer.id}
          customerName={customer.company}
          contactEmail={primary?.email || undefined}
        />
      </div>

      <div className="outreach-brief-section">
        <h4>Active services</h4>
        {activeServices.length === 0 ? (
          <p className="outreach-brief-empty">No active services on file.</p>
        ) : (
          activeServices.map((svc) => (
            <div key={svc.key} className="outreach-brief-service">
              <strong>{svc.label}</strong>
              <span>{svc.meta}</span>
            </div>
          ))
        )}
      </div>

      {(customer.description || customer.portal?.salesPitch?.opening) && (
        <div className="outreach-brief-section">
          <h4>Description / talking points</h4>
          {customer.description ? (
            <p className="outreach-brief-desc">{customer.description}</p>
          ) : null}
          {customer.portal?.salesPitch?.opening ? (
            <p className="outreach-brief-desc" style={{ marginTop: customer.description ? 10 : 0 }}>
              {customer.portal.salesPitch.opening}
            </p>
          ) : null}
        </div>
      )}

      <div className="outreach-brief-section">
        <h4>Action center</h4>
        {openActions.length === 0 &&
        !customer.portal?.salesPitch?.opening &&
        resolvedActions.length === 0 ? (
          <p className="outreach-brief-empty">No open actions for this account.</p>
        ) : (
          <CustomerActionsBanner
            actions={openActions}
            resolvedActions={resolvedActions}
            salesPitch={customer.portal?.salesPitch?.opening}
            customerId={customer.id}
            companyName={customer.company}
            portal={customer.portal}
          />
        )}
      </div>

      <div className="outreach-brief-section">
        <h4>Key contacts</h4>
        {keyContacts.length === 0 ? (
          <p className="outreach-brief-empty">No contacts on file.</p>
        ) : (
          keyContacts.map((ct) => (
            <div key={ct.id} className="outreach-brief-contact">
              <strong>
                {ct.name}
                {ct.isPrimary ? ' · Primary' : ''}
              </strong>
              <span style={{ color: 'var(--gray)', fontSize: 12 }}>{ct.role || '—'}</span>
              <span>
                {ct.phone ? (
                  <a href={`tel:${ct.phone.replace(/[^\d+]/g, '')}`}>{ct.phone}</a>
                ) : (
                  'No phone'
                )}
                {' · '}
                {ct.email ? (
                  <button
                    type="button"
                    className="outreach-brief-email-btn"
                    onClick={() => {
                      const company = customer.company || companyFallback;
                      launchAdminZohoCompose({
                        to: ct.email,
                        subject: `Candid — following up with ${company}`,
                        body: `Hi ${ct.name.split(' ')[0] || 'there'},\n\n`,
                        contextLabel: `Outreach · ${company}`,
                      });
                    }}
                  >
                    {ct.email}
                  </button>
                ) : (
                  'No email'
                )}
              </span>
            </div>
          ))
        )}
      </div>
    </>
  );
}
