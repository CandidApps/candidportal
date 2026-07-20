'use client';

import { useMemo, useState } from 'react';
import type { CandidContractRecord } from '@/lib/customer-records';
import type { Location } from '@/components/CustomersView';
import {
  MERGE_FIELD_DEFS,
  buildMergedContract,
  defaultKeepSide,
  defaultMergePicks,
  formatMergeFieldValue,
  mergeDealLabel,
  type MergeFieldKey,
  type MergeFieldPicks,
  type MergeFieldSide,
} from '@/lib/crm/merge-contracts';
import { BRAND } from '@/lib/ui/brand-tokens';

type Props = {
  contractA: CandidContractRecord;
  contractB: CandidContractRecord;
  locations: Location[];
  onClose: () => void;
  onMerge: (merged: CandidContractRecord, remove: CandidContractRecord) => void | Promise<void>;
};

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(15, 23, 42, 0.45)',
  zIndex: 1200,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  padding: 16,
};

const cardStyle: React.CSSProperties = {
  width: 1100,
  maxWidth: '96vw',
  maxHeight: 'min(92vh, 920px)',
  background: BRAND.white,
  borderRadius: 12,
  border: `1px solid ${BRAND.grayBorder}`,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  boxShadow: '0 20px 50px rgba(0,0,0,0.18)',
};

function locationLabel(locations: Location[], id: string): string {
  return locations.find((l) => l.id === id)?.label ?? id;
}

function valuesDiffer(a: CandidContractRecord, b: CandidContractRecord, key: MergeFieldKey): boolean {
  const left = formatMergeFieldValue(a, key);
  const right = formatMergeFieldValue(b, key);
  return left !== right;
}

