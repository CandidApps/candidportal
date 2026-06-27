'use client';

import { useEffect, useState } from 'react';
import {
  DOCUMENT_VIEWER_EVENT,
  type DocumentViewerRequest,
} from '@/lib/document-viewer';
import { DocumentViewerModal } from '@/components/DocumentViewerModal';

/** Global listener so any portal surface can open a document popup (TASK-030). */
export function DocumentViewerHost() {
  const [request, setRequest] = useState<DocumentViewerRequest | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<DocumentViewerRequest>).detail;
      if (detail?.url) setRequest(detail);
    };
    window.addEventListener(DOCUMENT_VIEWER_EVENT, onOpen);
    return () => window.removeEventListener(DOCUMENT_VIEWER_EVENT, onOpen);
  }, []);

  if (!request) return null;
  return <DocumentViewerModal request={request} onClose={() => setRequest(null)} />;
}
