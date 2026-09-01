'use client';

import type { ReactNode } from 'react';
import {
  CHANGE_STATUS_LABEL,
  CHANGE_TYPE_LABEL,
  IMPLEMENTATION_PATH_LABEL,
  type ChangeRequest,
} from '@/lib/services/product-change-requests';

function SpecBlock({ title, children }: { title: string; children: ReactNode }) {
  return (
    <section className="roadmap-spec-block">
      <h4>{title}</h4>
      <div className="roadmap-spec-body">{children}</div>
    </section>
  );
}

function SpecText({ value, empty = 'Not specified' }: { value: string; empty?: string }) {
  const text = value?.trim();
  if (!text) return <p className="roadmap-spec-empty">{empty}</p>;
  return (
    <div className="roadmap-spec-text">
      {text.split('\n').map((line, i) => (
        <p key={i}>{line || '\u00a0'}</p>
      ))}
    </div>
  );
}

function MetaRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="roadmap-spec-meta-row">
      <span className="roadmap-spec-meta-label">{label}</span>
      <span>{value || '—'}</span>
    </div>
  );
}

export function ChangeRequestSpecPanel({
  change,
}: {
  change: ChangeRequest;
  reviews?: unknown[];
}) {
  return (
    <div className="roadmap-spec-panel">
      <div className="roadmap-spec-meta">
        <MetaRow label="Type" value={CHANGE_TYPE_LABEL[change.change_type]} />
        <MetaRow label="Priority" value={change.priority.toUpperCase()} />
        <MetaRow label="Status" value={CHANGE_STATUS_LABEL[change.status]} />
        <MetaRow label="Screen" value={change.screen} />
        <MetaRow label="User role" value={change.user_role} />
        <MetaRow label="App areas" value={change.app_areas} />
        <MetaRow label="Owner" value={change.owner} />
        <MetaRow label="Reviewers" value={change.reviewers} />
        <MetaRow label="Data migration" value={change.data_migration} />
        <MetaRow label="Related files (code)" value={change.related_files} />
        <MetaRow
          label="Implementation path"
          value={IMPLEMENTATION_PATH_LABEL[change.implementation_path]}
        />
        {change.linked_branch && <MetaRow label="Branch" value={change.linked_branch} />}
        {change.linked_pr_url && (
          <MetaRow label="Pull request" value={change.linked_pr_url} />
        )}
      </div>

      <SpecBlock title="Current behavior">
        <SpecText value={change.current_behavior} />
      </SpecBlock>
      <SpecBlock title="Desired behavior">
        <SpecText value={change.desired_behavior} />
      </SpecBlock>
      <SpecBlock title="User flow">
        <SpecText value={change.user_flow_steps} />
      </SpecBlock>
      <SpecBlock title="What this change solves / fixes">
        <SpecText value={change.change_solves} />
      </SpecBlock>
      <SpecBlock title="Acceptance criteria">
        <SpecText value={change.acceptance_criteria} />
      </SpecBlock>
      <SpecBlock title="Out of scope">
        <SpecText value={change.out_of_scope} empty="None" />
      </SpecBlock>
      <SpecBlock title="Risk notes">
        <SpecText value={change.risk_notes} empty="None" />
      </SpecBlock>
      <SpecBlock title="Demo impact">
        <SpecText value={change.demo_impact} empty="None" />
      </SpecBlock>
    </div>
  );
}
