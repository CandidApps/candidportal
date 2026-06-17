'use client';

import type { UnifiedAdminTicket } from '@/lib/admin-tickets';
import { TICKET_KIND_LABEL } from '@/lib/admin-tickets';
import {
  DEMO_AGENTS,
  DEMO_COMMISSION_TREND,
  DEMO_NEW_CUSTOMERS,
  formatAdminCurrency,
  sumAgentCommissions,
} from '@/lib/demo/admin-portfolio';

type AdminDashboardViewProps = {
  actionTickets: UnifiedAdminTicket[];
  onViewTickets: () => void;
  onViewAgents: () => void;
  onViewCustomers: () => void;
  onResolveServiceTicket?: (ticketId: string) => void;
  onResolveAnalysisTicket?: (ticketId: string) => void;
  onDismissStatementReview?: (sourceId: string) => void;
};

export function AdminDashboardView({
  actionTickets,
  onViewTickets,
  onViewAgents,
  onViewCustomers,
  onResolveServiceTicket,
  onResolveAnalysisTicket,
  onDismissStatementReview,
}: AdminDashboardViewProps) {
  const commissionsLastMonth = sumAgentCommissions(DEMO_AGENTS, 'commissionsLastMonth');
  const commissionsYtd = sumAgentCommissions(DEMO_AGENTS, 'commissionsYtd');
  const newCustomersMonth = DEMO_NEW_CUSTOMERS.length;
  const totalCustomers = DEMO_AGENTS.reduce((n, a) => n + a.customerCount, 0);
  const topAgents = [...DEMO_AGENTS]
    .filter((a) => a.commissionsLastMonth > 0)
    .sort((a, b) => b.commissionsLastMonth - a.commissionsLastMonth)
    .slice(0, 5);
  const trendMax = Math.max(...DEMO_COMMISSION_TREND.map((m) => m.amount));
  const openActions = actionTickets.filter((t) => t.status !== 'resolved').slice(0, 6);

  return (
    <>
      <div className="greeting">
        <h2>Portfolio overview</h2>
        <p>
          {totalCustomers} active customers across {DEMO_AGENTS.length} agents — commissions and
          operational queue at a glance.
        </p>
      </div>

      <div className="kpi-strip">
        <div className="kpi green kpi-clickable" onClick={onViewAgents} role="button" tabIndex={0}>
          <div className="kpi-label">Commissions (last month)</div>
          <div className="kpi-value">{formatAdminCurrency(commissionsLastMonth)}</div>
          <div className="kpi-sub">Agent residual volume</div>
        </div>
        <div className="kpi blue kpi-clickable" onClick={onViewAgents} role="button" tabIndex={0}>
          <div className="kpi-label">Commissions (YTD)</div>
          <div className="kpi-value">{formatAdminCurrency(commissionsYtd)}</div>
          <div className="kpi-sub">Jan – Apr 2026</div>
        </div>
        <div className="kpi amber kpi-clickable" onClick={onViewCustomers} role="button" tabIndex={0}>
          <div className="kpi-label">New customers</div>
          <div className="kpi-value">{newCustomersMonth}</div>
          <div className="kpi-sub">Signed this month</div>
        </div>
        <div className="kpi red kpi-clickable" onClick={onViewTickets} role="button" tabIndex={0}>
          <div className="kpi-label">Open actions</div>
          <div className="kpi-value">{actionTickets.filter((t) => t.status !== 'resolved').length}</div>
          <div className="kpi-sub">Needs team action</div>
        </div>
      </div>

      <div className="card admin-trend-card">
        <div className="card-header">
          <div className="card-title">Commission trend</div>
          <div className="card-action" onClick={onViewAgents}>
            View agents →
          </div>
        </div>
        <div className="card-body">
          <div className="admin-trend-chart">
            {DEMO_COMMISSION_TREND.map((m) => (
              <div key={m.month} className="admin-trend-col">
                <div
                  className="admin-trend-bar"
                  style={{ height: `${Math.round((m.amount / trendMax) * 100)}%` }}
                  title={formatAdminCurrency(m.amount)}
                />
                <div className="admin-trend-month">{m.month}</div>
              </div>
            ))}
          </div>
          <div className="admin-trend-foot">
            <span>Apr run rate</span>
            <strong>{formatAdminCurrency(DEMO_COMMISSION_TREND[DEMO_COMMISSION_TREND.length - 1]!.amount)}</strong>
            <span className="admin-trend-delta">+3.3% vs Mar</span>
          </div>
        </div>
      </div>

      <div className="dash-grid wide">
        <div className="card">
          <div className="card-header">
            <div className="card-title">Top agents (last month)</div>
            <div className="card-action" onClick={onViewAgents}>
              All agents →
            </div>
          </div>
          <div className="card-body" style={{ padding: 0 }}>
            <table className="admin-mini-table">
              <thead>
                <tr>
                  <th>Agent</th>
                  <th>Customers</th>
                  <th>Deals (QTD)</th>
                  <th style={{ textAlign: 'right' }}>Commission</th>
                </tr>
              </thead>
              <tbody>
                {topAgents.map((a, i) => (
                  <tr key={a.id}>
                    <td>
                      <span className="admin-rank">{i + 1}</span>
                      {a.company}
                    </td>
                    <td>{a.customerCount}</td>
                    <td>{a.dealsClosedQtd}</td>
                    <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                      {formatAdminCurrency(a.commissionsLastMonth)}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <div className="card">
          <div className="card-header">
            <div className="card-title">Alerts &amp; actions</div>
            <div className="card-action" onClick={onViewTickets}>
              Action Center →
            </div>
          </div>
          <div className="card-body">
            {openActions.length === 0 ? (
              <p style={{ fontSize: 13, color: 'var(--gray)' }}>No open items — you&apos;re caught up.</p>
            ) : (
              openActions.map((t) => (
                <div key={t.id} className="alert-item">
                  <div className={`alert-dot ${t.kind === 'statement' ? 'amber' : t.kind === 'service' ? 'red' : 'blue'}`} />
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="alert-text">
                      <span className={`admin-ticket-pill admin-ticket-pill--${t.kind}`}>
                        {TICKET_KIND_LABEL[t.kind]}
                      </span>{' '}
                      <strong>{t.customerName}</strong> — {t.title}
                    </div>
                    <div className="alert-time">{t.detail}</div>
                    <div className="alert-time">{t.timeLabel}</div>
                  </div>
                  <div className="admin-alert-actions">
                    {t.kind === 'service' && onResolveServiceTicket && (
                      <button type="button" className="admin-ticket-btn" onClick={() => onResolveServiceTicket(t.sourceId)}>
                        Resolve
                      </button>
                    )}
                    {t.kind === 'analysis' && onResolveAnalysisTicket && (
                      <button type="button" className="admin-ticket-btn" onClick={() => onResolveAnalysisTicket(t.sourceId)}>
                        Resolve
                      </button>
                    )}
                    {t.kind === 'statement' && onDismissStatementReview && (
                      <button type="button" className="admin-ticket-btn primary" onClick={() => onDismissStatementReview(t.sourceId)}>
                        Review
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">New customers this month</div>
          <div className="card-action" onClick={onViewCustomers}>
            View customers →
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table className="admin-mini-table">
            <thead>
              <tr>
                <th>Company</th>
                <th>Agent</th>
                <th>Signed</th>
                <th style={{ textAlign: 'right' }}>MRC</th>
              </tr>
            </thead>
            <tbody>
              {DEMO_NEW_CUSTOMERS.map((c) => (
                <tr key={c.id}>
                  <td>{c.company}</td>
                  <td>{c.agent}</td>
                  <td>{new Date(c.signedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}</td>
                  <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontWeight: 600 }}>
                    {formatAdminCurrency(c.mrc)}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card" style={{ marginTop: 20 }}>
        <div className="card-header">
          <div className="card-title">Agent deal volume (portfolio MRC)</div>
        </div>
        <div className="card-body">
          <div className="savings-bars">
            {[...DEMO_AGENTS]
              .sort((a, b) => b.customerCount - a.customerCount)
              .map((a) => {
                const max = Math.max(...DEMO_AGENTS.map((x) => x.customerCount));
                const pct = max ? Math.round((a.customerCount / max) * 100) : 0;
                return (
                  <div key={a.id} className="sbar-row">
                    <div className="sbar-label" title={a.company}>
                      {a.company.length > 18 ? `${a.company.slice(0, 16)}…` : a.company}
                    </div>
                    <div className="sbar-track">
                      <div className="sbar-fill" style={{ width: `${pct}%` }} />
                    </div>
                    <div className="sbar-val">{a.customerCount}</div>
                  </div>
                );
              })}
          </div>
        </div>
      </div>
    </>
  );
}
