'use client';

import { useEffect, useRef, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { searchPortalContacts, type PortalContact } from '@/lib/assistant/types';
import {
  isValidEmailAddress,
  parseEmailAddress,
  splitRecipientParts,
} from '@/lib/email/address-parse';

export type Recipient = { email: string; name?: string };

export function parseRecipients(raw: string): Recipient[] {
  return splitRecipientParts(raw).map(({ email, name }) => ({ email, name }));
}

/** Joins recipients into the comma-separated string the send API expects. */
export function joinRecipientEmails(list: Recipient[]): string {
  return Array.from(new Set(list.map((r) => r.email.trim()).filter(Boolean))).join(', ');
}

/** Adds an address to a list, ignoring duplicates (case-insensitive). */
export function addRecipientEmail(list: Recipient[], email: string, name?: string): Recipient[] {
  const next = email.trim();
  if (!next) return list;
  if (list.some((r) => r.email.toLowerCase() === next.toLowerCase())) return list;
  return [...list, { email: next, name }];
}

const CONTACT_TYPE_LABEL: Record<PortalContact['type'], string> = {
  account: 'Account',
  supplier: 'Supplier',
  team: 'Candid',
};

/** Recipient input with removable chips and portal-contact autocomplete. */
export function RecipientField({
  label,
  recipients,
  onChange,
  autoFocus,
}: {
  label: string;
  recipients: Recipient[];
  onChange: (next: Recipient[]) => void;
  autoFocus?: boolean;
}) {
  const [input, setInput] = useState('');
  const [suggestions, setSuggestions] = useState<PortalContact[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const q = input.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    let cancelled = false;
    const t = setTimeout(async () => {
      const res = await searchPortalContacts(q);
      if (cancelled) return;
      const have = new Set(recipients.map((r) => r.email.toLowerCase()));
      const filtered = res.filter((c) => !have.has(c.email.toLowerCase())).slice(0, 8);
      setSuggestions(filtered);
      setOpen(filtered.length > 0);
      setActive(0);
    }, 180);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [input, recipients]);

  const addRecipient = (r: Recipient) => {
    const email = r.email.trim();
    if (!email) return;
    if (!recipients.some((x) => x.email.toLowerCase() === email.toLowerCase())) {
      onChange([...recipients, { email, name: r.name }]);
    }
    setInput('');
    setSuggestions([]);
    setOpen(false);
  };

  const commitText = () => {
    const v = input.trim().replace(/[,;]+$/, '').trim();
    if (!v) return;
    const email = parseEmailAddress(v);
    if (isValidEmailAddress(email)) addRecipient({ email });
  };

  const removeAt = (i: number) => onChange(recipients.filter((_, idx) => idx !== i));

  return (
    <div className="assist-recip-field">
      <span className="assist-recip-label">{label}</span>
      <div className="assist-recip-box" onClick={() => inputRef.current?.focus()}>
        {recipients.map((r, i) => (
          <span key={`${r.email}-${i}`} className="assist-recip-chip" title={r.email}>
            {r.name ? `${r.name} · ${r.email}` : r.email}
            <button
              type="button"
              className="assist-recip-chip-x"
              onClick={(e) => {
                e.stopPropagation();
                removeAt(i);
              }}
              aria-label={`Remove ${r.email}`}
            >
              <AppIcon name="close" size={9} />
            </button>
          </span>
        ))}
        <input
          ref={inputRef}
          autoFocus={autoFocus}
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ',' || e.key === ';' || e.key === 'Tab') {
              if (open && suggestions[active]) {
                e.preventDefault();
                const c = suggestions[active];
                addRecipient({ email: c.email, name: c.name });
              } else if (input.trim()) {
                e.preventDefault();
                commitText();
              }
            } else if (e.key === 'Backspace' && !input && recipients.length) {
              removeAt(recipients.length - 1);
            } else if (e.key === 'ArrowDown' && open) {
              e.preventDefault();
              setActive((a) => Math.min(a + 1, suggestions.length - 1));
            } else if (e.key === 'ArrowUp' && open) {
              e.preventDefault();
              setActive((a) => Math.max(a - 1, 0));
            } else if (e.key === 'Escape') {
              setOpen(false);
            }
          }}
          onBlur={() => {
            commitText();
            setTimeout(() => setOpen(false), 120);
          }}
          placeholder={recipients.length ? '' : 'Add people — search portal contacts…'}
        />
        {open && (
          <ul className="assist-recip-menu" role="listbox">
            {suggestions.map((c, i) => (
              <li
                key={c.email}
                role="option"
                aria-selected={i === active}
                className={`assist-recip-opt${i === active ? ' active' : ''}`}
                onMouseEnter={() => setActive(i)}
                onMouseDown={(e) => {
                  e.preventDefault();
                  addRecipient({ email: c.email, name: c.name });
                }}
              >
                <span className="assist-recip-opt-main">
                  <span className="assist-recip-opt-name">{c.name}</span>
                  <span className="assist-recip-opt-email">{c.email}</span>
                </span>
                <span className="assist-recip-opt-meta">
                  {c.org ? <span className="assist-recip-opt-org">{c.org}</span> : null}
                  <span className={`assist-recip-opt-type t-${c.type}`}>
                    {CONTACT_TYPE_LABEL[c.type]}
                  </span>
                </span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
