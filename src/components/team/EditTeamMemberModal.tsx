'use client';

import { useState } from 'react';
import type {
  InternalCommissionParticipant,
  InternalParticipantType,
  InternalParticipantStatus,
} from '@/lib/team/internal-participant-types';

const PARTICIPANT_TYPES: { value: InternalParticipantType; label: string }[] = [
  { value: 'partner', label: 'Partner (house split)' },
  { value: 'internal_employee', label: 'Internal employee (% of house net)' },
  { value: 'inactive', label: 'Not on commission' },
];

export function EditTeamMemberModal({
  member,
  onClose,
  onSaved,
}: {
  member: InternalCommissionParticipant;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [participantType, setParticipantType] = useState<InternalParticipantType>(member.participantType);
  const [status, setStatus] = useState<InternalParticipantStatus>(member.status);
  const [houseSharePercent, setHouseSharePercent] = useState(String(member.defaultHouseSharePercent));
  const [employeeRate, setEmployeeRate] = useState(
    member.houseShareRateOfNet != null ? String(member.houseShareRateOfNet) : '',
  );
  const [optionalAgentCommId, setOptionalAgentCommId] = useState(member.optionalAgentCommId ?? '');
  const [notes, setNotes] = useState(member.notes ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [removing, setRemoving] = useState(false);

  const save = async () => {
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/admin/team-participants', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          profileId: member.profileId,
          patch: {
            participantType,
            status,
            defaultHouseSharePercent: Number(houseSharePercent) || 0,
            houseShareRateOfNet:
              participantType === 'internal_employee'
                ? Number(employeeRate) || 0
                : null,
            optionalAgentCommId: optionalAgentCommId.trim() || null,
            notes: notes.trim() || null,
          },
        }),
      });
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Save failed');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const remove = async () => {
    if (!window.confirm(`Remove ${member.displayName} from commission team?`)) return;
    setRemoving(true);
    setError('');
    try {
      const res = await fetch(
        `/api/admin/team-participants?profileId=${encodeURIComponent(member.profileId)}`,
        { method: 'DELETE' },
      );
      const json = (await res.json()) as { error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Remove failed');
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setRemoving(false);
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-card"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-title">Edit team member</div>
          <button type="button" className="modal-close" onClick={onClose} aria-label="Close">
            ×
          </button>
        </div>
        <div className="modal-body" style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          <div>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 4 }}>{member.displayName}</div>
            <div style={{ fontSize: 11, color: 'var(--gray)' }}>{member.email}</div>
          </div>

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Role
            <select
              value={participantType}
              onChange={(e) => setParticipantType(e.target.value as InternalParticipantType)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            >
              {PARTICIPANT_TYPES.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </label>

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Status
            <select
              value={status}
              onChange={(e) => setStatus(e.target.value as InternalParticipantStatus)}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            >
              <option value="active">Active</option>
              <option value="inactive">Inactive</option>
            </select>
          </label>

          {participantType === 'partner' && (
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              Default house share %
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={houseSharePercent}
                onChange={(e) => setHouseSharePercent(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
          )}

          {participantType === 'internal_employee' && (
            <label style={{ fontSize: 12, fontWeight: 600 }}>
              % of house net
              <input
                type="number"
                min={0}
                max={100}
                step={0.5}
                value={employeeRate}
                onChange={(e) => setEmployeeRate(e.target.value)}
                style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
              />
            </label>
          )}

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Linked BMW agent ID (optional, dual-role)
            <input
              value={optionalAgentCommId}
              onChange={(e) => setOptionalAgentCommId(e.target.value)}
              placeholder="Only if also paid as external agent"
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            />
          </label>

          <label style={{ fontSize: 12, fontWeight: 600 }}>
            Notes
            <textarea
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              rows={3}
              style={{ display: 'block', width: '100%', marginTop: 4, padding: 8 }}
            />
          </label>

          {error && <div style={{ fontSize: 12, color: 'var(--red)' }}>{error}</div>}
        </div>
        <div className="modal-footer" style={{ display: 'flex', justifyContent: 'space-between' }}>
          <button
            type="button"
            className="admin-ticket-btn"
            style={{ color: 'var(--red)' }}
            disabled={removing}
            onClick={() => void remove()}
          >
            {removing ? 'Removing…' : 'Remove from team'}
          </button>
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" className="btn-secondary" onClick={onClose}>
              Cancel
            </button>
            <button type="button" className="admin-ticket-btn primary" disabled={saving} onClick={() => void save()}>
              {saving ? 'Saving…' : 'Save'}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
