'use client';

export type SortDirection = 'asc' | 'desc';

export function toggleSortKey<T extends string>(
  currentKey: T,
  currentDir: SortDirection,
  nextKey: T,
  defaultDir: SortDirection = 'asc',
): { key: T; dir: SortDirection } {
  if (currentKey === nextKey) {
    return { key: nextKey, dir: currentDir === 'asc' ? 'desc' : 'asc' };
  }
  return { key: nextKey, dir: defaultDir };
}

export function SortableTableHeader({
  label,
  active,
  direction,
  onClick,
  align = 'left',
}: {
  label: string;
  active: boolean;
  direction: SortDirection;
  onClick: () => void;
  align?: 'left' | 'right';
}) {
  return (
    <th className={`admin-table-sort-th${active ? ' is-active' : ''}`} style={{ textAlign: align }}>
      <button type="button" className="admin-table-sort-btn" onClick={onClick}>
        <span>{label}</span>
        <span className="admin-table-sort-indicator" aria-hidden>
          {active ? (direction === 'asc' ? '↑' : '↓') : '↕'}
        </span>
      </button>
    </th>
  );
}
