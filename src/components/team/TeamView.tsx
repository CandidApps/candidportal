'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import type { TeamMember } from '@/lib/admin-action-work';
import type { InternalCommissionParticipant } from '@/lib/team/internal-participant-types';
import type { InternalDealSplit } from '@/lib/services/internal-deal-splits-db';
import { TeamMemberDetailPage } from '@/components/team/TeamMemberDetailPage';

const BRAND = {
  red: 'var(--red)',
  grayDark: 'var(--gray-dark)',
  gray: 'var(--gray)',
  grayLight: 'var(--gray-light)',
  grayBorder: 'var(--gray-border)',
  white: 'var(--white)',
  green: 'var(--green)',
  amber: 'var(--amber)',
  blue: 'var(--blue)',
} as const;

const TabBtn: React.FC<{ label: string; active: boolean; onClick: () => void }> = ({
  label,
  active,
  onClick,
}) => (
  <button
    type="button"
    onClick={onClick}
    style={{
      background: 'none',
      border: 'none',
      borderBottom: active ? `2px solid ${BRAND.red}` : '2px solid transparent',
      padding: '12px 14px',
      fontFamily: 'var(--font-sans)',
      fontSize: 13,
      fontWeight: active ? 600 : 500,
      color: active ? BRAND.grayDark : BRAND.gray,
      cursor: 'pointer',
      marginBottom: -1,
    }}
  >
    {label}
  </button>
);

const StatCard: React.FC<{
  label: string;
  value: string;
  sub: string;
  accent?: string;
}> = ({ label, value, sub, accent }) => (
  <div
    style={{
      background: BRAND.white,
      border: `1px solid ${BRAND.grayBorder}`,
      borderLeft: accent ? `3px solid ${accent}` : undefined,
      borderRadius: 8,
      padding: '14px 18px',
    }}
  >
    <div
      style={{
        fontSize: 10,
        fontWeight: 700,
        letterSpacing: '0.1em',
        textTransform: 'uppercase',
        color: accent || BRAND.gray,
        marginBottom: 6,
      }}
    >
      {label}
    </div>
    <div
      style={{
        fontFamily: 'var(--font-mono)',
        fontSize: 22,
        fontWeight: 600,
        color: BRAND.grayDark,
        letterSpacing: '-0.03em',
      }}
    >
      {value}
    </div>
    <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 2 }}>{sub}</div>
  </div>
);

function participantTypeLabel(type: InternalCommissionParticipant['participantType']): string {
  if (type === 'internal_employee') return 'Internal employee';
  if (type === 'inactive') return 'Not on commission';
  return 'Partner';
}

