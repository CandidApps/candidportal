'use client';

import { useEffect, useMemo, useState } from 'react';
import type { CustomerAction, CustomerPortalData } from '@/lib/portal-import/merge';
import type { ResolvedCustomerAction } from '@/lib/customer-actions-store';
import { outcomeLabel } from '@/lib/customer-actions-store';
import { BRAND } from '@/lib/ui/brand-tokens';
import { pickHeroRecommendation } from '@/lib/ai-recommendations';
import {
  getRecommendationFeedback,
  setRecommendationFeedback,
  submitNegativeFeedbackToTraining,
  type RecommendationFeedbackVote,
} from '@/lib/customer-recommendation-feedback';
import type { ContractSubmitActionRow } from '@/lib/services/contract-submit-actions';
import { CONTRACT_DEAL_STAGE_LABEL } from '@/lib/services/contract-submit-actions';
import { ContractDealWorkbench } from '@/components/admin/ContractDealWorkbench';

const SEVERITY_STYLE = {
  urgent: { border: '#FECACA', bg: '#FEF2F2', label: 'Urgent', color: BRAND.red },
  soon: { border: '#FED7AA', bg: '#FFFBEB', label: 'Upcoming', color: BRAND.amber },
  info: { border: '#BFDBFE', bg: '#EFF6FF', label: 'Opportunity', color: BRAND.blue },
} as const;

type ActionTab = 'pipeline' | 'needs-attention' | 'recommended' | 'talking-points' | 'closed';

type Props = {
  actions: CustomerAction[];
  resolvedActions?: ResolvedCustomerAction[];
  contractActions?: ContractSubmitActionRow[];
  salesPitch?: string;
  customerId?: string;
  companyName?: string;
  portal?: CustomerPortalData | null;
  onResolveAction?: (action: CustomerAction) => void;
  onAddCustomAction?: () => void;
  onOpenRecommendationsHub?: () => void;
  onContractPipelineUpdated?: () => void;
};

function RecommendationFeedback({
  customerId,
  companyName,
  action,
}: {
  customerId: string;
  companyName: string;
  action: CustomerAction;
}) {
  const existing = getRecommendationFeedback(customerId, action.id);
  const [vote, setVote] = useState<RecommendationFeedbackVote | null>(existing?.vote ?? null);

  const apply = async (next: RecommendationFeedbackVote) => {
    setVote(next);
    setRecommendationFeedback({
      customerId,
      actionId: action.id,
      actionTitle: action.title,
      vote: next,
    });
    if (next === 'down') {
      await submitNegativeFeedbackToTraining({
        customerId,
        companyName,
        actionTitle: action.title,
      });
    }
  };

  return (
    <span style={{ display: 'inline-flex', gap: 4 }}>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void apply('up');
        }}
        style={{
          border: `1px solid ${vote === 'up' ? BRAND.green : BRAND.grayBorder}`,
          background: vote === 'up' ? 'rgba(13,148,136,0.12)' : BRAND.white,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        👍
      </button>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          void apply('down');
        }}
        style={{
          border: `1px solid ${vote === 'down' ? BRAND.red : BRAND.grayBorder}`,
          background: vote === 'down' ? 'rgba(225,29,72,0.08)' : BRAND.white,
          borderRadius: 6,
          padding: '2px 8px',
          fontSize: 11,
          cursor: 'pointer',
        }}
      >
        👎
      </button>
    </span>
  );
}

