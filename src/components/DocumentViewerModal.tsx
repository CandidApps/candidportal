'use client';

import { useEffect } from 'react';
import { AppIcon } from '@/components/AppIcon';
import {
  isNativelyViewable,
  isOfficeDocument,
  officeViewerUrl,
  type DocumentViewerRequest,
} from '@/lib/document-viewer';

/** In-portal popup that renders PDFs/images natively and Office docs via the
 *  Office Online embed viewer, with a download fallback (TASK-030). */
export function DocumentViewerModal({
  request,
  onClose,
}: {
  request: DocumentViewerRequest;
  onClose: () => void;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [onClose]);

  const { url, title, filename, mimeType } = request;
  const label = title || filename || 'Document';
  const native = isNativelyViewable(filename, mimeType);
  const office = !native && isOfficeDocument(filename, mimeType);
  const isImage =
    (mimeType ?? '').toLowerCase().startsWith('image/') ||
    /\.(png|jpe?g|gif|webp|svg)$/i.test(filename ?? url);

  return (
    <div className="modal-overlay open doc-viewer-overlay">
      <div className="modal-box doc-viewer-box" role="dialog" aria-label={label}>
        <div className="doc-viewer-head">
          <div className="doc-viewer-title">
            <AppIcon name="file" size={14} /> {label}
          </div>
          <div className="doc-viewer-head-actions">
            <a className="assist-mini-btn" href={url} target="_blank" rel="noopener noreferrer">
              <AppIcon name="link" size={11} /> Open
            </a>
            <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
              <AppIcon name="close" size={14} />
            </button>
          </div>
        </div>
        <div className="doc-viewer-body">
          {isImage ? (
            <img className="doc-viewer-image" src={url} alt={label} />
          ) : native ? (
            <iframe className="doc-viewer-frame" src={url} title={label} />
          ) : office ? (
            <iframe className="doc-viewer-frame" src={officeViewerUrl(url)} title={label} />
          ) : (
            <div className="doc-viewer-fallback">
              <AppIcon name="file" size={28} />
              <p>This file type can&apos;t be previewed inline.</p>
              <a className="assist-mini-btn primary" href={url} target="_blank" rel="noopener noreferrer">
                <AppIcon name="link" size={11} /> Open / download
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
