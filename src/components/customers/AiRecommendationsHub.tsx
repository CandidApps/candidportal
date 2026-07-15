'use client';

import { useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { Customer } from '@/components/CustomersView';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { CustomerAction } from '@/lib/portal-import/merge';
import {
  AI_RECOMMENDATIONS_PHASE1_RULES,
  pickHeroRecommendation,
  rankRecommendations,
} from '@/lib/ai-recommendations';
import {
  getRecommendationFeedback,
  setRecommendationFeedback,
  submitNegativeFeedbackToTraining,
  type RecommendationFeedbackVote,
} from '@/lib/customer-recommendation-feedback';
import { CustomerHankChat } from '@/components/customers/CustomerHankChat';
import type { CustomActionDraft } from '@/components/customers/AddCustomActionModal';
import type { ActionResolutionOutcome } from '@/lib/customer-actions-store';
import type { HankActionResolvePayload } from '@/lib/customer-hank-chat';

type Props = {
  customer: Customer;
  openActions: CustomerAction[];
  contracts: CandidContractRecord[];
  onClose: () => void;
  onResolveAction?: (action: CustomerAction) => void;
  onApplyResolve: (action: CustomerAction, payload: HankActionResolvePayload) => void;
  onApplyAdd: (draft: CustomActionDraft) => void;
  onOpenResolveModal: (
    action: CustomerAction,
    prefill?: { outcome?: ActionResolutionOutcome; notes?: string },
  ) => void;
  onOpenAddModal: (prefill?: Partial<CustomActionDraft>) => void;
};

function FeedbackButtons({
  customerId,
  companyName,
  action,
  onVoted,
}: {
  customerId: string;
  companyName: string;
  action: CustomerAction;
  onVoted?: () => void;
}) {
  const existing = getRecommendationFeedback(customerId, action.id);
  const [vote, setVote] = useState<RecommendationFeedbackVote | null>(existing?.vote ?? null);
  const [noteOpen, setNoteOpen] = useState(false);
  const [note, setNote] = useState(existing?.note ?? '');

  const applyVote = async (next: RecommendationFeedbackVote) => {
    setVote(next);
    setRecommendationFeedback({
      customerId,
      actionId: action.id,
      actionTitle: action.title,
      vote: next,
      note: next === 'down' ? note : undefined,
    });
    if (next === 'down') {
      await submitNegativeFeedbackToTraining({
        customerId,
        companyName,
        actionTitle: action.title,
        note,
      });
    }
    onVoted?.();
  };

  return (
    <div className="ai-rec-feedback">
      <button
        type="button"
        className={`ai-rec-feedback-btn${vote === 'up' ? ' ai-rec-feedback-btn--active' : ''}`}
        title="Helpful"
        onClick={() => void applyVote('up')}
      >
        <AppIcon name="sparkles" size={14} />
      </button>
      <button
        type="button"
        className={`ai-rec-feedback-btn${vote === 'down' ? ' ai-rec-feedback-btn--active' : ''}`}
        title="Not helpful"
        onClick={() => {
          setNoteOpen(true);
          void applyVote('down');
        }}
      >
        ✕
      </button>
      {noteOpen && vote === 'down' ? (
        <input
          className="ai-rec-feedback-note"
          value={note}
          onChange={(e) => setNote(e.target.value)}
          onBlur={() =>
            setRecommendationFeedback({
              customerId,
              actionId: action.id,
              actionTitle: action.title,
              vote: 'down',
              note,
            })
          }
          placeholder="Why wasn't this helpful?"
        />
      ) : null}
    </div>
  );
}

export function AiRecommendationsHub({
  customer,
  openActions,
  contracts,
  onClose,
  onResolveAction,
  onApplyResolve,
  onApplyAdd,
  onOpenResolveModal,
  onOpenAddModal,
}: Props) {
  const [, bump] = useState(0);
  const ranked = useMemo(
    () => rankRecommendations(openActions, customer.portal),
    [openActions, customer.portal],
  );
  const hero = useMemo(
    () => pickHeroRecommendation(openActions, customer.portal),
    [openActions, customer.portal],
  );

  return (
    <div className="ai-rec-hub-overlay">
      <div className="ai-rec-hub" role="dialog" aria-label="AI Recommendations">
        <div className="ai-rec-hub-header">
          <div>
            <div className="ai-rec-hub-eyebrow">AI Recommendations / Opportunities</div>
            <h2 className="ai-rec-hub-title">{customer.company}</h2>
            <p className="ai-rec-hub-sub">
              Top priority recommendation plus Hank for follow-up — feedback improves future suggestions.
            </p>
          </div>
          <button type="button" className="ai-rec-hub-close" onClick={onClose} aria-label="Close">
            ✕
          </button>
        </div>

        {hero ? (
          <div className="ai-rec-hero">
            <div className="ai-rec-hero-label">Top recommendation</div>
            <div className="ai-rec-hero-title">{hero.title}</div>
            <p className="ai-rec-hero-detail">{hero.detail}</p>
            <p className="ai-rec-hero-suggested">
              <strong>Suggested:</strong> {hero.suggestedAction}
            </p>
            <div className="ai-rec-hero-actions">
              {onResolveAction ? (
                <button type="button" className="btn-secondary" onClick={() => onResolveAction(hero)}>
                  Close action…
                </button>
              ) : null}
              <FeedbackButtons
                customerId={customer.id}
                companyName={customer.company}
                action={hero}
                onVoted={() => bump((n) => n + 1)}
              />
            </div>
          </div>
        ) : (
          <div className="ai-rec-hero ai-rec-hero--empty">No open recommendations for this account.</div>
        )}

        <div className="ai-rec-hub-body">
          <div className="ai-rec-list-panel">
            <div className="ai-rec-list-title">All recommendations ({ranked.length})</div>
            <ul className="ai-rec-list">
              {ranked.map((action) => (
                <li key={action.id} className="ai-rec-list-item">
                  <div className="ai-rec-list-item-top">
                    <span className="ai-rec-list-kind">
                      {action.kind === 'renewal'
                        ? 'Renewal'
                        : action.kind === 'optimization'
                          ? 'Opportunity'
                          : 'Custom'}
                    </span>
                    <FeedbackButtons
                      customerId={customer.id}
                      companyName={customer.company}
                      action={action}
                      onVoted={() => bump((n) => n + 1)}
                    />
                  </div>
                  <div className="ai-rec-list-item-title">{action.title}</div>
                  <p className="ai-rec-list-item-detail">{action.detail}</p>
                </li>
              ))}
            </ul>
            <details className="ai-rec-rules">
              <summary>Phase-1 ranking rules</summary>
              <ul>
                {AI_RECOMMENDATIONS_PHASE1_RULES.map((rule) => (
                  <li key={rule}>{rule}</li>
                ))}
              </ul>
            </details>
          </div>

          <div className="ai-rec-chat-panel">
            <CustomerHankChat
              embedded
              customer={customer}
              openActions={openActions}
              contracts={contracts}
              onApplyResolve={onApplyResolve}
              onApplyAdd={onApplyAdd}
              onOpenResolveModal={onOpenResolveModal}
              onOpenAddModal={onOpenAddModal}
            />
          </div>
        </div>
      </div>
    </div>
  );
}
