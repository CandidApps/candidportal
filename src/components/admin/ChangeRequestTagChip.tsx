'use client';

import { changeTagToneIndex } from '@/lib/services/product-change-requests';

export function ChangeRequestTagChip({
  tag,
  size = 'md',
  onRemove,
}: {
  tag: string;
  size?: 'md' | 'sm';
  onRemove?: () => void;
}) {
  const tone = changeTagToneIndex(tag);
  return (
    <span
      className={`roadmap-tag-chip${size === 'sm' ? ' roadmap-tag-chip--sm' : ''}`}
      data-tone={tone}
    >
      {tag}
      {onRemove && (
        <button
          type="button"
          className="roadmap-tag-chip-remove"
          aria-label={`Remove ${tag}`}
          onClick={onRemove}
        >
          ×
        </button>
      )}
    </span>
  );
}
