'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminTicketKind } from '@/lib/admin-tickets';
import type { ActionAssignee, TeamMember } from '@/lib/admin-action-work';
import { buildActionKey, slugHandle } from '@/lib/admin-action-work';
import { fetchTeamMembers, postTeamNote, updateActionWork } from '@/lib/team-notes';
import { AppIcon } from '@/components/AppIcon';

type Props = {
  actionKind: AdminTicketKind;
  sourceId: string;
  currentUserId?: string;
  assignees?: ActionAssignee[];
  onUpdated?: () => void;
};

function normalizeAssigneeQuery(query: string): string {
  return query.trim().toLowerCase();
}

function memberMatchesQuery(member: TeamMember, query: string): boolean {
  const q = normalizeAssigneeQuery(query);
  if (!q) return false;
  const email = member.email.toLowerCase();
  const name = member.displayName.toLowerCase();
  return (
    email === q ||
    email.includes(q) ||
    name.includes(q) ||
    member.handle.toLowerCase().includes(q) ||
    slugHandle(member.email).includes(q) ||
    (email.split('@')[0] ?? '').includes(q)
  );
}

function findMemberByQuery(members: TeamMember[], query: string): TeamMember | null {
  const q = normalizeAssigneeQuery(query);
  if (!q) return null;

  const exactEmail = members.find((m) => m.email.toLowerCase() === q);
  if (exactEmail) return exactEmail;

  const localPartMatch = members.find((m) => (m.email.split('@')[0] ?? '').toLowerCase() === q);
  if (localPartMatch) return localPartMatch;

  const matches = members.filter((m) => memberMatchesQuery(m, q));
  if (matches.length === 1) return matches[0]!;

  if (matches.length > 1) {
    const emailStarts = matches.find((m) => m.email.toLowerCase().startsWith(q));
    if (emailStarts) return emailStarts;
    const nameStarts = matches.find((m) => m.displayName.toLowerCase().startsWith(q));
    if (nameStarts) return nameStarts;
    return matches[0]!;
  }

  return null;
}