export function CustomerActionsBanner({
  actions,
  resolvedActions = [],
  contractActions = [],
  salesPitch,
  customerId,
  companyName,
  portal,
  onResolveAction,
  onAddCustomAction,
  onOpenRecommendationsHub,
  onContractPipelineUpdated,
}: Props) {
  const needsAttention = useMemo(
    () => actions.filter((a) => a.severity === 'urgent'),
    [actions],
  );
  const recommended = useMemo(
    () => actions.filter((a) => a.severity !== 'urgent'),
    [actions],
  );
  const openPipeline = useMemo(
    () => contractActions.filter((a) => a.status !== 'converted'),
    [contractActions],
  );
  const hero = useMemo(
    () => (actions.length ? pickHeroRecommendation(actions, portal) : null),
    [actions, portal],
  );

  const [activeTab, setActiveTab] = useState<ActionTab>(
    openPipeline.length > 0 ? 'pipeline' : 'needs-attention',
  );
  const [activeDeal, setActiveDeal] = useState<ContractSubmitActionRow | null>(null);

  useEffect(() => {
    if (openPipeline.length > 0 && actions.length === 0 && !salesPitch) {
      setActiveTab('pipeline');
    }
  }, [openPipeline.length, actions.length, salesPitch]);

  if (
    actions.length === 0 &&
    !salesPitch &&
    resolvedActions.length === 0 &&
    contractActions.length === 0
  ) {
    return null;
  }

  const tabs: { id: ActionTab; label: string; count?: number }[] = [
    { id: 'pipeline', label: 'Contract pipeline', count: openPipeline.length },
    { id: 'needs-attention', label: 'Needs attention', count: needsAttention.length },
    { id: 'recommended', label: 'AI recommendations', count: recommended.length },
    { id: 'talking-points', label: 'Portal talking points' },
    { id: 'closed', label: 'Closed', count: resolvedActions.length },
  ];

  return (
    <div
      style={{
        background: BRAND.white,
        border: `1px solid ${BRAND.grayBorder}`,
        borderRadius: 10,
        marginBottom: 12,
        overflow: 'hidden',
      }}
    >
      <div style={{ padding: '12px 16px', borderBottom: `1px solid ${BRAND.grayBorder}` }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12, flexWrap: 'wrap' }}>
          <div>
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark }}>
              Actions &amp; opportunities
            </div>
            <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
              Contract pipeline, renewals, savings opportunities, and next steps for this account
            </div>
          </div>
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
            {onOpenRecommendationsHub && actions.length > 0 && (
              <button
                type="button"
                onClick={onOpenRecommendationsHub}
                style={{
                  border: 'none',
                  background: `linear-gradient(135deg,${BRAND.redDark},${BRAND.redLight})`,
                  color: BRAND.white,
                  borderRadius: 6,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                Open full view
              </button>
            )}
            {onAddCustomAction && (
              <button
                type="button"
                onClick={onAddCustomAction}
                style={{
                  border: `1px solid ${BRAND.grayBorder}`,
                  background: BRAND.white,
                  color: BRAND.grayDark,
                  borderRadius: 6,
                  padding: '7px 12px',
                  fontSize: 12,
                  fontWeight: 600,
                  cursor: 'pointer',
                  whiteSpace: 'nowrap',
                }}
              >
                + Custom action
              </button>
            )}
          </div>
        </div>

        {hero && activeTab !== 'pipeline' && (
          <div
            style={{
              marginTop: 12,
              padding: '12px 14px',
              borderRadius: 8,
              background: 'linear-gradient(135deg,#1E1E1E,#2A1A1A)',
              border: '1px solid rgba(200,40,30,0.25)',
            }}
          >
            <div style={{ fontSize: 10, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: BRAND.redLight, marginBottom: 4 }}>
              Top recommendation
            </div>
            <div style={{ fontSize: 14, fontWeight: 600, color: '#F9FAFB', marginBottom: 4 }}>{hero.title}</div>
            <p style={{ margin: '0 0 8px', fontSize: 12, color: '#D1D5DB', lineHeight: 1.5 }}>{hero.detail}</p>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              {customerId && companyName ? (
                <RecommendationFeedback customerId={customerId} companyName={companyName} action={hero} />
              ) : null}
              {onOpenRecommendationsHub ? (
                <button
                  type="button"
                  onClick={onOpenRecommendationsHub}
                  style={{
                    border: '1px solid rgba(255,255,255,0.2)',
                    background: 'transparent',
                    color: '#E5E7EB',
                    borderRadius: 6,
                    padding: '4px 10px',
                    fontSize: 11,
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Discuss with Hank →
                </button>
              ) : null}
            </div>
          </div>
        )}

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12 }}>
          {tabs.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              style={{
                border: `1px solid ${activeTab === tab.id ? BRAND.red : BRAND.grayBorder}`,
                background: activeTab === tab.id ? BRAND.red : BRAND.white,
                color: activeTab === tab.id ? BRAND.white : BRAND.gray,
                borderRadius: 20,
                padding: '7px 14px',
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                transition: 'all 0.15s',
              }}
            >
              {tab.label}
              {tab.count != null && tab.count > 0 ? ` (${tab.count})` : ''}
            </button>
          ))}
        </div>
      </div>

      <div style={{ maxHeight: 420, overflowY: 'auto', padding: 16 }}>
        {activeTab === 'pipeline' && (
          contractActions.length > 0 ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              {contractActions.map((deal) => (
                <button
                  key={deal.id}
                  type="button"
                  onClick={() => setActiveDeal(deal)}
                  style={{
                    textAlign: 'left',
                    border: `1px solid ${deal.status === 'converted' ? BRAND.grayBorder : '#C7D2FE'}`,
                    background: deal.status === 'converted' ? BRAND.white : '#EEF2FF',
                    borderRadius: 8,
                    padding: '12px 14px',
                    borderLeft: `4px solid ${deal.status === 'converted' ? BRAND.green : '#6366F1'}`,
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, flexWrap: 'wrap' }}>
                    <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>
                      {deal.vendor_name || deal.service_label}
                    </div>
                    <div style={{ fontSize: 11, fontWeight: 700, color: '#4F46E5' }}>
                      {CONTRACT_DEAL_STAGE_LABEL[deal.status]}
                    </div>
                  </div>
                  <div style={{ fontSize: 12, color: BRAND.gray, marginTop: 4 }}>
                    {deal.acceptance?.monthlyTotal != null
                      ? `Monthly $${deal.acceptance.monthlyTotal.toFixed(2)}`
                      : 'Accepted quote'}
                    {deal.pay_source ? ` · ${deal.pay_source}` : ''}
                    {' · '}
                    View details &amp; continue →
                  </div>
                </button>
              ))}
            </div>
          ) : (
            <EmptyTab text="No contract pipeline actions for this account." />
          )
        )}

        {activeTab === 'needs-attention' && (
          needsAttention.length > 0 ? (
            <ActionList
              actions={needsAttention}
              onResolveAction={onResolveAction}
              customerId={customerId}
              companyName={companyName}
            />
          ) : (
            <EmptyTab text="No urgent renewals or items needing attention right now." />
          )
        )}

        {activeTab === 'recommended' && (
          recommended.length > 0 ? (
            <ActionList
              actions={recommended}
              onResolveAction={onResolveAction}
              customerId={customerId}
              companyName={companyName}
            />
          ) : (
            <EmptyTab text="No AI recommendations for this account." />
          )
        )}

        {activeTab === 'talking-points' && (
          salesPitch ? (
            <div
              style={{
                background: 'linear-gradient(135deg,#1E1E1E,#2A1A1A)',
                borderRadius: 10,
                padding: '14px 18px',
                border: '1px solid rgba(200,40,30,0.25)',
              }}
            >
              <p style={{ margin: 0, fontSize: 13, color: '#E5E7EB', lineHeight: 1.6 }}>{salesPitch}</p>
            </div>
          ) : (
            <EmptyTab text="No portal talking point on file for this account." />
          )
        )}

        {activeTab === 'closed' && (
          resolvedActions.length > 0 ? (
            <ResolvedList items={resolvedActions} />
          ) : (
            <EmptyTab text="No closed actions yet." />
          )
        )}
      </div>

      {activeDeal ? (
        <ContractDealWorkbench
          action={activeDeal}
          asModal
          onClose={() => setActiveDeal(null)}
          onUpdated={() => onContractPipelineUpdated?.()}
        />
      ) : null}
    </div>
  );
}

