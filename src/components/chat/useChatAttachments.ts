'use client';

import { useCallback, useState } from 'react';
import {
  CHAT_ATTACHMENT_MAX_FILES,
  extractChatAttachmentText,
  newAttachmentId,
  type ChatAttachment,
} from '@/lib/chat-attachments';

export function useChatAttachments() {
  const [attachments, setAttachments] = useState<ChatAttachment[]>([]);
  const [processing, setProcessing] = useState(false);

  const addFiles = useCallback(
    async (files: FileList | File[]) => {
      const list = [...files];
      if (!list.length) return;

      setProcessing(true);
      try {
        const available = CHAT_ATTACHMENT_MAX_FILES - attachments.length;
        if (available <= 0) return;

        for (const file of list.slice(0, available)) {
          const id = newAttachmentId();
          setAttachments((prev) => [
            ...prev,
            { id, name: file.name, size: file.size, text: '', status: 'ready' },
          ]);

          try {
            const text = await extractChatAttachmentText(file);
            setAttachments((prev) =>
              prev.map((a) => (a.id === id ? { ...a, text, status: 'ready' as const } : a)),
            );
          } catch (err) {
            setAttachments((prev) =>
              prev.map((a) =>
                a.id === id
                  ? {
                      ...a,
                      status: 'error' as const,
                      error: err instanceof Error ? err.message : 'Failed to read file',
                    }
                  : a,
              ),
            );
          }
        }
      } finally {
        setProcessing(false);
      }
    },
    [attachments.length],
  );

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id));
  }, []);

  const clearAttachments = useCallback(() => {
    setAttachments([]);
  }, []);

  const readyAttachments = attachments.filter((a) => a.status === 'ready' && a.text.trim());

  return {
    attachments,
    readyAttachments,
    processing,
    addFiles,
    removeAttachment,
    clearAttachments,
    canAddMore: attachments.length < CHAT_ATTACHMENT_MAX_FILES,
  };
}
