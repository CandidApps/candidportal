'use client';

import { useRef } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { CHAT_ATTACHMENT_ACCEPT } from '@/lib/chat-attachments';
import type { ChatAttachment } from '@/lib/chat-attachments';

export function ChatAttachmentChips({
  attachments,
  onRemoveAttachment,
  variant = 'assistant',
}: {
  attachments: ChatAttachment[];
  onRemoveAttachment: (id: string) => void;
  variant?: 'assistant' | 'chat';
}) {
  if (!attachments.length) return null;

  return (
    <div className={`chat-attachment-list chat-attachment-list--${variant}`}>
      {attachments.map((a) => (
        <div
          key={a.id}
          className={`chat-attachment-chip${a.status === 'error' ? ' chat-attachment-chip--error' : ''}`}
          title={a.error ?? `${(a.size / 1024).toFixed(0)} KB`}
        >
          <AppIcon name="file" size={11} />
          <span className="chat-attachment-chip__name">{a.name}</span>
          {a.status === 'ready' && !a.text && (
            <span className="chat-attachment-chip__status">Reading…</span>
          )}
          {a.status === 'error' && <span className="chat-attachment-chip__status">Failed</span>}
          <button
            type="button"
            className="chat-attachment-chip__remove"
            onClick={() => onRemoveAttachment(a.id)}
            aria-label={`Remove ${a.name}`}
          >
            <AppIcon name="close" size={10} />
          </button>
        </div>
      ))}
    </div>
  );
}

export function ChatAttachmentUploadButton({
  processing,
  canAddMore,
  onAddFiles,
  variant = 'assistant',
}: {
  processing: boolean;
  canAddMore: boolean;
  onAddFiles: (files: FileList | File[]) => void | Promise<void>;
  variant?: 'assistant' | 'chat';
}) {
  const fileRef = useRef<HTMLInputElement>(null);

  return (
    <>
      <input
        ref={fileRef}
        type="file"
        accept={CHAT_ATTACHMENT_ACCEPT}
        multiple
        style={{ display: 'none' }}
        onChange={(e) => {
          const files = e.target.files;
          e.target.value = '';
          if (files?.length) void onAddFiles(files);
        }}
      />
      <button
        type="button"
        className={`chat-attachment-upload chat-attachment-upload--${variant}`}
        onClick={() => fileRef.current?.click()}
        disabled={!canAddMore || processing}
        title={
          canAddMore
            ? 'Attach PDF, image, CSV, Excel, or text file'
            : 'Maximum attachments reached'
        }
        aria-label="Attach file"
      >
        <AppIcon name="file" size={14} />
      </button>
    </>
  );
}
