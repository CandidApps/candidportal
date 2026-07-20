'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { buildSignupHref } from '@/lib/marketing/signup';

export function MarketplaceHeroQuote() {
  const router = useRouter();
  const [query, setQuery] = useState('');

  const startQuote = () => {
    router.push(
      buildSignupHref({
        intent: 'quote',
        q: query.trim() || undefined,
      }),
    );
  };

  return (
    <div className="mkt-market-search-hero">
      <input
        type="search"
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') {
            e.preventDefault();
            startQuote();
          }
        }}
        placeholder="What do you need a quote for? e.g. Dialpad, fiber, cyber…"
        aria-label="What do you need a quote for"
      />
      <button type="button" className="mkt-btn mkt-btn--primary" onClick={startQuote}>
        Get a quote
      </button>
    </div>
  );
}
