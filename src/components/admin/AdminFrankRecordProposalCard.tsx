'use client';

import { useState } from 'react';
import {
  applyAdminRecordProposal,
  type AdminRecordAddProposal,
} from '@/lib/admin-hank-record-actions';

const TARGET_LABEL: Record<AdminRecordAddProposal['target'], string> = {
  account: 'Account',
  lead: 'Lead',
  partner: 'Partner',
  outreach: 'Outreach',
};

export function AdminFrankRecordProposalCard({
  proposal,
  onDone,
}: {
  proposal: AdminRecordAddProposal;
  onDone: (result: { ok: boolean; message: string }) => void;
}) {
  const [busy, setBusy] = useState(false);
  const [dismissed, setDismissed] = useState(false);

  if (dismissed) return null;

  const approve = async () => {
    if (busy) return;
    setBusy(true);
    try {
      const result = await applyAdminRecordProposal(proposal);
      setDismissed(true);
      onDone({ ok: true, message: result.message });
    } catch (err) {
      onDone({
        ok: false,
        message: err instanceof Error ? err.message : 'Could not save records',
      });
      setBusy(false);
    }
  };

  return (
    <div className="assist-record-proposal">
      <div className="assist-record-proposal-head">
        <strong>Approve add</strong>
        <span>
          {TARGET_LABEL[proposal.target]} · {proposal.targetLabel}
          {proposal.targetId ? ` · ${proposal.targetId}` : ''}
        </span>
      </div>
      <ul className="assist-record-proposal-list">
        {proposal.contacts.map((c, i) => (
          <li key={`${c.email ?? c.name}-${i}`}>
            <strong>{c.name}</strong>
            {c.role ? <span> · {c.role}</span> : null}
            {c.email ? <span> · {c.email}</span> : null}
            {c.phone ? <span> · {c.phone}</span> : null}
          </li>
        ))}
      </ul>
      <div className="assist-record-proposal-actions">
        <button type="button" className="assist-mini-btn primary" disabled={busy} onClick={() => void approve()}>
          {busy ? 'Saving…' : `Approve ${proposal.contacts.length} contact${proposal.contacts.length === 1 ? '' : 's'}`}
        </button>
        <button
          type="button"
          className="assist-mini-btn"
          disabled={busy}
          onClick={() => {
            setDismissed(true);
            onDone({ ok: false, message: 'Cancelled — nothing was saved.' });
          }}
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
