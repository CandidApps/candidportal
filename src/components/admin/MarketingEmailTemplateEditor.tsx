'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { isRichHtmlEmpty, looksLikeHtml, sanitizeEmailHtml } from '@/lib/rich-text';

type EditorMode = 'visual' | 'html' | 'preview';

type Props = {
  initialHtml?: string;
  title: string;
  onTitleChange: (title: string) => void;
  description: string;
  onDescriptionChange: (description: string) => void;
  tags: string;
  onTagsChange: (tags: string) => void;
  onHtmlChange?: (html: string) => void;
  saving?: boolean;
  error?: string;
  onCancel: () => void;
  onSave: (html: string) => void;
  saveLabel?: string;
  heading?: string;
};

export function extractBodyHtml(html: string): string {
  const trimmed = html.trim();
  if (!trimmed) return '';
  const bodyMatch = trimmed.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (bodyMatch?.[1] != null) return bodyMatch[1].trim();
  return trimmed;
}

/** Wrap fragment HTML in a simple email-safe document when needed. */
export function wrapEmailHtml(content: string): string {
  const trimmed = content.trim();
  if (!trimmed) {
    return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0B1220;background:#ffffff;">
</body>
</html>`;
  }
  if (/<html[\s>]/i.test(trimmed) || /<!DOCTYPE/i.test(trimmed)) {
    return trimmed;
  }
  return `<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Email</title>
</head>
<body style="margin:0;padding:24px;font-family:Arial,Helvetica,sans-serif;font-size:15px;line-height:1.5;color:#0B1220;background:#ffffff;">
${trimmed}
</body>
</html>`;
}

export function MarketingEmailTemplateEditor({
  initialHtml = '',
  title,
  onTitleChange,
  description,
  onDescriptionChange,
  tags,
  onTagsChange,
  onHtmlChange,
  saving = false,
  error = '',
  onCancel,
  onSave,
  saveLabel = 'Save template',
  heading = 'Email template',
}: Props) {
  const [mode, setMode] = useState<EditorMode>('visual');
  const [html, setHtml] = useState(() => wrapEmailHtml(initialHtml));
  const [insertOpen, setInsertOpen] = useState(false);
  const [insertSnippet, setInsertSnippet] = useState('');
  const editorRef = useRef<HTMLDivElement>(null);
  const [visualFocused, setVisualFocused] = useState(false);
  const lastInitial = useRef(initialHtml);

  const bodyHtml = useMemo(() => extractBodyHtml(html), [html]);
  const previewSrcDoc = useMemo(() => sanitizeEmailHtml(wrapEmailHtml(html)), [html]);

  useEffect(() => {
    if (initialHtml === lastInitial.current) return;
    lastInitial.current = initialHtml;
    const next = wrapEmailHtml(initialHtml);
    setHtml(next);
    onHtmlChange?.(next);
  }, [initialHtml, onHtmlChange]);

  useEffect(() => {
    const el = editorRef.current;
    if (!el || mode !== 'visual') return;
    if (!visualFocused && el.innerHTML !== bodyHtml) {
      el.innerHTML = bodyHtml;
    }
  }, [bodyHtml, mode, visualFocused]);

  const commitHtml = useCallback(
    (next: string) => {
      const wrapped = wrapEmailHtml(next);
      setHtml(wrapped);
      onHtmlChange?.(wrapped);
    },
    [onHtmlChange],
  );

  const emitFromVisual = useCallback(() => {
    if (!editorRef.current) return;
    commitHtml(editorRef.current.innerHTML);
  }, [commitHtml]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, arg);
      emitFromVisual();
    },
    [emitFromVisual],
  );

  const insertHtmlAtCaret = useCallback(
    (snippet: string) => {
      if (mode === 'html') {
        commitHtml(`${extractBodyHtml(html)}\n${snippet}`);
        return;
      }
      editorRef.current?.focus();
      document.execCommand('insertHTML', false, snippet);
      emitFromVisual();
    },
    [mode, html, commitHtml, emitFromVisual],
  );

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    if (mode === 'html') {
      commitHtml(`${extractBodyHtml(html)}<a href="${href}">${href}</a>`);
      return;
    }
    exec('createLink', href);
  };

  const addImage = () => {
    const url = window.prompt('Image URL (https://…)');
    if (!url) return;
    const src = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    insertHtmlAtCaret(
      `<img src="${src}" alt="" style="max-width:100%;height:auto;display:block;border:0;" />`,
    );
  };

  const applyInsertSnippet = () => {
    const snippet = insertSnippet.trim();
    if (!snippet) {
      setInsertOpen(false);
      return;
    }
    insertHtmlAtCaret(snippet);
    setInsertSnippet('');
    setInsertOpen(false);
    if (mode === 'preview') setMode('visual');
  };

  const handleSave = () => {
    const finalHtml = wrapEmailHtml(mode === 'visual' && editorRef.current ? editorRef.current.innerHTML : html);
    if (isRichHtmlEmpty(finalHtml) && !looksLikeHtml(finalHtml)) {
      return;
    }
    onSave(finalHtml);
  };

  return (
    <div className="mkt-email-editor" role="dialog" aria-modal aria-label={heading}>
      <div className="mkt-email-editor-panel">
        <div className="mkt-email-editor-head">
          <div>
            <div className="mkt-email-editor-eyebrow">Marketing Hub</div>
            <h3>{heading}</h3>
          </div>
          <button type="button" className="admin-ticket-btn" aria-label="Close" onClick={onCancel} disabled={saving}>
            <AppIcon name="close" size={12} />
          </button>
        </div>

        <div className="mkt-email-editor-meta">
          <label>
            <span>Title</span>
            <input
              value={title}
              onChange={(e) => onTitleChange(e.target.value)}
              placeholder="Welcome email, Q1 launch…"
              disabled={saving}
            />
          </label>
          <label>
            <span>Description (optional)</span>
            <input
              value={description}
              onChange={(e) => onDescriptionChange(e.target.value)}
              placeholder="Internal note about this template"
              disabled={saving}
            />
          </label>
          <label>
            <span>Tags (comma-separated)</span>
            <input
              value={tags}
              onChange={(e) => onTagsChange(e.target.value)}
              placeholder="launch, nurture, candid-pay"
              disabled={saving}
            />
          </label>
        </div>

        <div className="mkt-email-editor-modes" role="tablist" aria-label="Editor mode">
          {(
            [
              { id: 'visual', label: 'Visual' },
              { id: 'html', label: 'HTML' },
              { id: 'preview', label: 'Preview' },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={mode === tab.id}
              className={mode === tab.id ? 'is-active' : undefined}
              onClick={() => {
                if (mode === 'visual') emitFromVisual();
                setMode(tab.id);
              }}
              disabled={saving}
            >
              {tab.label}
            </button>
          ))}
          <button
            type="button"
            className="mkt-email-insert-btn"
            onClick={() => setInsertOpen(true)}
            disabled={saving || mode === 'preview'}
          >
            Insert HTML
          </button>
        </div>

        {mode !== 'preview' && mode !== 'html' ? (
          <div className="mkt-email-toolbar">
            <button type="button" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
              <strong>B</strong>
            </button>
            <button type="button" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
              <em>I</em>
            </button>
            <button
              type="button"
              title="Underline"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('underline')}
            >
              <u>U</u>
            </button>
            <span className="mkt-email-toolbar-sep" aria-hidden />
            <button
              type="button"
              title="Heading"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('formatBlock', 'h2')}
            >
              H2
            </button>
            <button
              type="button"
              title="Paragraph"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('formatBlock', 'p')}
            >
              P
            </button>
            <button
              type="button"
              title="Bullet list"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('insertUnorderedList')}
            >
              • List
            </button>
            <button
              type="button"
              title="Numbered list"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => exec('insertOrderedList')}
            >
              1. List
            </button>
            <span className="mkt-email-toolbar-sep" aria-hidden />
            <button type="button" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
              <AppIcon name="link" size={13} /> Link
            </button>
            <button type="button" title="Insert image" onMouseDown={(e) => e.preventDefault()} onClick={addImage}>
              <AppIcon name="image" size={13} /> Image
            </button>
            <button
              type="button"
              title="Insert HTML"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => setInsertOpen(true)}
            >
              {'</>'} HTML
            </button>
          </div>
        ) : null}

        <div className="mkt-email-editor-body">
          {mode === 'visual' ? (
            <div
              ref={editorRef}
              className="mkt-email-visual"
              contentEditable={!saving}
              suppressContentEditableWarning
              role="textbox"
              aria-multiline="true"
              data-placeholder="Write your email…"
              onInput={emitFromVisual}
              onFocus={() => setVisualFocused(true)}
              onBlur={() => {
                setVisualFocused(false);
                emitFromVisual();
              }}
            />
          ) : null}

          {mode === 'html' ? (
            <textarea
              className="mkt-email-source"
              value={html}
              onChange={(e) => commitHtml(e.target.value)}
              spellCheck={false}
              disabled={saving}
              aria-label="Email HTML source"
              placeholder="Paste or write HTML for this email template…"
            />
          ) : null}

          {mode === 'preview' ? (
            <iframe
              title="Email preview"
              className="mkt-email-preview"
              sandbox=""
              srcDoc={previewSrcDoc}
            />
          ) : null}
        </div>

        {error ? <p className="mkt-email-error">{error}</p> : null}

        <div className="mkt-email-editor-actions">
          <button type="button" className="btn" onClick={onCancel} disabled={saving}>
            Cancel
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={saving || !title.trim()}
            onClick={handleSave}
          >
            {saving ? 'Saving…' : saveLabel}
          </button>
        </div>
      </div>

      {insertOpen ? (
        <div className="mkt-email-insert-overlay" role="presentation" onClick={() => setInsertOpen(false)}>
          <div
            className="mkt-email-insert-modal"
            role="dialog"
            aria-label="Insert HTML"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="mkt-email-editor-head">
              <strong>Insert HTML</strong>
              <button type="button" className="admin-ticket-btn" onClick={() => setInsertOpen(false)}>
                <AppIcon name="close" size={12} />
              </button>
            </div>
            <p className="mkt-email-insert-hint">
              Paste a snippet (button, table, tracking pixel, etc.). It will be inserted at the cursor in Visual mode, or
              appended in HTML mode.
            </p>
            <textarea
              className="mkt-email-source mkt-email-source--insert"
              value={insertSnippet}
              onChange={(e) => setInsertSnippet(e.target.value)}
              placeholder={'<table role="presentation">…</table>'}
              autoFocus
            />
            <div className="mkt-email-editor-actions">
              <button type="button" className="btn" onClick={() => setInsertOpen(false)}>
                Cancel
              </button>
              <button type="button" className="btn btn-primary" onClick={applyInsertSnippet}>
                Insert
              </button>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
