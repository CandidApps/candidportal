'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  CONTRACT_DEAL_STAGES,
  CONTRACT_DEAL_STAGE_LABEL,
  CONTRACT_DEAL_STAGE_SHORT,
  type ContractDealStage,
  type ContractSubmitActionRow,
} from '@/lib/services/contract-submit-actions';
import {
  formatDealActivitySummary,
  type DealActivityEventRow,
} from '@/lib/services/deal-activity';
import { ContractDealWorkbench } from '@/components/admin/ContractDealWorkbench';
import {
  DealEmailPreviewModal,
  emailPayloadFromEvent,
} from '@/components/admin/DealEmailPreviewModal';

type DealPipelineTimelineProps = {
  leadId?: string | null;
  customerExternalId?: string | null;
  actionId?: string | null;
  dealStage?: string | null;
  compact?: boolean;
  /** When provided, clicking the strip / activity opens the deal workbench. */
  action?: ContractSubmitActionRow | null;
  /** Alternate: resolve action from a list by lead / customer / actionId. */
  actions?: ContractSubmitActionRow[];
  onPipelineUpdated?: () => void;
  /** Disable click-to-open (e.g. when already inside the workbench). */
  interactive?: boolean;
};

function resolveAction(
  props: DealPipelineTimelineProps,
): ContractSubmitActionRow | null {
  if (props.action) return props.action;
  const list = props.actions ?? [];
  if (props.actionId) {
    return list.find((a) => a.id === props.actionId) ?? null;
  }
  if (props.leadId) {
    return list.find((a) => a.lead_id === props.leadId) ?? null;
  }
  if (props.customerExternalId) {
    return (
      list.find(
        (a) =>
          a.crm_customer_external_id === props.customerExternalId &&
          a.status !== 'converted',
      ) ??
      list.find((a) => a.crm_customer_external_id === props.customerExternalId) ??
      null
    );
  }
  return null;
}

export function DealPipelineTimeline({
  leadId,
  customerExternalId,
  actionId,
  dealStage,
  compact = false,
  action: actionProp,
  actions = [],
  onPipelineUpdated,
  interactive = true,
}: DealPipelineTimelineProps) {
  const [events, setEvents] = useState<DealActivityEventRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [workbenchOpen, setWorkbenchOpen] = useState(false);
  const [eventsTick, setEventsTick] = useState(0);
  const [emailEvent, setEmailEvent] = useState<DealActivityEventRow | null>(null);

  const resolved = useMemo(
    () =>
      resolveAction({
        leadId,
        customerExternalId,
        actionId,
        dealStage,
        action: actionProp,
        actions,
      }),
    [leadId, customerExternalId, actionId, dealStage, actionProp, actions],
  );

  const stage =
    ((dealStage || resolved?.status) as ContractDealStage | null) ?? null;
  const stageIndex = stage ? CONTRACT_DEAL_STAGES.indexOf(stage) : -1;

  useEffect(() => {
    if (!leadId && !customerExternalId && !actionId && !resolved?.id) {
      setEvents([]);
      return;
    }
    let cancelled = false;
    void (async () => {
      setLoading(true);
      try {
        const params = new URLSearchParams();
        if (leadId) params.set('leadId', leadId);
        else if (actionId || resolved?.id) params.set('actionId', actionId || resolved!.id);
        else if (customerExternalId) params.set('customerExternalId', customerExternalId);
        const res = await fetch(`/api/admin/deal-activity?${params.toString()}`, {
          cache: 'no-store',
        });
        const data = (await res.json()) as { events?: DealActivityEventRow[] };
        if (!cancelled) setEvents(data.events ?? []);
      } catch {
        if (!cancelled) setEvents([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [leadId, customerExternalId, actionId, resolved?.id, eventsTick]);

  if (!leadId && !customerExternalId && !actionId && !stage && !resolved) return null;

  const canOpen = interactive && Boolean(resolved);
  const openWorkbench = () => {
    if (canOpen) setWorkbenchOpen(true);
  };

  return (
    <div className="deal-pipeline-timeline">
      {stage ? (
        <div className="deal-pipeline-current">
          <span className="deal-pipeline-current-label">Current step</span>
          <span className="deal-pipeline-current-value">
            {stageIndex >= 0 ? `${stageIndex + 1} of ${CONTRACT_DEAL_STAGES.length}` : '—'}
            {' · '}
            {CONTRACT_DEAL_STAGE_LABEL[stage]}
          </span>
        </div>
      ) : null}

      <div
        className={`deal-pipeline-strip${canOpen ? ' is-clickable' : ''}${compact ? ' is-compact' : ''}`}
        aria-label={
          stage
            ? `Deal pipeline — current: ${CONTRACT_DEAL_STAGE_LABEL[stage]}`
            : 'Deal pipeline'
        }
        role={canOpen ? 'button' : undefined}
        tabIndex={canOpen ? 0 : undefined}
        onClick={canOpen ? openWorkbench : undefined}
        onKeyDown={
          canOpen
            ? (e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  openWorkbench();
                }
              }
            : undefined
        }
      >
        {CONTRACT_DEAL_STAGES.map((s, i) => {
          const done = stageIndex > i;
          const current = stage === s;
          const upcoming = stageIndex >= 0 ? i > stageIndex : true;
          return (
            <div
              key={s}
              className={`deal-pipeline-step${done ? ' is-done' : ''}${current ? ' is-current' : ''}${upcoming ? ' is-upcoming' : ''}`}
              title={CONTRACT_DEAL_STAGE_LABEL[s]}
              aria-current={current ? 'step' : undefined}
            >
              <span className="deal-pipeline-marker" aria-hidden="true">
                {done ? '✓' : i + 1}
              </span>
              <span className="deal-pipeline-label">
                {CONTRACT_DEAL_STAGE_SHORT[s]}
                {current ? <span className="deal-pipeline-now">Now</span> : null}
              </span>
            </div>
          );
        })}
      </div>

      {canOpen ? (
        <button
          type="button"
          className="deal-pipeline-open-btn"
          onClick={openWorkbench}
        >
          View quote details &amp; continue pipeline
        </button>
      ) : null}

      {loading ? (
        <p className="deal-pipeline-empty">Loading activity…</p>
      ) : events.length === 0 ? (
        <p className="deal-pipeline-empty">No deal activity yet.</p>
      ) : (
        <ul className="deal-pipeline-events">
          {events.map((ev) => {
            const email = emailPayloadFromEvent(ev);
            const clickable = Boolean(email) || canOpen;
            return (
              <li key={ev.id}>
                <button
                  type="button"
                  className={`deal-pipeline-event-btn${clickable ? '' : ' is-static'}`}
                  onClick={() => {
                    if (email) {
                      setEmailEvent(ev);
                      return;
                    }
                    if (canOpen) openWorkbench();
                  }}
                  disabled={!clickable}
                >
                  <div className="deal-pipeline-event-time">
                    {new Date(ev.created_at).toLocaleString()}
                    {email ? ' · View email' : ''}
                  </div>
                  <div className="deal-pipeline-event-body">{formatDealActivitySummary(ev)}</div>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {emailEvent ? (
        <DealEmailPreviewModal event={emailEvent} onClose={() => setEmailEvent(null)} />
      ) : null}

      {workbenchOpen && resolved ? (
        <ContractDealWorkbench
          action={resolved}
          asModal
          onClose={() => setWorkbenchOpen(false)}
          onUpdated={() => {
            onPipelineUpdated?.();
            setEventsTick((n) => n + 1);
          }}
        />
      ) : null}
    </div>
  );
}
