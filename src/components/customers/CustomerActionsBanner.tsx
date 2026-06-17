'use client';

import { useMemo, useState } from 'react';
import type { CustomerAction } from '@/lib/portal-import/merge';
import type { ResolvedCustomerAction } from '@/lib/customer-actions-store';
import { outcomeLabel } from '@/lib/customer-actions-store';

const BRAND = {
  gray: '#6B6B6B',
  grayDark: '#1E1E1E',
  grayLight: '#F5F5F5',
  grayBorder: '#E2E2E2',
  white: '#FFFFFF',
  green: '#1A7A4A',
  amber: '#B45309',
  red: '#C8281E',
  redDark: '#8B1A12',
  redLight: '#E8453B',
  blue: '#1D4ED8',
} as const;

const SEVERITY_STYLE = {
  urgent: { border: '#FECACA', bg: '#FEF2F2', label: 'Urgent', color: BRAND.red },
  soon: { border: '#FED7AA', bg: '#FFFBEB', label: 'Upcoming', color: BRAND.amber },
  info: { border: '#BFDBFE', bg: '#EFF6FF', label: 'Opportunity', color: BRAND.blue },
} as const;

type ActionTab = 'needs-attention' | 'recommended' | 'talking-points' | 'closed';

type Props = {
  actions: CustomerAction[];
  resolvedActions?: ResolvedCustomerAction[];
  salesPitch?: string;
  onResolveAction?: (action: CustomerAction) => void;
  onAddCustomAction?: () => void;
};

export function CustomerActionsBanner({
  actions,
  resolvedActions = [],
  salesPitch,
  onResolveAction,
  onAddCustomAction,
}: Props) {
  const needsAttention = useMemo(
    () => actions.filter((a) => a.severity === 'urgent'),
    [actions],
  );
  const recommended = useMemo(
    () => actions.filter((a) => a.severity !== 'urgent'),
    [actions],
  );

  const [activeTab, setActiveTab] = useState<ActionTab>('needs-attention');

  if (actions.length === 0 && !salesPitch && resolvedActions.length === 0) return null;

  const tabs: { id: ActionTab; label: string; count?: number }[] = [
    { id: 'needs-attention', label: 'Needs attention', count: needsAttention.length },
    { id: 'recommended', label: 'Recommended', count: recommended.length },
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
            <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark }}>Account actions</div>
            <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>
              Renewals, savings opportunities, and customer-facing talking points
            </div>
          </div>
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
        <div
          style={{
            display: 'flex',
            flexWrap: 'wrap',
            gap: 8,
            marginTop: 12,
          }}
        >
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

      <div style={{ maxHeight: 360, overflowY: 'auto', padding: 16 }}>
        {activeTab === 'needs-attention' && (
          needsAttention.length > 0 ? (
            <ActionList actions={needsAttention} onResolveAction={onResolveAction} />
          ) : (
            <EmptyTab text="No urgent renewals or items needing attention right now." />
          )
        )}

        {activeTab === 'recommended' && (
          recommended.length > 0 ? (
            <ActionList actions={recommended} onResolveAction={onResolveAction} />
          ) : (
            <EmptyTab text="No recommended actions for this account." />
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
}: {
  actions: CustomerAction[];
  onResolveAction?: (action: CustomerAction) => void;
}) {
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      {actions.map((action) => (
        <ActionCard key={action.id} action={action} onResolveAction={onResolveAction} />
      ))}
    </div>
  );
}

function ActionCard({
  action,
  onResolveAction,
}: {
  action: CustomerAction;
  onResolveAction?: (action: CustomerAction) => void;
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
          {action.kind === 'renewal' ? 'Renewal' : action.kind === 'optimization' ? 'Optimization' : 'Custom'}
        </span>
        {action.source === 'custom' && (
          <span style={{ fontSize: 10, color: BRAND.blue, fontWeight: 600 }}>Custom</span>
        )}
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