export function ActionWorkBar({
  actionKind,
  sourceId,
  currentUserId,
  assignees = [],
  onUpdated,
}: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [rejectTarget, setRejectTarget] = useState<ActionAssignee | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    void fetchTeamMembers()
      .then(setMembers)
      .catch(() => setMembers([]));
  }, []);

  const membersById = useMemo(() => new Map(members.map((m) => [m.id, m])), [members]);

  const refresh = useCallback(async () => {
    await onUpdated?.();
  }, [onUpdated]);

  const me = useMemo(
    () => assignees.find((a) => a.userId === currentUserId) ?? null,
    [assignees, currentUserId],
  );

  const claimers = useMemo(() => assignees.filter((a) => a.claimed), [assignees]);

  const labelFor = useCallback(
    (a: ActionAssignee) => (a.userId === currentUserId ? 'You' : a.name),
    [currentUserId],
  );

  const claim = async () => {
    if (!currentUserId) return;
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, op: 'claim' });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim');
    } finally {
      setBusy(false);
    }
  };

  const plainRemove = async (userId: string) => {
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, op: 'remove', userId });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update assignees');
    } finally {
      setBusy(false);
    }
  };

  const addAssignee = async (member: TeamMember) => {
    if (assignees.some((a) => a.userId === member.id)) return;
    setAssigneeQuery('');
    setShowSuggestions(false);
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, op: 'assign', userId: member.id });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add assignee');
    } finally {
      setBusy(false);
    }
  };

  // Removing an assignment that was made by someone else requires a reason note.
  const requestRemove = (assignee: ActionAssignee) => {
    if (assignee.assignedByOther) {
      setRejectReason('');
      setRejectTarget(assignee);
      return;
    }
    void plainRemove(assignee.userId);
  };

  const buildRejectNote = (target: ActionAssignee, reason: string): string => {
    const assigner = target.assignedById ? membersById.get(target.assignedById) : null;
    const mention = assigner ? `@${assigner.handle} ` : '';
    if (target.userId === currentUserId) {
      return `${mention}Declined this action — ${reason}`.trim();
    }
    return `${mention}Removed ${target.name} from this action — ${reason}`.trim();
  };

  const submitReject = async () => {
    if (!rejectTarget) return;
    const reason = rejectReason.trim();
    if (!reason) {
      setError('Please add a reason for rejecting.');
      return;
    }
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, op: 'remove', userId: rejectTarget.userId });
      await postTeamNote({
        contextType: 'action',
        contextKey: buildActionKey(actionKind, sourceId),
        body: buildRejectNote(rejectTarget, reason),
      });
      setRejectTarget(null);
      setRejectReason('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not reject assignment');
    } finally {
      setBusy(false);
    }
  };

  const suggestions = useMemo(() => {
    const q = assigneeQuery.trim();
    if (!q) return [];
    const assignedIds = new Set(assignees.map((a) => a.userId));
    return members
      .filter((m) => !assignedIds.has(m.id))
      .filter((m) => memberMatchesQuery(m, q))
      .slice(0, 8);
  }, [assigneeQuery, members, assignees]);

  const tryAddFromInput = async () => {
    const candidate = suggestions[0] ?? findMemberByQuery(members, assigneeQuery);
    if (!candidate) {
      setError(
        members.length === 0
          ? 'Team roster is empty — sign in with a @candid.solutions account or set profile role to admin.'
          : 'No teammate matched that email or name.',
      );
      return;
    }
    setError('');
    await addAssignee(candidate);
  };

  return (
    <div className="action-work-bar">
      <div className="action-work-claim">
        <div className="action-work-label">Working on this</div>
        <div className="action-work-claim-controls">
          {!currentUserId ? (
            <span className="action-work-empty">Sign in to claim</span>
          ) : !me ? (
            <button
              type="button"
              className="action-work-btn action-work-btn--claim"
              disabled={busy}
              onClick={() => void claim()}
            >
              <AppIcon name="check" size={13} /> Claim
            </button>
          ) : !me.claimed ? (
            <>
              <button
                type="button"
                className="action-work-btn action-work-btn--claim"
                disabled={busy}
                onClick={() => void claim()}
              >
                <AppIcon name="check" size={13} /> Claim
              </button>
              <button
                type="button"
                className="action-work-btn action-work-btn--reject"
                disabled={busy}
                onClick={() => requestRemove(me)}
              >
                <AppIcon name="close" size={13} /> Reject
              </button>
            </>
          ) : (
            <>
              <span className="action-work-mine">
                <AppIcon name="check" size={13} /> You&apos;re working on this
              </span>
              <button
                type="button"
                className="action-work-btn action-work-btn--reject"
                disabled={busy}
                onClick={() => requestRemove(me)}
              >
                <AppIcon name="close" size={13} /> {me.assignedByOther ? 'Reject' : 'Release'}
              </button>
            </>
          )}
        </div>
        {claimers.length > 0 ? (
          <div className="action-work-claimers">
            {claimers.length} working: {claimers.map((a) => labelFor(a)).join(', ')}
          </div>
        ) : null}
      </div>

      <div className="action-work-assignees">
        <div className="action-work-label">Assigned to</div>

        {assignees.length > 0 ? (
          <div className="action-work-assignee-list">
            {assignees.map((a) => (
              <span
                key={a.userId}
                className={`action-work-assignee-chip${a.claimed ? ' claimed' : ' pending'}`}
                title={
                  a.claimed
                    ? 'Claimed — actively working'
                    : a.assignedByOther
                      ? 'Assigned, not yet claimed'
                      : 'Assigned'
                }
              >
                {a.claimed ? <AppIcon name="check" size={11} /> : null}
                {labelFor(a)}
                <button
                  type="button"
                  className="action-work-assignee-remove"
                  disabled={busy}
                  onClick={() => requestRemove(a)}
                  aria-label={`Remove ${labelFor(a)}`}
                >
                  ×
                </button>
              </span>
            ))}
          </div>
        ) : (
          <div className="action-work-empty">No one assigned yet</div>
        )}

        <div className="action-work-assignee-input-wrap">
          <input
            ref={inputRef}
            type="text"
            className="action-work-assignee-input"
            value={assigneeQuery}
            disabled={busy || members.length === 0}
            placeholder={members.length ? 'Type email or name to add…' : 'Loading team roster…'}
            onChange={(e) => {
              setAssigneeQuery(e.target.value);
              setShowSuggestions(true);
              setError('');
            }}
            onFocus={() => setShowSuggestions(true)}
            onBlur={() => {
              window.setTimeout(() => setShowSuggestions(false), 150);
            }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault();
                if (suggestions[0]) void addAssignee(suggestions[0]);
                else void tryAddFromInput();
              } else if (e.key === 'Escape') {
                setAssigneeQuery('');
                setShowSuggestions(false);
              }
            }}
          />
          <button
            type="button"
            className="admin-ticket-btn"
            disabled={busy || !assigneeQuery.trim()}
            onClick={() => void tryAddFromInput()}
          >
            Add
          </button>
        </div>

        {showSuggestions && suggestions.length > 0 ? (
          <div className="action-work-assignee-suggestions" role="listbox">
            {suggestions.map((member) => (
              <button
                key={member.id}
                type="button"
                className="action-work-assignee-suggestion"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => void addAssignee(member)}
              >
                <span className="action-work-assignee-suggestion-email">{member.email}</span>
                {member.displayName && member.displayName !== member.email ? (
                  <span className="action-work-assignee-suggestion-name">{member.displayName}</span>
                ) : null}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      {error ? <p className="action-work-error">{error}</p> : null}

      {rejectTarget ? (
        <div
          className="modal-overlay open"
          onClick={(e) => {
            if (e.target === e.currentTarget && !busy) setRejectTarget(null);
          }}
        >
          <div className="action-reject-modal" onClick={(e) => e.stopPropagation()}>
            <h4 className="action-reject-title">
              <AppIcon name="close" size={14} />{' '}
              {rejectTarget.userId === currentUserId
                ? 'Reject this assignment'
                : `Remove ${rejectTarget.name}`}
            </h4>
            <p className="action-reject-sub">
              This was assigned by a teammate. Add a note explaining why — it will be posted to team
              notes.
            </p>
            <textarea
              className="action-reject-textarea"
              autoFocus
              rows={3}
              value={rejectReason}
              placeholder="Reason for rejecting…"
              disabled={busy}
              onChange={(e) => {
                setRejectReason(e.target.value);
                setError('');
              }}
            />
            <div className="action-reject-actions">
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={busy}
                onClick={() => setRejectTarget(null)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="action-work-btn action-work-btn--reject"
                disabled={busy || !rejectReason.trim()}
                onClick={() => void submitReject()}
              >
                <AppIcon name="close" size={13} /> Reject & note
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
