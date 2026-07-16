'use client';

import type { CSSProperties, ReactNode } from 'react';

/** tel: href from a display phone string — keeps leading +, strips everything else. */
export function telHref(phone: string): string {
  const trimmed = phone.trim();
  const digits = trimmed.replace(/[^\d]/g, '');
  return trimmed.startsWith('+') ? `tel:+${digits}` : `tel:${digits}`;
}

/** True when a string looks like a phone number (enough digits, no letters). */
export function looksLikePhone(value: string): boolean {
  const s = value.trim();
  if (!s || /[a-z]/i.test(s)) return false;
  const digits = s.replace(/\D/g, '');
  return digits.length >= 7 && digits.length <= 15;
}

/**
 * Renders a phone number as a clickable tel: link. Inherits surrounding text
 * color/size by default so it can drop into any table cell or label.
 */
export function PhoneLink({
  phone,
  children,
  style,
  className,
}: {
  phone: string | null | undefined;
  children?: ReactNode;
  style?: CSSProperties;
  className?: string;
}) {
  const value = phone?.trim();
  if (!value) return null;
  return (
    <a
      href={telHref(value)}
      className={className}
      style={{ color: 'inherit', textDecoration: 'underline', textUnderlineOffset: 2, ...style }}
      onClick={(e) => e.stopPropagation()}
    >
      {children ?? value}
    </a>
  );
}
