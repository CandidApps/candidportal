'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AdminComposeLaunch } from '@/lib/email/admin-compose';
import { notifyAdminComposeSent } from '@/lib/email/admin-compose';
import { sendEmailReply } from '@/lib/assistant/types';
import { openMarketingAssetPicker } from '@/lib/marketing-hub';
import type { MarketingAsset } from '@/lib/marketing-hub-types';
import { MARKETING_CATEGORY_LABELS } from '@/lib/marketing-hub-types';
import {
  extractBodyHtml,
  wrapEmailHtml,
} from '@/components/admin/MarketingEmailTemplateEditor';
import { sanitizeEmailHtml } from '@/lib/rich-text';

function joinRecipients(existing: string, add: string): string {
  const set = new Set(
    existing
      .split(/[,;]+/)
      .map((s) => s.trim().toLowerCase())
      .filter(Boolean),
  );
  const next = existing
    .split(/[,;]+/)
    .map((s) => s.trim())
    .filter(Boolean);
  for (const part of add.split(/[,;]+/).map((s) => s.trim()).filter(Boolean)) {
    const key = part.toLowerCase();
    if (!set.has(key)) {
      set.add(key);
      next.push(part);
    }
  }
  return next.join(', ');
}

type HtmlBodyMode = 'visual' | 'html' | 'preview';

