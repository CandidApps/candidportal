'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { CustomerMessageAttachment } from '@/lib/customer-message-attachments';

function attachmentHref(a: CustomerMessageAttachment): string {
  if (a.url) return a.url;
  if (!a.path || a.path.startsWith('local/')) return '';
  return `/api/customer-messages/attachment?path=${encodeURIComponent(a.path)}`;
}

function isImageAttachment(a: CustomerMessageAttachment): boolean {
  if (a.type.startsWith('image/')) return true;
  return /\.(png|jpe?g|gif|webp|bmp|svg)$/i.test(a.name);
}

function isPdfAttachment(a: CustomerMessageAttachment): boolean {
  if (a.type === 'application/pdf') return true;
  return /\.pdf$/i.test(a.name);
}

type PreviewState = {
  href: string;
  name: string;
  kind: 'image' | 'pdf';
};

export function MessageAttachments({
  attachments,
}: {
  attachments?: CustomerMessageAttachment[] | null;
}) {
  const list = useMemo(
    () => (attachments ?? []).filter((a) => Boolean(a?.path || a?.name)),
    [attachments],
  );
  const [preview, setPreview] = useState<PreviewState | null>(null);

  useEffect(() => {
    if (!preview) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setPreview(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [preview]);

  if (!list.length) return null;

  return (
    <>
      <div className="mc-msg-attachments">
        {list.map((a, i) => {
          const href = attachmentHref(a);
          const image = isImageAttachment(a);
          const pdf = isPdfAttachment(a);
          const key = `${a.path || a.name}-${i}`;

          if (image && href) {
            return (
              <button
                key={key}
                type="button"
                className="mc-attach-thumb"
                title={a.name}
                onClick={() => setPreview({ href, name: a.name, kind: 'image' })}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={href} alt={a.name} loading="lazy" />
                <span>{a.name}</span>
              </button>
            );
          }

          if (!href) {
            return (
              <span key={key} className="mc-attach-chip">
                <AppIcon name="file" size={11} /> {a.name}
              </span>
            );
          }

          if (pdf) {
            return (
              <button
                key={key}
                type="button"
                className="mc-attach-chip"
                onClick={() => setPreview({ href, name: a.name, kind: 'pdf' })}
              >
                <AppIcon name="file" size={11} /> {a.name}
              </button>
            );
          }

          return (
            <a
              key={key}
              className="mc-attach-chip"
              href={href}
              target="_blank"
              rel="noreferrer"
            >
              <AppIcon name="file" size={11} /> {a.name}
            </a>
          );
        })}
      </div>

      {preview ? (
        <div
          className="mc-attach-lightbox"
          role="dialog"
          aria-modal="true"
          aria-label={preview.name}
          onClick={() => setPreview(null)}
        >
          <div
            className={`mc-attach-lightbox-panel${preview.kind === 'pdf' ? ' is-pdf' : ''}`}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mc-attach-lightbox-bar">
              <strong>{preview.name}</strong>
              <div className="mc-attach-lightbox-actions">
                <a href={preview.href} target="_blank" rel="noreferrer" className="mc-text-btn">
                  Open
                </a>
                <button type="button" className="mc-icon-btn" onClick={() => setPreview(null)}>
                  ×
                </button>
              </div>
            </div>
            {preview.kind === 'image' ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img src={preview.href} alt={preview.name} className="mc-attach-lightbox-img" />
            ) : (
              <iframe title={preview.name} src={preview.href} className="mc-attach-lightbox-frame" />
            )}
          </div>
        </div>
      ) : null}
    </>
  );
}
