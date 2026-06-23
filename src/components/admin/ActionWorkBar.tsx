'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { AdminTicketKind } from '@/lib/admin-tickets';
import type { TeamMember } from '@/lib/admin-action-work';
import { slugHandle } from '@/lib/admin-action-work';
import { fetchTeamMembers, updateActionWork } from '@/lib/team-notes';

type Props = {
  actionKind: AdminTicketKind;
  sourceId: string;
  currentUserId?: string;
  claimedById?: string | null;
  claimedByName?: string | null;
  assigneeIds?: string[];
  assigneeNames?: string[];
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
  claimedById,
  claimedByName,
  assigneeIds = [],
  assigneeNames = [],
  onUpdated,
}: Props) {
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [assigneeQuery, setAssigneeQuery] = useState('');
  const [showSuggestions, setShowSuggestions] = useState(false);
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

  const saveAssignees = async (nextIds: string[]) => {
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, assigneeIds: nextIds });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not update assignees');
    } finally {
      setBusy(false);
    }
  };

  const claim = async () => {
    if (!currentUserId) return;
    const nextAssignees = assigneeIds.includes(currentUserId)
      ? assigneeIds
      : [...assigneeIds, currentUserId];
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, claim: true, assigneeIds: nextAssignees });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not claim');
    } finally {
      setBusy(false);
    }
  };

  const release = async () => {
    setBusy(true);
    setError('');
    try {
      await updateActionWork({ actionKind, sourceId, claim: false });
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not release claim');
    } finally {
      setBusy(false);
    }
  };

  const addAssignee = async (member: TeamMember) => {
    if (assigneeIds.includes(member.id)) return;
    setAssigneeQuery('');
    setShowSuggestions(false);
    await saveAssignees([...assigneeIds, member.id]);
  };

  const removeAssignee = async (userId: string) => {
    await saveAssignees(assigneeIds.filter((id) => id !== userId));
  };

  const suggestions = useMemo(() => {
    const q = assigneeQuery.trim();
    if (!q) return [];
    return members
      .filter((m) => !assigneeIds.includes(m.id))
      .filter((m) => memberMatchesQuery(m, q))
      .slice(0, 8);
  }, [assigneeQuery, members, assigneeIds]);

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

  const isClaimedByMe = Boolean(currentUserId && claimedById === currentUserId);
  const isClaimedByOther = Boolean(claimedById && claimedById !== currentUserId);

  const assigneeLabel = (id: string, fallback?: string) => {
    const member = membersById.get(id);
    return member?.email ?? fallback ?? 'Team member';
  };

  return (
    <div className="action-work-bar">
      <div className="action-work-claim">
        <div className="action-work-label">Working on this</div>
        {claimedById ? (
          <div className="action-work-claimed">
            <span className="action-work-claimed-name">
              {isClaimedByMe ? 'You' : claimedByName ?? 'Teammate'}
            </span>
            {isClaimedByMe ? (
              <button type="button" className="admin-ticket-btn" disabled={busy} onClick={() => void release()}>
                Release
              </button>
            ) : null}
          </div>
        ) : (
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={busy || isClaimedByOther || !currentUserId}
            onClick={() => void claim()}
          >
            Claim action
          </button>
        )}
      </div>

      <div className="action-work-assignees">
        <div className="action-work-label">Assigned to</div>

        {assigneeIds.length > 0 ? (
          <div className="action-work-assignee-list">
            {assigneeIds.map((id, index) => (
              <span key={id} className="action-work-assignee-chip active">
                {assigneeLabel(id, assigneeNames[index])}
                <button
                  type="button"
                  className="action-work-assignee-remove"
                  disabled={busy}
                  onClick={() => void removeAssignee(id)}
                  aria-label={`Remove ${assigneeLabel(id, assigneeNames[index])}`}
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
    </div>
  );
}
