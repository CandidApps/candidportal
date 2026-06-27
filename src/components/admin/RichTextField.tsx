'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';

type RichTextFieldProps = {
  value: string;
  onChange: (html: string) => void;
  placeholder?: string;
  /** Endpoint that accepts a `file` form field and returns { url, name }. */
  uploadUrl?: string;
  minHeight?: number;
};

/**
 * Lightweight contentEditable rich-text editor: bold / italic / underline,
 * hyperlinks, and file attachments (uploaded to `uploadUrl`, inserted as links).
 * Emits HTML via onChange. No external dependencies — uses document.execCommand,
 * which remains universally supported for these basic commands.
 */
export function RichTextField({
  value,
  onChange,
  placeholder,
  uploadUrl,
  minHeight = 120,
}: RichTextFieldProps) {
  const editorRef = useRef<HTMLDivElement>(null);
  const fileRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);
  const [focused, setFocused] = useState(false);

  // Sync external value into the DOM only when it diverges and we're not
  // actively editing, to avoid clobbering the caret position on each keystroke.
  useEffect(() => {
    const el = editorRef.current;
    if (!el) return;
    if (!focused && el.innerHTML !== value) {
      el.innerHTML = value ?? '';
    }
  }, [value, focused]);

  const emit = useCallback(() => {
    if (editorRef.current) onChange(editorRef.current.innerHTML);
  }, [onChange]);

  const exec = useCallback(
    (command: string, arg?: string) => {
      editorRef.current?.focus();
      document.execCommand(command, false, arg);
      emit();
    },
    [emit],
  );

  const addLink = useCallback(() => {
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec('createLink', href);
  }, [exec]);

  const insertHtmlAtCaret = useCallback(
    (html: string) => {
      editorRef.current?.focus();
      document.execCommand('insertHTML', false, html);
      emit();
    },
    [emit],
  );

  const onPickFile = useCallback(
    async (file: File) => {
      if (!uploadUrl) return;
      setUploading(true);
      try {
        const fd = new FormData();
        fd.append('file', file);
        const res = await fetch(uploadUrl, { method: 'POST', body: fd });
        const json = (await res.json().catch(() => ({}))) as { url?: string; name?: string; error?: string };
        if (!res.ok || !json.url) throw new Error(json.error ?? 'Upload failed');
        const label = (json.name ?? file.name).replace(/</g, '&lt;').replace(/>/g, '&gt;');
        insertHtmlAtCaret(
          `<a href="${json.url}" target="_blank" rel="noopener noreferrer">📎 ${label}</a>&nbsp;`,
        );
      } catch {
        window.alert('Could not upload that file. Try again.');
      } finally {
        setUploading(false);
      }
    },
    [uploadUrl, insertHtmlAtCaret],
  );

  return (
    <div className="rte">
      <div className="rte-toolbar">
        <button type="button" className="rte-btn" title="Bold" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('bold')}>
          <strong>B</strong>
        </button>
        <button type="button" className="rte-btn" title="Italic" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('italic')}>
          <em>I</em>
        </button>
        <button type="button" className="rte-btn" title="Underline" onMouseDown={(e) => e.preventDefault()} onClick={() => exec('underline')}>
          <u>U</u>
        </button>
        <span className="rte-sep" aria-hidden />
        <button type="button" className="rte-btn" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
          <AppIcon name="link" size={13} />
        </button>
        {uploadUrl && (
          <button
            type="button"
            className="rte-btn"
            title="Attach file"
            disabled={uploading}
            onMouseDown={(e) => e.preventDefault()}
            onClick={() => fileRef.current?.click()}
          >
            <AppIcon name="paperclip" size={13} />
            {uploading ? <span className="rte-uploading">…</span> : null}
          </button>
        )}
      </div>
      <div
        ref={editorRef}
        className="rte-editor"
        contentEditable
        suppressContentEditableWarning
        role="textbox"
        aria-multiline="true"
        data-placeholder={placeholder ?? ''}
        style={{ minHeight }}
        onInput={emit}
        onBlur={() => {
          setFocused(false);
          emit();
        }}
        onFocus={() => setFocused(true)}
      />
      <input
        ref={fileRef}
        type="file"
        hidden
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) void onPickFile(f);
          e.target.value = '';
        }}
      />
    </div>
  );
}
