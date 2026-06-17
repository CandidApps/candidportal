'use client';

import { Fragment } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { formatPeriodLabel } from '@/lib/commissions/commission-store';
import {
  buildWorkflowSteps,
  workflowProgress,
  type WorkflowStepId,
} from '@/lib/commissions/workflow-status';
import type { AgentCommissionRowView, SupplierImportBatch } from '@/lib/commissions/commission-store';
import type { BankDepositPeriodTotal } from '@/lib/services/bank-deposits';

type Props = {
  tab: WorkflowStepId;
  onTab: (id: WorkflowStepId) => void;
  period: string;
  imports: SupplierImportBatch[];
  depositTotals: Record<string, BankDepositPeriodTotal>;
  agents: AgentCommissionRowView[];
  expensesComplete: boolean;
};

export default function CommissionWorkflowTabs({
  tab,
  onTab,
  period,
  imports,
  depositTotals,
  agents,
  expensesComplete,
}: Props) {
  const steps = buildWorkflowSteps(period, imports, depositTotals, agents, expensesComplete);
  const { completed, total, nextStep } = workflowProgress(steps);
  const periodLabel = formatPeriodLabel(period);

  return (
    <div className="comm-workflow">
      <div className="comm-workflow-progress" aria-hidden>
        <div
          className="comm-workflow-progress-fill"
          style={{ width: `${(completed / total) * 100}%` }}
        />
      </div>

      <div className="comm-workflow-track" role="tablist" aria-label="Commission workflow">
        {steps.map((step, index) => (
          <Fragment key={step.id}>
            {index > 0 && (
              <span className={`comm-workflow-arrow${steps[index - 1]!.complete ? ' done' : ''}`} aria-hidden>
                ›
              </span>
            )}
            <button
              type="button"
              role="tab"
              aria-selected={tab === step.id}
              title={step.hint}
              className={`comm-workflow-step comm-workflow-step--${step.status}${tab === step.id ? ' active' : ''}`}
              onClick={() => onTab(step.id)}
            >
              <span className="comm-workflow-step-num" aria-hidden>
                {step.status === 'complete' ? (
                  <AppIcon name="check" size={14} />
                ) : (
                  step.step
                )}
              </span>
              <span className="comm-workflow-step-body">
                <span className="comm-workflow-step-label">{step.label}</span>
                {step.status === 'action' && (
                  <span className="comm-workflow-step-hint">{step.hint}</span>
                )}
              </span>
              {step.status === 'action' && (
                <AppIcon name="warning" className="comm-workflow-alert" size={14} />
              )}
              {step.status === 'blocked' && (
                <AppIcon name="lock" className="comm-workflow-lock" size={12} />
              )}
            </button>
          </Fragment>
        ))}
      </div>

      <p className="comm-workflow-summary">
        <strong>{completed} of {total}</strong> steps complete for {periodLabel}
        {nextStep ? (
          <>
            {' · '}
            <span className="comm-workflow-summary-next">
              Next: {nextStep.label}
            </span>
          </>
        ) : (
          <> · <span className="comm-workflow-summary-done">Month closed</span></>
        )}
      </p>
    </div>
  );
}
