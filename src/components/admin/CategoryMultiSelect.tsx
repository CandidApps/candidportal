'use client';

import type { ProviderCategory } from '@/lib/provider-categories';
import { PROVIDER_CATEGORY_OPTIONS } from '@/lib/provider-categories';

export function CategoryMultiSelect({
  value,
  onChange,
  disabled,
}: {
  value: ProviderCategory[];
  onChange: (next: ProviderCategory[]) => void;
  disabled?: boolean;
}) {
  const toggle = (category: ProviderCategory) => {
    if (disabled) return;
    if (value.includes(category)) {
      const next = value.filter((c) => c !== category);
      onChange(next.length ? next : value);
      return;
    }
    onChange([...value, category]);
  };

  return (
    <div className="category-multi-select" role="group" aria-label="Service categories">
      {PROVIDER_CATEGORY_OPTIONS.map((option) => {
        const selected = value.includes(option.value);
        return (
          <button
            key={option.value}
            type="button"
            className={`category-multi-select-chip${selected ? ' is-selected' : ''}`}
            aria-pressed={selected}
            disabled={disabled}
            onClick={() => toggle(option.value)}
          >
            {option.label}
          </button>
        );
      })}
    </div>
  );
}
