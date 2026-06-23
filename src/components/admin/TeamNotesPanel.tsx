'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderNoteBody } from '@/lib/admin-action-work';
import type { TeamMember } from '@/lib/admin-action-work';
import {
  fetchTeamMembers,
  fetchTeamNotes,
  postTeamNote,
  type TeamNoteContextType,
  type TeamNoteRecord,
} from '@/lib/team-notes';

type Props = {
  contextType: TeamNoteContextType;
  contextKey: string;
  title?: string;
  compact?: boolean;
};

export function TeamNotesPanel({
  contextType,
  contextKey,
  title = 'Team notes',
  compact = false,
}: Props) {
  const [notes, setNotes] = useState<TeamNoteRecord[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [noteRows, team] = await Promise.all([
        fetchTeamNotes(contextType, contextKey),
        members.length ? Promise.resolve(members) : fetchTeamMembers(),
      ]);
      setNotes(noteRows);
      if (!members.length) setMembers(team);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load notes');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [contextType, contextKey]);

  const mentionSuggestions = useMemo(() => {
    if (!mentionQuery) return [];
    const q = mentionQuery.toLowerCase();
    return members
      .filter(
        (m) =>
          m.handle.toLowerCase().includes(q) ||
          m.displayName.toLowerCase().includes(q) ||
          m.email.toLowerCase().includes(q),
      )
      .slice(0, 6);
  }, [mentionQuery, members]);

  const onDraftChange = (value: string) => {
    setDraft(value);
    const caret = value.length;
    const uptoCaret = value.slice(0, caret);
    const atMatch = uptoCaret.match(/@([a-zA-Z0-9._-]*)$/);
    setMentionQuery(atMatch ? atMatch[1]! : null);
  };

  const insertMention = (member: TeamMember) => {
    const el = textareaRef.current;
    const value = draft;
    const caret = el?.selectionStart ?? value.length;
    const uptoCaret = value.slice(0, caret);
    const afterCaret = value.slice(caret);
    const atMatch = uptoCaret.match(/@([a-zA-Z0-9._-]*)$/);
    if (!atMatch) return;
    const start = caret - atMatch[0].length;
    const next = `${value.slice(0, start)}@${member.handle} ${afterCaret}`;
    setDraft(next);
    setMentionQuery(null);
    requestAnimationFrame(() => {
      if (!el) return;
      const pos = start + member.handle.length + 2;
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const submit = async () => {
    const body = draft.trim();
    if (!body) return;
    setPosting(true);
    setError('');
    try {
      const note = await postTeamNote({ contextType, contextKey, body });
      setNotes((prev) => [...prev, note]);
      setDraft('');
      setMentionQuery(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  return (
    <div className={`team-notes-panel${compact ? ' team-notes-panel--compact' : ''}`}>
      <div className="team-notes-header">
        <div className="team-notes-title">{title}</div>
        <div className="team-notes-hint">Use @{`username`} to notify teammates</div>
      </div>

      <div className="team-notes-list">
        {loading ? (
          <div className="team-notes-empty">Loading notes…</div>
        ) : notes.length === 0 ? (
          <div className="team-notes-empty">No team notes yet.</div>
        ) : (
          notes.map((note) => (
            <div key={note.id} className="team-note-item">
              <div className="team-note-meta">
                <strong>{note.authorName}</strong>
                <span>{new Date(note.createdAt).toLocaleString()}</span>
              </div>
              <div
                className="team-note-body"
                dangerouslySetInnerHTML={{ __html: renderNoteBody(note.body, members) }}
              />
            </div>
          ))
        )}
      </div>

      <div className="team-notes-compose">
        <textarea
          ref={textareaRef}
          className="team-notes-input"
          rows={compact ? 3 : 4}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder="Write a note for the team… @mention to notify"
        />
        {mentionSuggestions.length > 0 ? (
          <div className="team-notes-mentions">
            {mentionSuggestions.map((member) => (
              <button
                key={member.id}
                type="button"
                className="team-notes-mention-option"
                onClick={() => insertMention(member)}
              >
                <strong>@{member.handle}</strong>
                <span>{member.displayName}</span>
              </button>
            ))}
          </div>
        ) : null}
        {error ? <p className="team-notes-error">{error}</p> : null}
        <div className="team-notes-actions">
          <button
            type="button"
            className="admin-ticket-btn primary"
            disabled={posting || !draft.trim()}
            onClick={() => void submit()}
          >
            {posting ? 'Posting…' : 'Post note'}
          </button>
        </div>
      </div>
    </div>
  );
}
