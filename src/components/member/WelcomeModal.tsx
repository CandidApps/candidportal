'use client';

import React from 'react';
import { AppIcon } from '@/components/AppIcon';

type WelcomeModalProps = {
  name: string;
  onClose: () => void;
};

export function WelcomeModal({ name, onClose }: WelcomeModalProps) {
  const first = name.split(/\s+/)[0] ?? 'there';
  return (
    <div
      className="modal-overlay open"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <div
        className="modal-box"
        style={{ maxWidth: 480 }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="modal-header">
          <div className="modal-header-left">
            <div className="modal-hank-avatar">
              <AppIcon name="hank" size={18} />
            </div>
            <div>
              <div className="modal-title">Welcome to Candid</div>
              <div className="modal-subtitle">Your intelligence platform is ready</div>
            </div>
          </div>
          <button type="button" className="modal-close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body" style={{ padding: '24px 28px' }}>
          <p style={{ fontSize: 15, lineHeight: 1.65, color: 'var(--gray-dark)', margin: '0 0 20px' }}>
            Hi {first} — whether you joined through our team or signed up on your own, you&apos;re set up to
            see every technology cost in one place. Upload bills, track contracts, and let Hank surface savings
            automatically.
          </p>
          <ul style={{ margin: '0 0 24px', paddingLeft: 20, fontSize: 13, color: 'var(--gray)', lineHeight: 1.7 }}>
            <li>Upload a bill anytime from <strong>My Savings Opportunities</strong></li>
            <li>Managed services appear under <strong>Candid Managed Services</strong></li>
            <li>Open a ticket on any service when you need help</li>
          </ul>
          <button
            type="button"
            className="login-btn"
            style={{ width: '100%' }}
            onClick={onClose}
          >
            Get started →
          </button>
        </div>
      </div>
    </div>
  );
}