export function AdminZohoComposeModal({
  target,
  onClose,
}: {
  target: AdminComposeLaunch;
  onClose: () => void;
}) {
  const [to, setTo] = useState(target.to ?? '');
  const [cc, setCc] = useState(target.cc ?? '');
  const [bcc, setBcc] = useState(target.bcc ?? '');
  const [showCc, setShowCc] = useState(Boolean(target.cc?.trim()));
  const [showBcc, setShowBcc] = useState(Boolean(target.bcc?.trim()));
  const [subject, setSubject] = useState(target.subject);
  const [body, setBody] = useState(target.body ?? '');
  const [html, setHtml] = useState(target.html ?? '');
  const [htmlMode, setHtmlMode] = useState<HtmlBodyMode>(target.html ? 'visual' : 'html');
  const [marketingAssets, setMarketingAssets] = useState<MarketingAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const editorRef = useRef<HTMLDivElement>(null);
  const [visualFocused, setVisualFocused] = useState(false);

  useEffect(() => {
    setTo(target.to ?? '');
    setCc(target.cc ?? '');
    setBcc(target.bcc ?? '');
    setShowCc(Boolean(target.cc?.trim()));
    setShowBcc(Boolean(target.bcc?.trim()));
    setSubject(target.subject);
    setBody(target.body ?? '');
    setHtml(target.html ?? '');
    setHtmlMode(target.html ? 'visual' : 'html');
    setMarketingAssets([]);
    setError(null);
    setSent(false);
  }, [target]);

  const bodyHtml = useMemo(() => extractBodyHtml(html), [html]);
  const previewSrcDoc = useMemo(
    () => (html.trim() ? sanitizeEmailHtml(wrapEmailHtml(html)) : ''),
    [html],
  );

  useEffect(() => {
    const el = editorRef.current;
    if (!el || !html.trim() || htmlMode !== 'visual') return;
    if (!visualFocused && el.innerHTML !== bodyHtml) {
      el.innerHTML = bodyHtml;
    }
  }, [bodyHtml, html, htmlMode, visualFocused]);

  const commitHtml = useCallback((next: string) => {
    setHtml(wrapEmailHtml(next));
  }, []);

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

  const addLink = () => {
    const url = window.prompt('Link URL (https://…)');
    if (!url) return;
    const href = /^https?:\/\//i.test(url) ? url : `https://${url}`;
    exec('createLink', href);
  };

  const syncHtmlBeforeSend = () => {
    if (html.trim() && htmlMode === 'visual' && editorRef.current) {
      const next = wrapEmailHtml(editorRef.current.innerHTML);
      setHtml(next);
      return next;
    }
    return html;
  };

  const marketingAssetIds = marketingAssets.map((a) => a.id);

  const send = async () => {
    if (!to.trim()) {
      setError('Recipient is required');
      return;
    }
    const syncedHtml = syncHtmlBeforeSend();
    const textBody = body.trim();
    const htmlBody = syncedHtml.trim();
    const fullBody = htmlBody || textBody;
    if (!textBody && !htmlBody) {
      setError('Message body is required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendEmailReply({
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim() || '(no subject)',
        text: htmlBody ? textBody || ' ' : textBody,
        html: htmlBody || undefined,
        marketingAssetIds: [...new Set([...(target.marketingAssetIds ?? []), ...marketingAssetIds])],
      });
      if (target.rfqId && target.quoteRequestId) {
        const rfqRes = await fetch(
          `/api/admin/quote-requests/${target.quoteRequestId}/supplier-rfqs/${target.rfqId}`,
          {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              status: 'sent',
              emailBody: fullBody,
              quoteItemId: target.quoteItemId,
            }),
          },
        );
        if (!rfqRes.ok) {
          const data = (await rfqRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(data.error ?? 'Email sent, but RFQ status update failed');
        }
      }
      if (target.contractSubmitActionId && target.contractSubmitIntent) {
        const op =
          target.contractSubmitIntent === 'customer'
            ? 'mark_customer_sent'
            : target.contractSubmitIntent === 'supplier_reply'
              ? 'log_supplier_reply'
              : 'mark_supplier_sent';
        const dealRes = await fetch('/api/admin/contract-submit-actions', {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            id: target.contractSubmitActionId,
            op,
            paySource: target.paySource,
            paysourcePartnerId: target.paysourcePartnerId,
            providerId: target.providerId,
            vendorName: target.vendorName,
            supplierContactEmail: to.trim(),
            email: {
              to: to.trim(),
              cc: cc.trim() || undefined,
              subject: subject.trim(),
              body: fullBody,
            },
          }),
        });
        if (!dealRes.ok) {
          const data = (await dealRes.json().catch(() => ({}))) as { error?: string };
          throw new Error(
            data.error ?? 'Email sent, but deal status failed to update. Refresh and try again.',
          );
        }
      }
      notifyAdminComposeSent({
        rfqId: target.rfqId,
        quoteRequestId: target.quoteRequestId,
        quoteItemId: target.quoteItemId,
        contractSubmitActionId: target.contractSubmitActionId,
        contractSubmitIntent: target.contractSubmitIntent,
        paySource: target.paySource,
        paysourcePartnerId: target.paysourcePartnerId,
        providerId: target.providerId,
        vendorName: target.vendorName,
        supplierContactEmail: to.trim(),
        to: to.trim(),
        cc: cc.trim() || undefined,
        bcc: bcc.trim() || undefined,
        subject: subject.trim(),
        body: fullBody,
      });
      setSent(true);
      setTimeout(onClose, 700);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Send failed');
    } finally {
      setSending(false);
    }
  };

  const addMarketingAsset = (asset: MarketingAsset) => {
    setMarketingAssets((prev) => (prev.some((a) => a.id === asset.id) ? prev : [...prev, asset]));
    if (asset.category === 'email_template' && !html.trim()) {
      void fetch(`/api/admin/marketing-hub?assetId=${encodeURIComponent(asset.id)}`)
        .then((res) => (res.ok ? res.text() : ''))
        .then((text) => {
          if (text) {
            setHtml(text);
            setHtmlMode('visual');
          }
        })
        .catch(() => {});
    }
    if (!subject.trim() || subject === '(no subject)') {
      setSubject(`Candid marketing asset: ${asset.title}`);
    }
  };

  const switchToPlainText = () => {
    if (htmlMode === 'visual' && editorRef.current) {
      const plain = editorRef.current.innerText.trim();
      if (plain && !body.trim()) setBody(plain);
    }
    setHtml('');
    setHtmlMode('html');
  };

  const accountContacts = target.accountContacts ?? [];

  const addContact = (email: string, field: 'to' | 'cc' | 'bcc') => {
    if (field === 'to') setTo((v) => joinRecipients(v, email));
    else if (field === 'cc') {
      setShowCc(true);
      setCc((v) => joinRecipients(v, email));
    } else {
      setShowBcc(true);
      setBcc((v) => joinRecipients(v, email));
    }
  };

  return (
    <div className="modal-overlay modal-overlay--compose open">
      <div
        className={`modal-box assist-modal assist-compose${html.trim() ? ' assist-compose--html' : ''}`}
        role="dialog"
        aria-label="Compose email"
      >
        <div className="assist-modal-head">
          <div className="assist-modal-title">
            <AppIcon name="email" size={14} /> Compose
            {target.contextLabel ? ` · ${target.contextLabel}` : ''}
          </div>
          <button type="button" className="assist-modal-close" onClick={onClose} aria-label="Close">
            <AppIcon name="close" size={14} />
          </button>
        </div>
        <div className="assist-modal-body">
          <label className="assist-field">
            <span>To</span>
            <input value={to} onChange={(e) => setTo(e.target.value)} />
          </label>
          <div className="assist-compose-cc-row">
            {!showCc ? (
              <button type="button" className="assist-mini-btn" onClick={() => setShowCc(true)}>
                Cc
              </button>
            ) : null}
            {!showBcc ? (
              <button type="button" className="assist-mini-btn" onClick={() => setShowBcc(true)}>
                Bcc
              </button>
            ) : null}
          </div>
          {showCc ? (
            <label className="assist-field">
              <span>Cc</span>
              <input
                value={cc}
                onChange={(e) => setCc(e.target.value)}
                placeholder="optional"
              />
            </label>
          ) : null}
          {showBcc ? (
            <label className="assist-field">
              <span>Bcc</span>
              <input
                value={bcc}
                onChange={(e) => setBcc(e.target.value)}
                placeholder="optional"
              />
            </label>
          ) : null}
          <label className="assist-field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          {accountContacts.length > 0 ? (
            <div className="cust-email-recommend" style={{ marginBottom: 4 }}>
              <span className="cust-email-recommend-label">Account contacts</span>
              {accountContacts.map((c) => (
                <span key={c.email} className="cust-email-contact-chip-wrap">
                  <button
                    type="button"
                    className="cust-email-chip"
                    onClick={() => addContact(c.email, 'to')}
                    title={`Add ${c.email} to To`}
                  >
                    {c.name}
                    {c.role ? <span className="cust-email-chip-role"> · {c.role}</span> : null}
                  </button>
                  <button
                    type="button"
                    className="cust-email-chip-mini"
                    onClick={() => addContact(c.email, 'cc')}
                    title="Add to Cc"
                  >
                    Cc
                  </button>
                  <button
                    type="button"
                    className="cust-email-chip-mini"
                    onClick={() => addContact(c.email, 'bcc')}
                    title="Add to Bcc"
                  >
                    Bcc
                  </button>
                </span>
              ))}
            </div>
          ) : null}
          {html.trim() ? (
            <div className="assist-compose-html">
              <div className="assist-compose-html-modes" role="tablist" aria-label="Email body mode">
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
                    aria-selected={htmlMode === tab.id}
                    className={htmlMode === tab.id ? 'is-active' : undefined}
                    onClick={() => {
                      if (htmlMode === 'visual') emitFromVisual();
                      setHtmlMode(tab.id);
                    }}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {htmlMode === 'visual' ? (
                <>
                  <div className="assist-compose-html-toolbar">
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
                    <span className="assist-compose-html-sep" aria-hidden />
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
                      title="Bullet list"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => exec('insertUnorderedList')}
                    >
                      • List
                    </button>
                    <button type="button" title="Insert link" onMouseDown={(e) => e.preventDefault()} onClick={addLink}>
                      <AppIcon name="link" size={13} /> Link
                    </button>
                  </div>
                  <div
                    ref={editorRef}
                    className="assist-compose-html-visual"
                    contentEditable
                    suppressContentEditableWarning
                    role="textbox"
                    aria-multiline="true"
                    data-placeholder="Edit your email…"
                    onInput={emitFromVisual}
                    onFocus={() => setVisualFocused(true)}
                    onBlur={() => {
                      setVisualFocused(false);
                      emitFromVisual();
                    }}
                  />
                </>
              ) : null}

              {htmlMode === 'html' ? (
                <textarea
                  className="assist-compose-html-source"
                  value={html}
                  onChange={(e) => commitHtml(e.target.value)}
                  rows={14}
                  spellCheck={false}
                  aria-label="HTML body"
                />
              ) : null}

              {htmlMode === 'preview' ? (
                <iframe
                  title="Email preview"
                  className="assist-compose-html-preview"
                  sandbox=""
                  srcDoc={previewSrcDoc}
                />
              ) : null}
            </div>
          ) : (
            <div className="assist-compose-body">
              <textarea
                value={body}
                onChange={(e) => setBody(e.target.value)}
                rows={14}
                placeholder="Write your message…"
              />
            </div>
          )}
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, marginTop: 8, alignItems: 'center' }}>
            <button
              type="button"
              className="assist-mini-btn"
              onClick={() => openMarketingAssetPicker(addMarketingAsset)}
            >
              <AppIcon name="image" size={11} /> Insert from Marketing Hub
            </button>
            {html.trim() ? (
              <button type="button" className="assist-mini-btn" onClick={switchToPlainText}>
                Switch to plain text
              </button>
            ) : null}
          </div>
          {marketingAssets.length > 0 && (
            <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {marketingAssets.map((asset) => (
                <span
                  key={asset.id}
                  style={{
                    fontSize: 11,
                    padding: '4px 8px',
                    borderRadius: 999,
                    background: 'var(--gray-pale)',
                    display: 'inline-flex',
                    alignItems: 'center',
                    gap: 6,
                  }}
                >
                  {asset.title} ({MARKETING_CATEGORY_LABELS[asset.category]})
                  <button
                    type="button"
                    aria-label={`Remove ${asset.title}`}
                    onClick={() => setMarketingAssets((prev) => prev.filter((a) => a.id !== asset.id))}
                    style={{ border: 'none', background: 'transparent', cursor: 'pointer', padding: 0 }}
                  >
                    <AppIcon name="close" size={10} />
                  </button>
                </span>
              ))}
            </div>
          )}
          {error && <div className="assist-form-error">{error}</div>}
        </div>
        <div className="assist-modal-foot">
          <button type="button" className="assist-mini-btn" onClick={onClose} disabled={sending}>
            Cancel
          </button>
          <button
            type="button"
            className="assist-mini-btn primary"
            onClick={() => void send()}
            disabled={sending || sent}
          >
            <AppIcon name="send" size={11} /> {sent ? 'Sent ✓' : sending ? 'Sending…' : 'Send via Zoho'}
          </button>
        </div>
      </div>
    </div>
  );
}
