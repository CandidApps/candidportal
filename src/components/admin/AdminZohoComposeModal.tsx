'use client';

import { useEffect, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import type { AdminComposeLaunch } from '@/lib/email/admin-compose';
import { notifyAdminComposeSent } from '@/lib/email/admin-compose';
import { sendEmailReply } from '@/lib/assistant/types';
import { openMarketingAssetPicker } from '@/lib/marketing-hub';
import type { MarketingAsset } from '@/lib/marketing-hub-types';
import { MARKETING_CATEGORY_LABELS } from '@/lib/marketing-hub-types';

export function AdminZohoComposeModal({
  target,
  onClose,
}: {
  target: AdminComposeLaunch;
  onClose: () => void;
}) {
  const [to, setTo] = useState(target.to ?? '');
  const [subject, setSubject] = useState(target.subject);
  const [body, setBody] = useState(target.body ?? '');
  const [html, setHtml] = useState(target.html ?? '');
  const [marketingAssets, setMarketingAssets] = useState<MarketingAsset[]>([]);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    setTo(target.to ?? '');
    setSubject(target.subject);
    setBody(target.body ?? '');
    setHtml(target.html ?? '');
    setMarketingAssets([]);
    setError(null);
    setSent(false);
  }, [target]);

  const marketingAssetIds = marketingAssets.map((a) => a.id);

  const send = async () => {
    if (!to.trim()) {
      setError('Recipient is required');
      return;
    }
    const textBody = body.trim();
    const htmlBody = html.trim();
    if (!textBody && !htmlBody) {
      setError('Message body is required');
      return;
    }
    setSending(true);
    setError(null);
    try {
      await sendEmailReply({
        to: to.trim(),
        subject: subject.trim() || '(no subject)',
        text: htmlBody ? textBody || ' ' : textBody,
        html: htmlBody || undefined,
        marketingAssetIds: [...new Set([...(target.marketingAssetIds ?? []), ...marketingAssetIds])],
      });
      if (target.rfqId && target.quoteRequestId) {
        await fetch(`/api/admin/quote-requests/${target.quoteRequestId}/supplier-rfqs/${target.rfqId}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            status: 'sent',
            emailBody: htmlBody || textBody,
            quoteItemId: target.quoteItemId,
          }),
        });
      }
      notifyAdminComposeSent({
        rfqId: target.rfqId,
        quoteRequestId: target.quoteRequestId,
        quoteItemId: target.quoteItemId,
        to: to.trim(),
        subject: subject.trim(),
        body: htmlBody || textBody,
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
          if (text) setHtml(text);
        })
        .catch(() => {});
    }
    if (!subject.trim() || subject === '(no subject)') {
      setSubject(`Candid marketing asset: ${asset.title}`);
    }
  };

  return (
    <div className="modal-overlay open" onClick={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal-box assist-modal assist-compose" role="dialog" aria-label="Compose email">
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
          <label className="assist-field">
            <span>Subject</span>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} />
          </label>
          {html ? (
            <label className="assist-field">
              <span>HTML body</span>
              <textarea value={html} onChange={(e) => setHtml(e.target.value)} rows={12} />
            </label>
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
            {html ? (
              <button type="button" className="assist-mini-btn" onClick={() => setHtml('')}>
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
