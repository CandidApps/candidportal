'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { renderNoteBody } from '@/lib/admin-action-work';
import type { TeamMember } from '@/lib/admin-action-work';
import {
  deleteTeamNote,
  fetchTeamMembers,
  fetchTeamNotes,
  postTeamNote,
  updateTeamNote,
  type TeamNoteContextType,
  type TeamNoteRecord,
} from '@/lib/team-notes';

type Props = {
  contextType: TeamNoteContextType;
  contextKey: string;
  /** Shown above the list when there is no outer section header (e.g. quote/review panels). */
  title?: string;
  compact?: boolean;
};

export function TeamNotesPanel({
  contextType,
  contextKey,
  title,
  compact = false,
}: Props) {
  const [notes, setNotes] = useState<TeamNoteRecord[]>([]);
  const [members, setMembers] = useState<TeamMember[]>([]);
  const [currentUserId, setCurrentUserId] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [loading, setLoading] = useState(true);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState('');
  const [mentionQuery, setMentionQuery] = useState<string | null>(null);
  const [replyTo, setReplyTo] = useState<TeamNoteRecord | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editDraft, setEditDraft] = useState('');
  const [busyId, setBusyId] = useState<string | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const reload = async () => {
    setLoading(true);
    setError('');
    try {
      const [{ notes: noteRows, currentUserId: uid }, team] = await Promise.all([
        fetchTeamNotes(contextType, contextKey),
        members.length ? Promise.resolve(members) : fetchTeamMembers(),
      ]);
      setNotes(noteRows);
      setCurrentUserId(uid);
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

  const roots = useMemo(
    () => notes.filter((n) => !n.parentNoteId),
    [notes],
  );
  const repliesByParent = useMemo(() => {
    const map = new Map<string, TeamNoteRecord[]>();
    for (const n of notes) {
      if (!n.parentNoteId) continue;
      const list = map.get(n.parentNoteId) ?? [];
      list.push(n);
      map.set(n.parentNoteId, list);
    }
    return map;
  }, [notes]);

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
      const note = await postTeamNote({
        contextType,
        contextKey,
        body,
        parentNoteId: replyTo?.id ?? null,
      });
      setNotes((prev) => [...prev, note]);
      setDraft('');
      setReplyTo(null);
      setMentionQuery(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to post note');
    } finally {
      setPosting(false);
    }
  };

  const startEdit = (note: TeamNoteRecord) => {
    setEditingId(note.id);
    setEditDraft(note.body);
    setReplyTo(null);
    setError('');
  };

  const cancelEdit = () => {
    setEditingId(null);
    setEditDraft('');
  };

  const saveEdit = async (noteId: string) => {
    const body = editDraft.trim();
    if (!body) return;
    setBusyId(noteId);
    setError('');
    try {
      const updated = await updateTeamNote({ id: noteId, body });
      setNotes((prev) => prev.map((n) => (n.id === noteId ? updated : n)));
      setEditingId(null);
      setEditDraft('');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to update note');
    } finally {
      setBusyId(null);
    }
  };

  const removeNote = async (note: TeamNoteRecord) => {
    if (!window.confirm('Delete this note? Replies to it will also be removed.')) return;
    setBusyId(note.id);
    setError('');
    try {
      await deleteTeamNote(note.id);
      setNotes((prev) =>
        prev.filter((n) => n.id !== note.id && n.parentNoteId !== note.id),
      );
      if (replyTo?.id === note.id) setReplyTo(null);
      if (editingId === note.id) cancelEdit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to delete note');
    } finally {
      setBusyId(null);
    }
  };

  const startReply = (note: TeamNoteRecord) => {
    const target = note.parentNoteId
      ? notes.find((n) => n.id === note.parentNoteId) ?? note
      : note;
    setReplyTo(target);
    setEditingId(null);
    setError('');
    requestAnimationFrame(() => textareaRef.current?.focus());
  };

  const renderNote = (note: TeamNoteRecord, isReply: boolean) => {
    const isMine = Boolean(currentUserId && note.authorId === currentUserId);
    const isEditing = editingId === note.id;
    const edited =
      note.updatedAt &&
      note.createdAt &&
      new Date(note.updatedAt).getTime() - new Date(note.createdAt).getTime() > 1000;

    return (
      <div
        key={note.id}
        className={`team-note-item${isReply ? ' team-note-item--reply' : ''}`}
      >
        <div className="team-note-meta">
          <strong>{note.authorName}</strong>
          <span>{new Date(note.createdAt).toLocaleString()}</span>
          {edited ? <span className="team-note-edited">edited</span> : null}
        </div>

        {isEditing ? (
          <div className="team-note-edit">
            <textarea
              className="team-notes-input"
              rows={2}
              value={editDraft}
              onChange={(e) => setEditDraft(e.target.value)}
              disabled={busyId === note.id}
            />
            <div className="team-note-actions">
              <button
                type="button"
                className="team-note-action-btn"
                disabled={busyId === note.id}
                onClick={cancelEdit}
              >
                Cancel
              </button>
              <button
                type="button"
                className="admin-ticket-btn primary"
                disabled={busyId === note.id || !editDraft.trim()}
                onClick={() => void saveEdit(note.id)}
              >
                {busyId === note.id ? 'Saving…' : 'Save'}
              </button>
            </div>
          </div>
        ) : (
          <>
            <div
              className="team-note-body"
              dangerouslySetInnerHTML={{ __html: renderNoteBody(note.body, members) }}
            />
            <div className="team-note-actions">
              <button
                type="button"
                className="team-note-action-btn"
                onClick={() => startReply(note)}
              >
                Reply
              </button>
              {isMine ? (
                <>
                  <button
                    type="button"
                    className="team-note-action-btn"
                    disabled={busyId === note.id}
                    onClick={() => startEdit(note)}
                  >
                    Edit
                  </button>
                  <button
                    type="button"
                    className="team-note-action-btn team-note-action-btn--danger"
                    disabled={busyId === note.id}
                    onClick={() => void removeNote(note)}
                  >
                    Delete
                  </button>
                </>
              ) : null}
            </div>
          </>
        )}
      </div>
    );
  };

  return (
    <div className={`team-notes-panel${compact ? ' team-notes-panel--compact' : ''}`}>
      {title ? (
        <div className="team-notes-header">
          <div className="team-notes-title">{title}</div>
        </div>
      ) : null}

      {notes.length > 0 || loading ? (
        <div className="team-notes-list">
          {loading ? (
            <div className="team-notes-empty">Loading notes…</div>
          ) : (
            roots.map((note) => (
              <div key={note.id} className="team-note-thread">
                {renderNote(note, false)}
                {(repliesByParent.get(note.id) ?? []).map((reply) => renderNote(reply, true))}
              </div>
            ))
          )}
        </div>
      ) : null}

      <div className="team-notes-compose">
        {replyTo ? (
          <div className="team-notes-replying">
            <span>
              Replying to <strong>{replyTo.authorName}</strong>
            </span>
            <button type="button" className="team-note-action-btn" onClick={() => setReplyTo(null)}>
              Cancel
            </button>
          </div>
        ) : null}
        <textarea
          ref={textareaRef}
          className="team-notes-input"
          rows={compact ? 2 : 2}
          value={draft}
          onChange={(e) => onDraftChange(e.target.value)}
          placeholder={
            replyTo
              ? `Reply to ${replyTo.authorName}… @mention to notify`
              : 'Write a note for the team… @mention to notify'
          }
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
            {posting ? 'Posting…' : replyTo ? 'Post reply' : 'Post note'}
          </button>
        </div>
      </div>
    </div>
  );
}
