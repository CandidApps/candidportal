'use client';

import { AppIcon } from '@/components/AppIcon';
import { SupplierLogo } from '@/components/SupplierLogo';
import {
  CASHBACK_STATUS_HINT,
  CASHBACK_STATUS_LABEL,
  cashbackTotalCount,
  formatCashbackMoney,
  useMemberCashbackSummary,
} from '@/lib/member-cashback-client';
import type { MemberCashbackLedgerStatus } from '@/lib/services/member-cashback';

const STATUS_ORDER: MemberCashbackLedgerStatus[] = ['pending', 'earned', 'paid', 'deposited'];

function formatDate(iso: string | null | undefined): string | null {
  if (!iso) return null;
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return null;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function MemberCashBackButton({
  customerId,
  active,
  onClick,
}: {
  customerId: string | null;
  active: boolean;
  onClick: () => void;
}) {
  const { summary } = useMemberCashbackSummary(customerId);
  const monthly = summary ? summary.pendingMonthly + summary.earnedMonthly : 0;
  return (
    <button
      type="button"
      className={`topbar-cashback${active ? ' is-active' : ''}`}
      onClick={onClick}
      title="Your cash back"
    >
      <AppIcon name="gift" size={14} />
      <span>{monthly > 0 ? `${formatCashbackMoney(monthly)}/mo` : 'Cash back'}</span>
    </button>
  );
}

export default function MemberCashBackView({
  customerId,
  onFindSolutions,
}: {
  customerId: string | null;
  onFindSolutions: () => void;
}) {
  const { summary, loading } = useMemberCashbackSummary(customerId);
  const total = cashbackTotalCount(summary);

  const tiles: { status: MemberCashbackLedgerStatus; amount: number; count: number }[] = summary
    ? [
        { status: 'pending', amount: summary.pendingMonthly, count: summary.pendingCount },
        { status: 'earned', amount: summary.earnedMonthly, count: summary.earnedCount },
        { status: 'paid', amount: summary.paidMonthly, count: summary.paidCount },
        { status: 'deposited', amount: summary.depositedMonthly ?? 0, count: summary.depositedCount ?? 0 },
      ]
    : [];

  const items = (summary?.items ?? [])
    .slice()
    .sort((a, b) => STATUS_ORDER.indexOf(a.status) - STATUS_ORDER.indexOf(b.status));

  return (
    <>
      <div className="greeting">
        <h2>
          Your <span style={{ color: 'var(--red)' }}>cash back</span>
        </h2>
        <p>Money back every month on services you get through Candid.</p>
      </div>

      {loading ? (
        <div className="card">
          <div className="card-body" style={{ fontSize: 13, color: 'var(--gray)' }}>
            Loading your cash back…
          </div>
        </div>
      ) : total === 0 ? (
        <div className="card cashback-empty">
          <div className="card-body">
            <div className="cashback-empty-icon">
              <AppIcon name="gift" size={26} />
            </div>
            <h3>Start earning cash back</h3>
            <ol className="cashback-how">
              <li>
                <strong>Find a provider</strong> with a cash back offer in Find Solutions.
              </li>
              <li>
                <strong>Request a quote</strong>{' '}and accept it when you&apos;re ready.
              </li>
              <li>
                <strong>Get cash back every month</strong> once your new service is live.
              </li>
            </ol>
            <button type="button" className="btn-primary" onClick={onFindSolutions}>
              Browse Find Solutions
            </button>
          </div>
        </div>
      ) : (
        <>
          <div className="cashback-tiles">
            {tiles.map((t) => (
              <div key={t.status} className={`cashback-tile cashback-tile--${t.status}`}>
                <span className="cashback-tile-label">{CASHBACK_STATUS_LABEL[t.status]}</span>
                <strong>{formatCashbackMoney(t.amount)}</strong>
                <span className="cashback-tile-sub">
                  {t.count} {t.count === 1 ? 'service' : 'services'} · per month
                </span>
              </div>
            ))}
          </div>

          <div className="card">
            <div className="card-header">
              <div className="card-title">Cash back by service</div>
            </div>
            <div className="card-body" style={{ padding: 0 }}>
              <ul className="cashback-list">
                {items.map((item) => {
                  const when =
                    item.status === 'deposited'
                      ? formatDate(item.depositedAt)
                      : item.status === 'paid'
                        ? formatDate(item.paidAt)
                        : formatDate(item.createdAt);
                  return (
                    <li key={item.id} className="cashback-row">
                      <SupplierLogo
                        vendor={item.vendorName}
                        logoUrl={item.providerLogoUrl}
                        website={item.providerWebsite}
                        size={36}
                        className="cashback-row-logo"
                      />
                      <div className="cashback-row-main">
                        <strong>{item.vendorName ?? 'Provider'}</strong>
                        <span>
                          {item.cashbackPct != null ? `${item.cashbackPct}% cash back` : 'Cash back'}
                          {item.basisMonthly != null ? ` on ${formatCashbackMoney(item.basisMonthly)}/mo` : ''}
                        </span>
                      </div>
                      <div className="cashback-row-amount">
                        {item.amountMonthly != null ? `${formatCashbackMoney(item.amountMonthly)}/mo` : '—'}
                      </div>
                      <div className="cashback-row-status">
                        <span className={`cashback-pill cashback-pill--${item.status}`}>
                          {CASHBACK_STATUS_LABEL[item.status]}
                        </span>
                        <span className="cashback-row-hint">
                          {CASHBACK_STATUS_HINT[item.status]}
                          {when ? ` · ${when}` : ''}
                        </span>
                      </div>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>

          <p className="cashback-foot">
            Want more?{' '}
            <button type="button" className="dash-inline-link" onClick={onFindSolutions}>
              Find more cash back offers
            </button>
          </p>
        </>
      )}
    </>
  );
}
