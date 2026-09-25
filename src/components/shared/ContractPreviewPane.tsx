'use client';

import type { ReactNode } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  isNativelyViewable,
  isOfficeDocument,
  officeViewerUrl,
} from '@/lib/document-viewer';

/** Chrome’s PDF frame needs an absolute fill + min height or it paints black. */
function pdfFrameSrc(url: string): string {
  if (url.includes('#')) return url;
  return `${url}#view=FitH`;
}

/** Inline contract / agreement preview for split-pane modals (admin + member). */
export function ContractPreviewPane({
  url,
  loading,
  label,
  filename,
  onOpenFull,
  compact,
  emptyMessage = 'No contract file is available for this service yet.',
  headerActions,
  hideDefaultOpenExpand,
}: {
  url: string | null;
  loading?: boolean;
  label: string;
  filename?: string;
  onOpenFull?: () => void;
  compact?: boolean;
  emptyMessage?: string;
  /** Extra controls rendered in the preview header (Replace, Unlink, etc.). */
  headerActions?: ReactNode;
  /** When true, omit built-in Open/Expand (caller includes them in headerActions). */
  hideDefaultOpenExpand?: boolean;
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
        height: compact ? undefined : '100%',
        flex: compact ? undefined : 1,
        minWidth: 0,
        background: 'var(--surface-muted, #f8fafc)',
      }}
    >
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 14px',
          borderBottom: '1px solid var(--gray-border)',
          background: 'var(--card-bg, #fff)',
          flexShrink: 0,
          flexWrap: 'wrap',
        }}
      >
        <AppIcon name="file" size={14} />
        <div
          style={{
            flex: 1,
            minWidth: 80,
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
        {headerActions}
        {!hideDefaultOpenExpand && url ? (
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
      <div
        style={{
          flex: 1,
          minHeight: compact ? 280 : 420,
          position: 'relative',
          display: 'flex',
          flexDirection: 'column',
        }}
      >
        {loading ? (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              flex: 1,
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
              flex: 1,
              minHeight: 280,
              fontSize: 13,
              color: 'var(--gray)',
              padding: 24,
              textAlign: 'center',
              lineHeight: 1.5,
            }}
          >
            {emptyMessage}
          </div>
        ) : isImage ? (
          <img
            src={url}
            alt={label}
            style={{
              width: '100%',
              height: '100%',
              objectFit: 'contain',
              display: 'block',
              flex: 1,
              minHeight: 320,
            }}
          />
        ) : treatAsPdf ? (
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: compact ? 320 : 420,
              width: '100%',
              background: '#525659',
            }}
          >
            <iframe
              src={pdfFrameSrc(url)}
              title={label}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
                background: '#525659',
              }}
            />
          </div>
        ) : office ? (
          <div
            style={{
              position: 'relative',
              flex: 1,
              minHeight: compact ? 320 : 420,
              width: '100%',
            }}
          >
            <iframe
              src={officeViewerUrl(url)}
              title={label}
              style={{
                position: 'absolute',
                inset: 0,
                width: '100%',
                height: '100%',
                border: 'none',
                display: 'block',
              }}
            />
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              placeItems: 'center',
              gap: 12,
              flex: 1,
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