export function MergeContractsModal({
  contractA,
  contractB,
  locations,
  onClose,
  onMerge,
}: Props) {
  const [keepSide, setKeepSide] = useState<MergeFieldSide>(() =>
    defaultKeepSide(contractA, contractB),
  );
  const [picks, setPicks] = useState<MergeFieldPicks>(() =>
    defaultMergePicks(contractA, contractB),
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [showOnlyDiffs, setShowOnlyDiffs] = useState(true);

  const locFmt = (id: string) => locationLabel(locations, id);

  const groups = useMemo(() => {
    const map = new Map<string, typeof MERGE_FIELD_DEFS>();
    for (const def of MERGE_FIELD_DEFS) {
      if (showOnlyDiffs && !valuesDiffer(contractA, contractB, def.key)) continue;
      const list = map.get(def.group) ?? [];
      list.push(def);
      map.set(def.group, list);
    }
    return [...map.entries()];
  }, [contractA, contractB, showOnlyDiffs]);

  const preview = useMemo(
    () => buildMergedContract(contractA, contractB, keepSide, picks),
    [contractA, contractB, keepSide, picks],
  );

  const setPick = (key: MergeFieldKey, side: MergeFieldSide) => {
    setPicks((prev) => ({ ...prev, [key]: side }));
  };

  const pickAllFrom = (side: MergeFieldSide) => {
    const next: MergeFieldPicks = {};
    for (const def of MERGE_FIELD_DEFS) next[def.key] = side;
    setPicks(next);
  };

  const submit = async () => {
    setSaving(true);
    setError('');
    try {
      const merged = buildMergedContract(contractA, contractB, keepSide, picks);
      const remove = keepSide === 'a' ? contractB : contractA;
      await onMerge(merged, remove);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Merge failed');
    } finally {
      setSaving(false);
    }
  };

  const sideHeader = (side: MergeFieldSide, ct: CandidContractRecord) => {
    const selected = keepSide === side;
    return (
      <button
        type="button"
        onClick={() => setKeepSide(side)}
        style={{
          textAlign: 'left',
          width: '100%',
          padding: '12px 14px',
          borderRadius: 8,
          border: `2px solid ${selected ? BRAND.red : BRAND.grayBorder}`,
          background: selected ? 'rgba(200,40,30,0.06)' : BRAND.grayLight,
          cursor: 'pointer',
        }}
      >
        <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.06em', textTransform: 'uppercase', color: BRAND.gray }}>
          Deal {side.toUpperCase()} {selected ? '· keep this record' : '· click to keep'}
        </div>
        <div style={{ fontSize: 14, fontWeight: 600, color: BRAND.grayDark, marginTop: 4 }}>
          {mergeDealLabel(ct)}
        </div>
        <div style={{ fontSize: 11, color: BRAND.gray, marginTop: 4 }}>
          {[ct.paySource, ct.dealStatus, ct.id.startsWith('ct-bmw-') ? 'BMW' : null]
            .filter(Boolean)
            .join(' · ')}
        </div>
      </button>
    );
  };

  return (
    <div
      style={overlayStyle}
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div style={cardStyle} role="dialog" aria-labelledby="merge-deals-title">
        <div
          style={{
            padding: '16px 20px',
            borderBottom: `1px solid ${BRAND.grayBorder}`,
            display: 'flex',
            alignItems: 'flex-start',
            justifyContent: 'space-between',
            gap: 12,
            flexShrink: 0,
          }}
        >
          <div style={{ minWidth: 0 }}>
            <div id="merge-deals-title" style={{ fontSize: 18, fontWeight: 700, color: BRAND.grayDark }}>
              Merge deals
            </div>
            <div style={{ fontSize: 12, color: BRAND.gray, marginTop: 4, lineHeight: 1.45 }}>
              Pick which deal to keep as the surviving record, then choose fields side by side.
              Deal ID / pay source / agent ID feed commissions — change those carefully.
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            style={{
              border: 'none',
              background: 'transparent',
              fontSize: 18,
              cursor: 'pointer',
              color: BRAND.gray,
              lineHeight: 1,
            }}
          >
            ✕
          </button>
        </div>

        <div style={{ padding: '14px 20px', borderBottom: `1px solid ${BRAND.grayBorder}`, flexShrink: 0 }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: '1fr 1fr',
              gap: 12,
            }}
          >
            {sideHeader('a', contractA)}
            {sideHeader('b', contractB)}
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 12, alignItems: 'center' }}>
            <button type="button" onClick={() => pickAllFrom('a')} style={chipBtn}>
              Use all from A
            </button>
            <button type="button" onClick={() => pickAllFrom('b')} style={chipBtn}>
              Use all from B
            </button>
            <button
              type="button"
              onClick={() => setPicks(defaultMergePicks(contractA, contractB))}
              style={chipBtn}
            >
              Reset smart defaults
            </button>
            <label style={{ marginLeft: 'auto', fontSize: 12, color: BRAND.grayDark, display: 'inline-flex', gap: 6, alignItems: 'center' }}>
              <input
                type="checkbox"
                checked={showOnlyDiffs}
                onChange={(e) => setShowOnlyDiffs(e.target.checked)}
              />
              Show differences only
            </label>
          </div>
        </div>

        <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: '8px 20px 16px' }}>
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'minmax(140px, 0.9fr) 1fr 1fr',
              gap: 0,
              position: 'sticky',
              top: 0,
              background: BRAND.white,
              zIndex: 1,
              padding: '8px 0',
              borderBottom: `1px solid ${BRAND.grayBorder}`,
              fontSize: 10,
              fontWeight: 700,
              letterSpacing: '0.06em',
              textTransform: 'uppercase',
              color: BRAND.gray,
            }}
          >
            <div>Field</div>
            <div>Deal A</div>
            <div>Deal B</div>
          </div>

          {groups.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', color: BRAND.gray, fontSize: 13 }}>
              These deals look identical on every mergeable field.
            </div>
          ) : (
            groups.map(([group, fields]) => (
              <div key={group} style={{ marginTop: 14 }}>
                <div
                  style={{
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: '0.08em',
                    textTransform: 'uppercase',
                    color: BRAND.gray,
                    marginBottom: 6,
                  }}
                >
                  {group}
                </div>
                {fields.map((def) => {
                  const side = picks[def.key] ?? keepSide;
                  const aVal = formatMergeFieldValue(contractA, def.key, locFmt);
                  const bVal = formatMergeFieldValue(contractB, def.key, locFmt);
                  return (
                    <div
                      key={def.key}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(140px, 0.9fr) 1fr 1fr',
                        gap: 8,
                        padding: '8px 0',
                        borderBottom: `1px solid ${BRAND.grayBorder}`,
                        alignItems: 'stretch',
                      }}
                    >
                      <div style={{ fontSize: 12, color: BRAND.grayDark, paddingTop: 8 }}>
                        {def.label}
                        {def.sacred ? (
                          <div style={{ fontSize: 10, color: BRAND.amber, marginTop: 2 }}>Commission-sensitive</div>
                        ) : null}
                      </div>
                      <FieldPick
                        selected={side === 'a'}
                        value={aVal}
                        onSelect={() => setPick(def.key, 'a')}
                      />
                      <FieldPick
                        selected={side === 'b'}
                        value={bVal}
                        onSelect={() => setPick(def.key, 'b')}
                      />
                    </div>
                  );
                })}
              </div>
            ))
          )}

          <div
            style={{
              marginTop: 18,
              padding: 12,
              borderRadius: 8,
              background: BRAND.grayLight,
              border: `1px solid ${BRAND.grayBorder}`,
            }}
          >
            <div style={{ fontSize: 11, fontWeight: 700, color: BRAND.gray, textTransform: 'uppercase', letterSpacing: '0.06em' }}>
              Result preview
            </div>
            <div style={{ fontSize: 13, fontWeight: 600, color: BRAND.grayDark, marginTop: 6 }}>
              {mergeDealLabel(preview)}
            </div>
            <div style={{ fontSize: 12, color: BRAND.gray, marginTop: 4, lineHeight: 1.45 }}>
              Keeps record <code style={{ fontSize: 11 }}>{preview.id}</code>
              {preview.dealId ? <> · Deal ID {preview.dealId}</> : null}
              {preview.paySource ? <> · {preview.paySource}</> : null}
              {preview.mrc || preview.monthly
                ? <> · ${Number(preview.mrc ?? preview.monthly).toLocaleString()}/mo</>
                : null}
            </div>
          </div>
        </div>

        <div
          style={{
            padding: '14px 20px',
            borderTop: `1px solid ${BRAND.grayBorder}`,
            display: 'flex',
            justifyContent: 'flex-end',
            gap: 10,
            flexWrap: 'wrap',
            flexShrink: 0,
          }}
        >
          {error ? (
            <p style={{ margin: 0, marginRight: 'auto', fontSize: 12, color: 'var(--red, #C8281E)' }}>
              {error}
            </p>
          ) : null}
          <button type="button" onClick={onClose} disabled={saving} style={secondaryBtn}>
            Cancel
          </button>
          <button type="button" onClick={() => void submit()} disabled={saving} style={primaryBtn}>
            {saving ? 'Merging…' : 'Merge deals'}
          </button>
        </div>
      </div>
    </div>
  );
}

