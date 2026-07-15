'use client';

import { AppIcon } from '@/components/AppIcon';
import {
  isNativelyViewable,
  isOfficeDocument,
  officeViewerUrl,
} from '@/lib/document-viewer';

/** Inline contract / agreement preview for split-pane modals (admin + member). */
export function ContractPreviewPane({
  url,
  loading,
  label,
  filename,
  onOpenFull,
  compact,
  emptyMessage = 'No contract file is available for this service yet.',
}: {
  url: string | null;
  loading?: boolean;
  label: string;
  filename?: string;
  onOpenFull?: () => void;
  compact?: boolean;
  emptyMessage?: string;
}) {
  const nameHint = filename || label;
  // Contract docs are almost always PDFs; API URLs rarely include an extension.
  const treatAsPdf =
    isNativelyViewable(nameHint, 'application/pdf') ||
    isNativelyViewable(url ?? undefined, null) ||
    Boolean(
      url &&
        !isOfficeDocument(nameHint, null) &&
        !/\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(nameHint),
    );
  const office = !treatAsPdf && isOfficeDocument(nameHint, null);
  const isImage = /\.(png|jpe?g|gif|webp|svg)(\?|$)/i.test(nameHint);

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        minHeight: compact ? 280 : 0,
        minWidth: 0,
        background: 'var(--surface-muted, #f8fafc)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 10,
          padding: '10px 14px',
          borderBottom: '1px solid var(--gray-border)',
          background: 'var(--card-bg, #fff)',
          flexShrink: 0,
        }}
      >
        <AppIcon name="file" size={14} />
        <div
          style={{
            flex: 1,
            minWidth: 0,
            fontSize: 12,
            fontWeight: 600,
            color: 'var(--gray-dark)',
            overflow: 'hidden',
            textOverflow: 'ellipsis',
            whiteSpace: 'nowrap',
          }}
          title={label}
        >
          {label}
        </div>
        {url ? (
          <>
            <a
              href={url}
              target="_blank"
              rel="noopener noreferrer"
              className="assist-mini-btn"
              style={{ textDecoration: 'none', fontSize: 11 }}
            >
              <AppIcon name="link" size={11} /> Open
            </a>
            {onOpenFull ? (
              <button type="button" className="assist-mini-btn" onClick={onOpenFull}>
                Expand
              </button>
            ) : null}
          </>
        ) : null}
      </div>
      <div style={{ flex: 1, minHeight: 0, position: 'relative' }}>
        {loading ? (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              minHeight: 280,
              fontSize: 13,
              color: 'var(--gray)',
            }}
          >
            Loading contract…
          </div>
        ) : !url ? (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              height: '100%',
              minHeight: 280,
              fontSize: 13,
              color: 'var(--gray)',
              padding: 24,
              textAlign: 'center',
            }}
          >
            {emptyMessage}
          </div>
        ) : isImage ? (
          <img
            src={url}
            alt={label}
            style={{ width: '100%', height: '100%', objectFit: 'contain', display: 'block' }}
          />
        ) : treatAsPdf ? (
          <iframe
            src={url}
            title={label}
            style={{ width: '100%', height: '100%', minHeight: 320, border: 'none', display: 'block' }}
          />
        ) : office ? (
          <iframe
            src={officeViewerUrl(url)}
            title={label}
            style={{ width: '100%', height: '100%', minHeight: 320, border: 'none', display: 'block' }}
          />
        ) : (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              gap: 12,
              height: '100%',
              minHeight: 280,
              padding: 24,
              textAlign: 'center',
            }}
          >
            <AppIcon name="file" size={28} />
            <p style={{ margin: 0, fontSize: 13, color: 'var(--gray)' }}>
              This file type can&apos;t be previewed inline.
            </p>
            <a className="assist-mini-btn primary" href={url} target="_blank" rel="noopener noreferrer">
              Open / download
            </a>
          </div>
        )}
      </div>
    </div>
  );
}
