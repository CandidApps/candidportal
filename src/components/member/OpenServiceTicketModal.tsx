'use client';

import React, { useState } from 'react';
import type { ServiceCardModel } from '@/lib/services/account-services';

type OpenServiceTicketModalProps = {
  service: ServiceCardModel;
  customerName: string;
  customerEmail: string;
  onClose: () => void;
  onSubmit: (subject: string, message: string) => void;
};

export function OpenServiceTicketModal({
  service,
  customerName,
  customerEmail,
  onClose,
  onSubmit,
}: OpenServiceTicketModalProps) {
  const [subject, setSubject] = useState(`Question about ${service.name}`);
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');

  const submit = () => {
    if (!message.trim()) {
      setError('Please describe what you need help with.');
      return;
    }
    onSubmit(subject.trim() || `Ticket: ${service.name}`, message.trim());
    onClose();
  };

  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div className="modal-box" style={{ maxWidth: 480 }} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <div className="modal-header-left">
            <div>
              <div className="modal-title">Open a ticket</div>
              <div className="modal-subtitle">{service.name}</div>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ padding: '20px 24px' }}>
          <p style={{ fontSize: 12, color: 'var(--gray)', margin: '0 0 16px' }}>
            {customerName} · {customerEmail}
          </p>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Subject</label>
            <input value={subject} onChange={(e) => setSubject(e.target.value)} style={inputStyle} />
          </div>
          <div style={{ marginBottom: 14 }}>
            <label style={labelStyle}>Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={4}
              placeholder="Describe billing issues, contract questions, or changes you need…"
              style={{ ...inputStyle, resize: 'vertical' }}
            />
          </div>
          {error && <div style={{ fontSize: 12, color: 'var(--red)', marginBottom: 12 }}>{error}</div>}
          <button type="button" className="login-btn" style={{ width: '100%' }} onClick={submit}>
            Submit ticket
          </button>
        </div>
      </div>
    </div>
  );
}

const labelStyle: React.CSSProperties = {
  display: 'block',
  fontSize: 11,
  fontWeight: 600,
  letterSpacing: '0.08em',
  textTransform: 'uppercase',
  color: 'var(--gray)',
  marginBottom: 6,
};

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '10px 12px',
  fontFamily: "'DM Sans',sans-serif",
  fontSize: 14,
  color: 'var(--gray-dark)',
  outline: 'none',
};