export function TeamView({
  onSelectCustomer,
}: {
  onSelectCustomer?: (customerId: string) => void;
}) {
  const [participants, setParticipants] = useState<InternalCommissionParticipant[]>([]);
  const [dealSplitOverrides, setDealSplitOverrides] = useState<InternalDealSplit[]>([]);
  const [roster, setRoster] = useState<TeamMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [migrationRequired, setMigrationRequired] = useState(false);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState<'all' | 'partner' | 'internal_employee' | 'inactive'>('all');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [addOpen, setAddOpen] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const [participantsRes, splitsRes] = await Promise.all([
        fetch('/api/admin/team-participants', { cache: 'no-store' }),
        fetch('/api/admin/deal-splits', { cache: 'no-store' }),
      ]);
      const json = (await participantsRes.json()) as {
        participants?: InternalCommissionParticipant[];
        roster?: TeamMember[];
        migrationRequired?: boolean;
        error?: string;
      };
      if (!participantsRes.ok) throw new Error(json.error ?? `Failed (${participantsRes.status})`);
      setParticipants(json.participants ?? []);
      setRoster(json.roster ?? []);
      setMigrationRequired(Boolean(json.migrationRequired));
      if (splitsRes.ok) {
        const splitsJson = (await splitsRes.json()) as { splits?: InternalDealSplit[] };
        setDealSplitOverrides(splitsJson.splits ?? []);
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load team');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selected = useMemo(
    () => participants.find((p) => p.profileId === selectedId) ?? null,
    [participants, selectedId],
  );

  const availableToAdd = useMemo(() => {
    const existing = new Set(participants.map((p) => p.profileId));
    return roster.filter((m) => !existing.has(m.id));
  }, [participants, roster]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return participants.filter((p) => {
      if (filter !== 'all' && p.participantType !== filter) return false;
      if (!q) return true;
      return (
        p.displayName.toLowerCase().includes(q) ||
        p.email.toLowerCase().includes(q)
      );
    });
  }, [participants, filter, search]);

  const stats = useMemo(
    () => ({
      total: participants.length,
      partners: participants.filter((p) => p.participantType === 'partner' && p.status === 'active').length,
      employees: participants.filter((p) => p.participantType === 'internal_employee' && p.status === 'active').length,
      shareTotal: participants
        .filter((p) => p.participantType === 'partner' && p.status === 'active')
        .reduce((s, p) => s + p.defaultHouseSharePercent, 0),
    }),
    [participants],
  );

  const handleAdd = async (profileId: string) => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/team-participants', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ profileId, participantType: 'partner', defaultHouseSharePercent: 0 }),
      });
      const json = (await res.json()) as { participants?: InternalCommissionParticipant[]; error?: string };
      if (!res.ok) throw new Error(json.error ?? 'Failed to add');
      setParticipants(json.participants ?? []);
      setAddOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add member');
    } finally {
      setSaving(false);
    }
  };

  if (selected) {
    return (
      <TeamMemberDetailPage
        member={selected}
        participants={participants}
        dealSplitOverrides={dealSplitOverrides}
        onBack={() => setSelectedId(null)}
        onRefresh={load}
        onSelectCustomer={onSelectCustomer}
      />
    );
  }

  return (
    <div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 12, marginBottom: 16 }}>
        <StatCard label="Team on commission" value={String(stats.total)} sub="Configured participants" accent={BRAND.blue} />
        <StatCard label="Partners" value={String(stats.partners)} sub="House-net split" accent={BRAND.green} />
        <StatCard label="Internal employees" value={String(stats.employees)} sub="% of house net" accent={BRAND.amber} />
        <StatCard
          label="Partner split total"
          value={`${stats.shareTotal}%`}
          sub={Math.abs(stats.shareTotal - 100) < 0.01 ? 'Balanced' : 'Should total 100%'}
          accent={BRAND.red}
        />
      </div>

      {migrationRequired && (
        <div
          style={{
            marginBottom: 16,
            padding: '12px 16px',
            borderRadius: 8,
            background: 'var(--amber-light)',
            border: '1px solid rgba(217, 119, 6, 0.25)',
            fontSize: 13,
            color: 'var(--amber)',
          }}
        >
          Apply migration <code>0064_internal_commission_participants.sql</code> in Supabase to save team settings.
        </div>
      )}

      {error && (
        <div style={{ marginBottom: 16, fontSize: 13, color: 'var(--red)' }}>{error}</div>
      )}

      <div style={{ background: BRAND.white, border: `1px solid ${BRAND.grayBorder}`, borderRadius: 10, overflow: 'hidden' }}>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            borderBottom: `1px solid ${BRAND.grayBorder}`,
            padding: '0 20px',
            flexWrap: 'wrap',
            gap: 8,
          }}
        >
          {(
            [
              ['all', 'All'],
              ['partner', 'Partners'],
              ['internal_employee', 'Employees'],
              ['inactive', 'Inactive'],
            ] as const
          ).map(([tab, label]) => (
            <TabBtn key={tab} label={label} active={filter === tab} onClick={() => setFilter(tab)} />
          ))}
          <div style={{ marginLeft: 'auto', display: 'flex', gap: 8, padding: '10px 0' }}>
            <input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Search team…"
              style={{
                padding: '8px 12px',
                border: `1px solid ${BRAND.grayBorder}`,
                borderRadius: 6,
                fontSize: 13,
                width: 200,
              }}
            />
            <button
              type="button"
              className="admin-ticket-btn primary"
              onClick={() => setAddOpen((v) => !v)}
              disabled={!availableToAdd.length}
            >
              Add member
            </button>
          </div>
        </div>

        {addOpen && (
          <div style={{ padding: '12px 20px', borderBottom: `1px solid ${BRAND.grayBorder}`, background: BRAND.grayLight }}>
            <div style={{ fontSize: 12, fontWeight: 600, marginBottom: 8 }}>Add from admin roster</div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
              {availableToAdd.map((m) => (
                <button
                  key={m.id}
                  type="button"
                  className="admin-ticket-btn"
                  disabled={saving}
                  onClick={() => void handleAdd(m.id)}
                >
                  {m.displayName}
                </button>
              ))}
              {!availableToAdd.length && (
                <span style={{ fontSize: 12, color: BRAND.gray }}>Everyone on the admin roster is already added.</span>
              )}
            </div>
          </div>
        )}

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13, minWidth: 800 }}>
            <thead>
              <tr style={{ background: BRAND.grayLight }}>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: BRAND.gray }}>Name</th>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: BRAND.gray }}>Role</th>
                <th style={{ padding: '11px 16px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: BRAND.gray }}>Status</th>
                <th style={{ padding: '11px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: BRAND.gray }}>House %</th>
                <th style={{ padding: '11px 16px', textAlign: 'right', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', color: BRAND.gray }}>Employee %</th>
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: BRAND.gray }}>
                    Loading team…
                  </td>
                </tr>
              ) : filtered.length === 0 ? (
                <tr>
                  <td colSpan={5} style={{ padding: 40, textAlign: 'center', color: BRAND.gray }}>
                    No team members configured. Add someone from the admin roster to set up house splits.
                  </td>
                </tr>
              ) : (
                filtered.map((p) => (
                  <tr
                    key={p.profileId}
                    style={{ cursor: 'pointer', borderTop: `1px solid ${BRAND.grayBorder}` }}
                    onClick={() => setSelectedId(p.profileId)}
                  >
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ fontWeight: 600 }}>{p.displayName}</div>
                      <div style={{ fontSize: 11, color: BRAND.gray }}>{p.email}</div>
                    </td>
                    <td style={{ padding: '12px 16px' }}>{participantTypeLabel(p.participantType)}</td>
                    <td style={{ padding: '12px 16px', textTransform: 'capitalize' }}>{p.status}</td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {p.participantType === 'partner' ? `${p.defaultHouseSharePercent}%` : '—'}
                    </td>
                    <td style={{ padding: '12px 16px', textAlign: 'right', fontFamily: 'var(--font-mono)' }}>
                      {p.participantType === 'internal_employee' && p.houseShareRateOfNet != null
                        ? `${p.houseShareRateOfNet}%`
                        : '—'}
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
