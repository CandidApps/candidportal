'use client';

import { useCallback, useEffect, useId, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { toPng } from 'html-to-image';
import { AppIcon } from '@/components/AppIcon';
import { callAdminHankAPI } from '@/lib/candid-data';
import {
  buildDraftFromNote,
  describeCaptureTarget,
  FRANK_CAPTURE_SYSTEM_PROMPT,
  parseFrankCaptureJson,
  type CaptureFrankFields,
  type CaptureTargetInfo,
} from '@/lib/admin/change-capture';
import {
  createChangeRequest,
  uploadChangeAttachments,
} from '@/lib/services/product-change-requests';

type AttachmentDraft = {
  id: string;
  file: File;
  previewUrl: string;
};

type ComposerState = {
  x: number;
  y: number;
  target: CaptureTargetInfo | null;
};

type MarkPoint = { x: number; y: number };

type CropState = {
  startX: number;
  startY: number;
  endX: number;
  endY: number;
};

type CaptureMode = 'browse' | 'mark' | 'crop';

const COMPOSER_WIDTH = 420;
const COMPOSER_TOP_SAFE = 72;
const COMPOSER_PAD = 16;

function clampComposerPos(
  x: number,
  y: number,
  size?: { w: number; h: number },
): { x: number; y: number } {
  const width = size?.w ?? COMPOSER_WIDTH;
  const height = Math.min(size?.h ?? 320, window.innerHeight - COMPOSER_TOP_SAFE - COMPOSER_PAD);
  const maxX = Math.max(COMPOSER_PAD, window.innerWidth - width - COMPOSER_PAD);
  const maxY = Math.max(COMPOSER_TOP_SAFE, window.innerHeight - height - COMPOSER_PAD);
  return {
    x: Math.min(Math.max(COMPOSER_PAD, x), maxX),
    y: Math.min(Math.max(COMPOSER_TOP_SAFE, y), maxY),
  };
}

function openComposerAt(
  clientX?: number,
  clientY?: number,
  target?: CaptureTargetInfo | null,
): ComposerState {
  const estimatedH = 320;
  let x =
    clientX != null
      ? clientX - COMPOSER_WIDTH / 2
      : window.innerWidth - COMPOSER_WIDTH - 24;
  // Prefer opening above the click when near the bottom of the viewport.
  let y = clientY != null ? clientY + 12 : COMPOSER_TOP_SAFE;
  if (clientY != null && clientY + estimatedH + COMPOSER_PAD > window.innerHeight) {
    y = clientY - estimatedH - 12;
  }
  const clamped = clampComposerPos(x, y, { w: COMPOSER_WIDTH, h: estimatedH });
  return { ...clamped, target: target ?? null };
}

const EDITABLE_KEYS: { key: keyof CaptureFrankFields; label: string; rows?: number }[] = [
  { key: 'title', label: 'Title', rows: 1 },
  { key: 'current_behavior', label: 'Current behavior', rows: 3 },
  { key: 'desired_behavior', label: 'Desired behavior', rows: 3 },
  { key: 'change_solves', label: 'What this solves', rows: 2 },
  { key: 'acceptance_criteria', label: 'Acceptance criteria', rows: 3 },
  { key: 'user_flow_steps', label: 'User flow', rows: 2 },
  { key: 'out_of_scope', label: 'Out of scope', rows: 2 },
];

function dataUrlToFile(dataUrl: string, name: string): File {
  const [header, base64] = dataUrl.split(',');
  const mime = /data:([^;]+)/.exec(header)?.[1] ?? 'image/png';
  const binary = atob(base64 ?? '');
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return new File([bytes], name, { type: mime });
}

export function AdminChangeCaptureHost({
  active,
  adminView,
  onExit,
  onCreated,
}: {
  active: boolean;
  adminView: string;
  onExit: () => void;
  onCreated?: (publicId: string) => void;
}) {
  const fileInputId = useId();
  const [mode, setMode] = useState<CaptureMode>('browse');
  const [composer, setComposer] = useState<ComposerState | null>(null);
  const [markPoint, setMarkPoint] = useState<MarkPoint | null>(null);
  const [note, setNote] = useState('');
  const [attachments, setAttachments] = useState<AttachmentDraft[]>([]);
  const [frankFields, setFrankFields] = useState<CaptureFrankFields | null>(null);
  const [frankSummary, setFrankSummary] = useState('');
  const [busy, setBusy] = useState<'generate' | 'send' | 'crop' | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ publicId: string } | null>(null);
  const [crop, setCrop] = useState<CropState | null>(null);
  const dragging = useRef(false);
  const composerDrag = useRef<{ ox: number; oy: number; startX: number; startY: number } | null>(
    null,
  );
  const composerRef = useRef<HTMLDivElement>(null);
  const attachmentsRef = useRef(attachments);
  attachmentsRef.current = attachments;

  const resetComposer = useCallback(() => {
    setComposer(null);
    setMarkPoint(null);
    setNote('');
    setFrankFields(null);
    setFrankSummary('');
    setError(null);
    setMode('browse');
    setCrop(null);
    setAttachments((prev) => {
      for (const a of prev) URL.revokeObjectURL(a.previewUrl);
      return [];
    });
  }, []);

  const exitAll = useCallback(() => {
    resetComposer();
    onExit();
  }, [onExit, resetComposer]);

  useEffect(() => {
    if (!active) {
      resetComposer();
      return;
    }
    setMode('browse');
  }, [active, resetComposer]);

  useEffect(() => {
    if (!active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      if (mode === 'crop') {
        setMode('browse');
        setCrop(null);
        return;
      }
      if (mode === 'mark') {
        setMode('browse');
        return;
      }
      if (composer) {
        resetComposer();
        return;
      }
      exitAll();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [active, composer, exitAll, mode, resetComposer]);

  useEffect(() => {
    return () => {
      for (const a of attachmentsRef.current) URL.revokeObjectURL(a.previewUrl);
    };
  }, []);

  // Keep the composer fully inside the viewport when content grows (Generate).
  useLayoutEffect(() => {
    if (!composer || !composerRef.current) return;
    const rect = composerRef.current.getBoundingClientRect();
    const next = clampComposerPos(composer.x, composer.y, {
      w: rect.width,
      h: rect.height,
    });
    if (next.x === composer.x && next.y === composer.y) return;
    setComposer((prev) => (prev ? { ...prev, ...next } : prev));
  }, [composer, frankFields, frankSummary, attachments.length, note, error, busy]);

  useEffect(() => {
    if (!composer) return;
    const onResize = () => {
      const rect = composerRef.current?.getBoundingClientRect();
      setComposer((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          ...clampComposerPos(prev.x, prev.y, rect ? { w: rect.width, h: rect.height } : undefined),
        };
      });
    };
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, [composer]);

  const addFiles = (files: FileList | File[]) => {
    const next: AttachmentDraft[] = [];
    for (const file of Array.from(files)) {
      if (!file) continue;
      next.push({
        id: `${file.name}-${file.size}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`,
        file,
        previewUrl: URL.createObjectURL(file),
      });
    }
    if (next.length) setAttachments((prev) => [...prev, ...next].slice(0, 12));
  };

  const removeAttachment = (id: string) => {
    setAttachments((prev) => {
      const hit = prev.find((a) => a.id === id);
      if (hit) URL.revokeObjectURL(hit.previewUrl);
      return prev.filter((a) => a.id !== id);
    });
  };

  const onPointClick = (e: React.MouseEvent) => {
    if (!active || mode !== 'mark') return;
    if ((e.target as HTMLElement).closest?.('.cr-capture-composer, .cr-capture-toast, .cr-capture-banner, .sb-product-tools, .cr-capture-mark-dot')) {
      return;
    }
    e.preventDefault();
    e.stopPropagation();
    const target = describeCaptureTarget(e.target as Element);
    setMarkPoint({ x: e.clientX, y: e.clientY });
    setComposer((prev) =>
      prev
        ? { ...prev, target }
        : openComposerAt(e.clientX, e.clientY, target),
    );
    setMode('browse');
    setError(null);
  };

  const onComposerDragStart = (e: React.PointerEvent) => {
    if (!composer) return;
    if (e.button !== 0) return;
    e.preventDefault();
    e.stopPropagation();
    (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
    composerDrag.current = {
      ox: composer.x,
      oy: composer.y,
      startX: e.clientX,
      startY: e.clientY,
    };
  };

  const onComposerDragMove = (e: React.PointerEvent) => {
    if (!composerDrag.current) return;
    const dx = e.clientX - composerDrag.current.startX;
    const dy = e.clientY - composerDrag.current.startY;
    const rect = composerRef.current?.getBoundingClientRect();
    const next = clampComposerPos(
      composerDrag.current.ox + dx,
      composerDrag.current.oy + dy,
      rect ? { w: rect.width, h: rect.height } : undefined,
    );
    setComposer((prev) => (prev ? { ...prev, ...next } : prev));
  };

  const onComposerDragEnd = (e: React.PointerEvent) => {
    if (!composerDrag.current) return;
    composerDrag.current = null;
    try {
      (e.currentTarget as HTMLElement).releasePointerCapture?.(e.pointerId);
    } catch {
      /* ignore */
    }
  };

  const startCrop = () => {
    setMode('crop');
    setCrop(null);
    setError(null);
  };

  const onCropPointerDown = (e: React.PointerEvent) => {
    if (mode !== 'crop') return;
    dragging.current = true;
    (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
    setCrop({ startX: e.clientX, startY: e.clientY, endX: e.clientX, endY: e.clientY });
  };

  const onCropPointerMove = (e: React.PointerEvent) => {
    if (!dragging.current || !crop) return;
    setCrop({ ...crop, endX: e.clientX, endY: e.clientY });
  };

  const onCropPointerUp = async (e: React.PointerEvent) => {
    if (!dragging.current || !crop) return;
    dragging.current = false;
    const left = Math.min(crop.startX, e.clientX);
    const top = Math.min(crop.startY, e.clientY);
    const width = Math.abs(e.clientX - crop.startX);
    const height = Math.abs(e.clientY - crop.startY);
    setMode(composer ? 'browse' : 'browse');
    setCrop(null);
    if (width < 8 || height < 8) {
      setError('Drag a larger region to screenshot.');
      return;
    }
    if (!composer) setComposer(openComposerAt());
    setBusy('crop');
    setError(null);
    try {
      const root = (document.querySelector('.main') as HTMLElement | null) ?? document.body;
      const full = await toPng(root, {
        cacheBust: true,
        pixelRatio: Math.min(2, window.devicePixelRatio || 1),
        filter: (node) => {
          if (!(node instanceof HTMLElement)) return true;
          return !node.classList.contains('cr-capture-ui');
        },
      });
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error('Failed to load capture'));
        img.src = full;
      });
      const rootRect = root.getBoundingClientRect();
      const scaleX = img.naturalWidth / Math.max(1, rootRect.width);
      const scaleY = img.naturalHeight / Math.max(1, rootRect.height);
      const sx = Math.max(0, (left - rootRect.left) * scaleX);
      const sy = Math.max(0, (top - rootRect.top) * scaleY);
      const sw = Math.min(img.naturalWidth - sx, width * scaleX);
      const sh = Math.min(img.naturalHeight - sy, height * scaleY);
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.round(sw));
      canvas.height = Math.max(1, Math.round(sh));
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas unavailable');
      ctx.drawImage(img, sx, sy, sw, sh, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      const file = dataUrlToFile(dataUrl, `capture-${Date.now()}.png`);
      addFiles([file]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Screenshot failed');
    } finally {
      setBusy(null);
    }
  };

  const patchFrank = (key: keyof CaptureFrankFields, value: string) => {
    setFrankFields((prev) => ({ ...(prev ?? {}), [key]: value }));
  };

  const generate = async () => {
    if (!note.trim()) {
      setError('Write a short note about the issue first, then Generate.');
      return;
    }
    setBusy('generate');
    setError(null);
    try {
      const payload = [
        `MODE: DRAFT`,
        `Admin view: ${adminView}`,
        composer?.target ? `UI focus (optional): ${composer.target.label}` : '',
        `Author notes:\n${note.trim()}`,
        `Instructions: Produce distinct current_behavior, desired_behavior, change_solves, and acceptance_criteria. Do not repeat the same paragraph in multiple fields.`,
      ]
        .filter(Boolean)
        .join('\n\n');
      const text = await callAdminHankAPI([{ role: 'user', content: payload }], {
        systemPrompt: FRANK_CAPTURE_SYSTEM_PROMPT,
      });
      if (/credit balance|ANTHROPIC_API_KEY|API key|API error|empty response/i.test(text) && !text.includes('{')) {
        setError(text);
        return;
      }
      const parsed = parseFrankCaptureJson(text);
      setFrankFields(parsed.fields);
      setFrankSummary(parsed.summary);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generate failed');
    } finally {
      setBusy(null);
    }
  };

  const send = async () => {
    if (!frankFields || !Object.keys(frankFields).length) {
      setError('Generate a draft first, edit it if needed, then Send.');
      return;
    }
    setBusy('send');
    setError(null);
    try {
      const draft = buildDraftFromNote({
        note,
        adminView,
        target: composer?.target ?? null,
        frank: frankFields,
      });
      const change = await createChangeRequest(draft);
      if (!change?.id) throw new Error('Failed to create change request');
      if (attachments.length) {
        await uploadChangeAttachments(
          change.id,
          attachments.map((a) => a.file),
        );
      }
      setToast({ publicId: change.public_id });
      onCreated?.(change.public_id);
      resetComposer();
      onExit();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Send failed');
    } finally {
      setBusy(null);
    }
  };

  if (!active && !toast) return null;

  const cropRect =
    crop &&
    ({
      left: Math.min(crop.startX, crop.endX),
      top: Math.min(crop.startY, crop.endY),
      width: Math.abs(crop.endX - crop.startX),
      height: Math.abs(crop.endY - crop.startY),
    } as const);

  const layerClass = [
    'cr-capture-ui',
    'cr-capture-layer',
    mode === 'browse' ? 'is-browse' : '',
    mode === 'mark' ? 'is-marking' : '',
    mode === 'crop' ? 'is-cropping' : '',
  ]
    .filter(Boolean)
    .join(' ');

  const bannerText =
    mode === 'crop'
      ? 'Drag a rectangle to screenshot'
      : mode === 'mark'
        ? 'Click the UI (modals OK) to mark target'
        : 'Browse freely — open modals, then Mark target or write a note';

  const generated = Boolean(frankFields && Object.keys(frankFields).length);

  return createPortal(
    <>
      {active ? (
        <div
          className={layerClass}
          onClick={mode === 'mark' ? onPointClick : undefined}
          onPointerDown={mode === 'crop' ? onCropPointerDown : undefined}
          onPointerMove={mode === 'crop' ? onCropPointerMove : undefined}
          onPointerUp={mode === 'crop' ? onCropPointerUp : undefined}
          role="presentation"
        >
          <div className="cr-capture-banner" onClick={(e) => e.stopPropagation()}>
            <span className="cr-capture-banner-text">{bannerText}</span>
            {mode === 'browse' ? (
              <>
                <button
                  type="button"
                  className="cr-capture-banner-exit"
                  onClick={(e) => {
                    e.stopPropagation();
                    setComposer((prev) => prev ?? openComposerAt());
                    setError(null);
                  }}
                >
                  Write note
                </button>
                <button
                  type="button"
                  className="cr-capture-banner-exit"
                  onClick={(e) => {
                    e.stopPropagation();
                    setMode('mark');
                    setError(null);
                  }}
                >
                  Mark target
                </button>
                <button
                  type="button"
                  className="cr-capture-banner-exit"
                  onClick={(e) => {
                    e.stopPropagation();
                    startCrop();
                  }}
                >
                  Screenshot
                </button>
              </>
            ) : (
              <button
                type="button"
                className="cr-capture-banner-exit"
                onClick={(e) => {
                  e.stopPropagation();
                  setMode('browse');
                  setCrop(null);
                }}
              >
                Cancel
              </button>
            )}
            <button
              type="button"
              className="cr-capture-banner-exit"
              onClick={(e) => {
                e.stopPropagation();
                exitAll();
              }}
            >
              Exit
            </button>
          </div>
          {cropRect ? (
            <div
              className="cr-capture-crop-rect"
              style={{
                left: cropRect.left,
                top: cropRect.top,
                width: cropRect.width,
                height: cropRect.height,
              }}
            />
          ) : null}
          {markPoint ? (
            <div
              className="cr-capture-mark-dot"
              style={{ left: markPoint.x, top: markPoint.y }}
              aria-hidden
            />
          ) : null}
        </div>
      ) : null}

      {active && composer && mode !== 'crop' ? (
        <div
          ref={composerRef}
          className="cr-capture-ui cr-capture-composer cr-capture-composer--wide"
          style={{ left: composer.x, top: composer.y }}
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
        >
          <div
            className="cr-capture-composer-drag"
            onPointerDown={onComposerDragStart}
            onPointerMove={onComposerDragMove}
            onPointerUp={onComposerDragEnd}
            onPointerCancel={onComposerDragEnd}
            title="Drag to reposition"
          >
            <span className="cr-capture-composer-drag-grip" aria-hidden>
              ⋮⋮
            </span>
            <div className="cr-capture-composer-meta" title={composer.target?.label ?? 'Page note'}>
              {composer.target?.label ?? 'Page note (no target marked)'}
            </div>
          </div>
          <label className="cr-capture-field-label">Brief note</label>
          <textarea
            className="cr-capture-composer-input"
            rows={3}
            value={note}
            onChange={(e) => {
              setNote(e.target.value);
              // Editing the note invalidates prior generate so Send can't ship stale blanks
              if (generated) {
                setFrankFields(null);
                setFrankSummary('');
              }
            }}
            placeholder="What’s wrong / what should change? Then hit Generate…"
            autoFocus
          />
          {attachments.length > 0 ? (
            <div className="cr-capture-thumbs">
              {attachments.map((a) => (
                <button
                  key={a.id}
                  type="button"
                  className="cr-capture-thumb"
                  title="Remove"
                  onClick={() => removeAttachment(a.id)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={a.previewUrl} alt="" />
                </button>
              ))}
              <span className="cr-capture-thumb-count">{attachments.length}</span>
            </div>
          ) : null}

          {frankSummary ? <div className="cr-capture-frank-summary">{frankSummary}</div> : null}

          {generated ? (
            <div className="cr-capture-spec-fields">
              {EDITABLE_KEYS.map(({ key, label, rows }) => (
                <label key={key} className="cr-capture-field">
                  <span className="cr-capture-field-label">{label}</span>
                  {rows && rows > 1 ? (
                    <textarea
                      className="cr-capture-composer-input"
                      rows={rows}
                      value={String(frankFields?.[key] ?? '')}
                      onChange={(e) => patchFrank(key, e.target.value)}
                    />
                  ) : (
                    <input
                      className="cr-capture-composer-input"
                      value={String(frankFields?.[key] ?? '')}
                      onChange={(e) => patchFrank(key, e.target.value)}
                    />
                  )}
                </label>
              ))}
            </div>
          ) : null}

          {error ? <div className="cr-capture-error">{error}</div> : null}

          <div className="cr-capture-toolbar">
            <label className="cr-capture-tool-btn" htmlFor={fileInputId} title="Attach file">
              <AppIcon name="add" size={14} />
            </label>
            <input
              id={fileInputId}
              type="file"
              multiple
              className="sr-only"
              onChange={(e) => {
                if (e.target.files) addFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className="cr-capture-tool-btn"
              title="Screenshot crop"
              disabled={busy !== null}
              onClick={startCrop}
            >
              <AppIcon name="camera" size={14} />
            </button>
            <div className="cr-capture-toolbar-spacer" />
            <button
              type="button"
              className="cr-capture-send cr-capture-send--secondary"
              disabled={busy !== null || !generated}
              onClick={() => void send()}
              title={generated ? 'Create draft CR' : 'Generate a draft first'}
            >
              <AppIcon name="send" size={14} />
              <span>{busy === 'send' ? 'Sending…' : 'Send'}</span>
            </button>
            <button
              type="button"
              className="cr-capture-send"
              disabled={busy !== null || !note.trim()}
              onClick={() => void generate()}
              title="Generate editable CR spec"
            >
              <AppIcon name="sparkles" size={14} />
              <span>{busy === 'generate' ? 'Generating…' : generated ? 'Re-generate' : 'Generate'}</span>
            </button>
          </div>
          {busy === 'crop' ? <div className="cr-capture-busy">Capturing screenshot…</div> : null}
        </div>
      ) : null}

      {toast ? (
        <div className="cr-capture-ui cr-capture-toast" role="status">
          Created{' '}
          <a href="/admin#roadmap" onClick={() => setToast(null)}>
            {toast.publicId}
          </a>
          <button type="button" onClick={() => setToast(null)} aria-label="Dismiss">
            <AppIcon name="close" size={12} />
          </button>
        </div>
      ) : null}
    </>,
    document.body,
  );
}
