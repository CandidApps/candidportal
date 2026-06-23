import { looksLikeHtml, richHtmlToPlainText, sanitizeRichHtml } from '@/lib/rich-text';

type RichTextContentProps = {
  content: string;
  className?: string;
  style?: React.CSSProperties;
};

export function RichTextContent({ content, className = '', style }: RichTextContentProps) {
  const trimmed = content.trim();
  if (!trimmed) {
    return <span style={style}>—</span>;
  }

  if (!looksLikeHtml(trimmed)) {
    return (
      <div className={`rich-text-content ${className}`.trim()} style={{ whiteSpace: 'pre-wrap', ...style }}>
        {trimmed}
      </div>
    );
  }

  return (
    <div
      className={`rich-text-content ${className}`.trim()}
      style={style}
      dangerouslySetInnerHTML={{ __html: sanitizeRichHtml(trimmed) }}
    />
  );
}

export { richHtmlToPlainText };
