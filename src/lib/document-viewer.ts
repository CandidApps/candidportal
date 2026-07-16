'use client';

/** Open any document (PDF, image, Office file) in an in-portal popup (TASK-030). */
export type DocumentViewerRequest = {
  url: string;
  title?: string;
  filename?: string;
  mimeType?: string | null;
};

export const DOCUMENT_VIEWER_EVENT = 'candid:open-document-viewer';

export function openDocumentViewer(req: DocumentViewerRequest) {
  if (typeof window === 'undefined' || !req.url) return;
  window.dispatchEvent(new CustomEvent<DocumentViewerRequest>(DOCUMENT_VIEWER_EVENT, { detail: req }));
}

/** True for files an <iframe>/<img> can render directly (no Office viewer needed). */
export function isNativelyViewable(filename?: string, mimeType?: string | null): boolean {
  const mime = (mimeType ?? '').toLowerCase();
  const name = (filename ?? '').toLowerCase();
  if (mime.includes('pdf') || /\.pdf$/.test(name)) return true;
  if (mime.startsWith('image/') || /\.(png|jpe?g|gif|webp|svg)$/.test(name)) return true;
  if (mime.startsWith('text/') || /\.(txt|csv|md|html?)$/.test(name)) return true;
  return false;
}

/** True for Office documents that need the Office Online embed viewer. */
export function isOfficeDocument(filename?: string, mimeType?: string | null): boolean {
  const mime = (mimeType ?? '').toLowerCase();
  const name = (filename ?? '').toLowerCase();
  return (
    /\.(xlsx?|docx?|pptx?)$/.test(name) ||
    mime.includes('spreadsheet') ||
    mime.includes('wordprocessing') ||
    mime.includes('presentation') ||
    mime.includes('msword') ||
    mime.includes('ms-excel') ||
    mime.includes('ms-powerpoint')
  );
}

export function officeViewerUrl(fileUrl: string): string {
  return `https://view.officeapps.live.com/op/embed.aspx?src=${encodeURIComponent(fileUrl)}`;
}
