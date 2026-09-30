'use client';

import { useCallback, useState, type CSSProperties, type ReactNode } from 'react';
import { AppIcon } from '@/components/AppIcon';

/**
 * Fields that already hold a value (loaded, parsed or reparsed) render read-only until the pencil is clicked.
 * Typing into a blank field unlocks it so it doesn't lock itself after the first keystroke.
 */
export function useFieldLocks<K extends string>() {
  const [unlocked, setUnlocked] = useState<ReadonlySet<K>>(() => new Set());
  const unlock = useCallback((key: K) => {
    setUnlocked((prev) => (prev.has(key) ? prev : new Set([...prev, key])));
  }, []);
  const isLocked = useCallback(
    (key: K, value: string) => value.trim() !== '' && !unlocked.has(key),
    [unlocked],
  );
  return { isLocked, unlock };
}

export function LockableField({
  locked,
  display,
  onUnlock,
  inputStyle,
  label,
  children,
}: {
  locked: boolean;
  /** Text shown while locked. */
  display: string;
  onUnlock: () => void;
  inputStyle: CSSProperties;
  /** Accessible name for the pencil button, e.g. "Deal ID". */
  label: string;
  children: ReactNode;
}) {
  if (!locked) return <>{children}</>;
  return (
    <div
      style={{
        ...inputStyle,
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        background: '#F5F5F5',
        color: '#1E1E1E',
      }}
    >
      <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
        {display}
      </span>
      <button
        type="button"
        onClick={onUnlock}
        aria-label={`Edit ${label}`}
        title={`Edit ${label}`}
        style={{
          border: 'none',
          background: 'none',
          padding: 2,
          cursor: 'pointer',
          color: '#6B6B6B',
          display: 'inline-flex',
        }}
      >
        <AppIcon name="edit" size={12} />
      </button>
    </div>
  );
}
