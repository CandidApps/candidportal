'use client';

/** Inline document viewer for PDFs and images (TASK-030). */
export function DocumentEmbed({
  url,
  title,
  filename,
  mimeType,
  emptyMessage = 'No document available.',
}: {
  url: string | null | undefined;
  title: string;
  filename?: string;
  mimeType?: string | null;
  emptyMessage?: string;
}) {
  if (!url) {
    return (
      <div className="document-embed document-embed--empty">
        <p>{emptyMessage}</p>
      </div>
    );
  }

  const mime = (mimeType ?? '').toLowerCase();
  const isPdf = mime.includes('pdf') || /\.pdf$/i.test(filename ?? url);
  const isImage = mime.startsWith('image/') || /\.(png|jpe?g|gif|webp)$/i.test(filename ?? url);

  return (
    <div className="document-embed">
      {filename ? (
        <div className="document-embed-bar">
          <span className="document-embed-filename">{filename}</span>
        </div>
      ) : null}
      {isImage ? (
        <img className="document-embed-image" src={url} alt={title} />
      ) : (
        <iframe className="document-embed-frame" src={url} title={title} />
      )}
    </div>
  );
}