function EmptyTab({ text }: { text: string }) {
  return (
    <div style={{ padding: 24, textAlign: 'center', color: BRAND.gray, fontSize: 13 }}>{text}</div>
  );
}

function ActionList({
  actions,
  onResolveAction,
  customerId,
  companyName,
}: {
  actions: CustomerAction[];
  onResolveAction?: (action: CustomerAction) => void;
  customerId?: string;
  companyName?: string;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map((action) => (
        <ActionCard
          key={action.id}
          action={action}
          onResolveAction={onResolveAction}
          customerId={customerId}
          companyName={companyName}
        />
      ))}
    </div>
  );
}

function ActionCard({
  action,
  onResolveAction,
  customerId,
  companyName,
}: {
  action: CustomerAction;
  onResolveAction?: (action: CustomerAction) => void;
  customerId?: string;
  companyName?: string;
}) {
  const style = SEVERITY_STYLE[action.severity];

  return (
    <div
      style={{
        border: `1px solid ${style.border}`,
        background: style.bg,
        borderRadius: 8,
        padding: '12px 14px',
        borderLeft: `4px solid ${style.color}`,
      }}
    >
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center', marginBottom: 6 }}>
        <span
          style={{
            fontSize: 10,
            fontWeight: 700,
            letterSpacing: '0.08em',
            textTransform: 'uppercase',
            color: style.color,
          }}
        >
          {style.label}
        </span>
        <span style={{ fontSize: 10, color: BRAND.gray, textTransform: 'uppercase' }}>
          {action.kind === 'renewal' ? 'Renewal' : action.kind === 'optimization' ? 'AI recommendation' : 'Custom'}
        </span>
        {action.source === 'custom' && (
          <span style={{ fontSize: 10, color: BRAND.blue, fontWeight: 600 }}>Custom</span>
        )}
        {customerId && companyName ? (
          <RecommendationFeedback customerId={customerId} companyName={companyName} action={action} />
        ) : null}
        {action.dueDate && (
          <span style={{ fontSize: 11, color: BRAND.grayDark, marginLeft: 'auto' }}>
            Due {action.dueDate}
          </span>
        )}
      </div>
      <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark, marginBottom: 4 }}>{action.title}</div>
      <p style={{ margin: '0 0 8px', fontSize: 12, color: BRAND.gray, lineHeight: 1.5 }}>{action.detail}</p>
      <div style={{ fontSize: 12, color: BRAND.grayDark, marginBottom: onResolveAction ? 10 : 0 }}>
        <strong>Suggested:</strong> {action.suggestedAction}
      </div>
      {onResolveAction && (
        <button
          type="button"
          onClick={() => onResolveAction(action)}
          style={{
            border: `1px solid ${BRAND.grayBorder}`,
            background: BRAND.white,
            color: BRAND.grayDark,
            borderRadius: 6,
            padding: '6px 12px',
            fontSize: 11,
            fontWeight: 600,
            cursor: 'pointer',
          }}
        >
          Close action…
        </button>
      )}
    </div>
  );
}

function ResolvedList({ items }: { items: ResolvedCustomerAction[] }) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {items.map((r) => (
        <div
          key={`${r.actionId}-${r.resolvedAt}`}
          style={{
            border: `1px solid ${BRAND.grayBorder}`,
            borderRadius: 8,
            padding: '12px 14px',
            background: BRAND.grayLight,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 4 }}>
            <span style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark }}>{r.actionTitle}</span>
            <span style={{ fontSize: 11, fontWeight: 600, color: BRAND.green }}>{outcomeLabel(r.outcome)}</span>
          </div>
          {r.notes && (
            <p style={{ margin: '0 0 6px', fontSize: 12, color: BRAND.gray, lineHeight: 1.45 }}>{r.notes}</p>
          )}
          <div style={{ fontSize: 11, color: BRAND.gray }}>
            Closed {new Date(r.resolvedAt).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })}
            {r.documentFilename ? ` · ${r.documentFilename}` : ''}
            {r.resolvedBy ? ` · ${r.resolvedBy}` : ''}
          </div>
        </div>
      ))}
    </div>
  );
}