function FieldPick({
  selected,
  value,
  onSelect,
}: {
  selected: boolean;
  value: string;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onSelect}
      style={{
        textAlign: 'left',
        padding: '8px 10px',
        borderRadius: 7,
        border: `1.5px solid ${selected ? BRAND.red : BRAND.grayBorder}`,
        background: selected ? 'rgba(200,40,30,0.06)' : BRAND.white,
        cursor: 'pointer',
        fontSize: 12,
        color: value === '—' ? BRAND.gray : BRAND.grayDark,
        lineHeight: 1.4,
        whiteSpace: 'pre-wrap',
        wordBreak: 'break-word',
        minHeight: 40,
      }}
    >
      {value}
    </button>
  );
}

const chipBtn: React.CSSProperties = {
  border: `1px solid ${BRAND.grayBorder}`,
  background: BRAND.white,
  borderRadius: 6,
  padding: '6px 10px',
  fontSize: 11,
  fontWeight: 600,
  cursor: 'pointer',
  color: BRAND.grayDark,
};

const secondaryBtn: React.CSSProperties = {
  ...chipBtn,
  padding: '10px 16px',
  fontSize: 13,
};

const primaryBtn: React.CSSProperties = {
  ...secondaryBtn,
  background: BRAND.red,
  borderColor: BRAND.red,
  color: BRAND.white,
};
