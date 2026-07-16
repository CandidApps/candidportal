'use client';

import { useEffect, useId, useRef, useState } from 'react';

type Suggestion = {
  placeId: string;
  label: string;
  mainText: string;
  secondaryText: string;
};

export type ParsedAddress = {
  street: string;
  city: string;
  state: string;
  zip: string;
  formatted: string;
};

/**
 * Google Places–backed address field. Falls back to plain typing when the API
 * key is not configured (503) or Places fails.
 */
export function AddressAutocompleteInput({
  value,
  onChange,
  onAddressSelected,
  placeholder = 'Start typing an address…',
  className = 'nq-input',
  invalid = false,
  id,
}: {
  value: string;
  onChange: (street: string) => void;
  onAddressSelected: (address: ParsedAddress) => void;
  placeholder?: string;
  className?: string;
  invalid?: boolean;
  id?: string;
}) {
  const listId = useId();
  const [query, setQuery] = useState(value);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const [suggestions, setSuggestions] = useState<Suggestion[]>([]);
  const [placesAvailable, setPlacesAvailable] = useState(true);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const skipNextFetch = useRef(false);

  useEffect(() => {
    setQuery(value);
  }, [value]);

  useEffect(() => {
    if (skipNextFetch.current) {
      skipNextFetch.current = false;
      return;
    }
    const q = query.trim();
    if (!placesAvailable || q.length < 3) {
      setSuggestions([]);
      return;
    }
    let cancelled = false;
    const timer = setTimeout(() => {
      setLoading(true);
      void fetch(`/api/places/autocomplete?input=${encodeURIComponent(q)}`)
        .then(async (res) => {
          if (res.status === 503) {
            setPlacesAvailable(false);
            return { suggestions: [] as Suggestion[] };
          }
          return (await res.json()) as { suggestions?: Suggestion[] };
        })
        .then((json) => {
          if (cancelled) return;
          setSuggestions(json.suggestions ?? []);
          setOpen(true);
        })
        .catch(() => {
          if (!cancelled) setSuggestions([]);
        })
        .finally(() => {
          if (!cancelled) setLoading(false);
        });
    }, 280);
    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query, placesAvailable]);

  const pick = async (s: Suggestion) => {
    setOpen(false);
    setSuggestions([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/places/details?placeId=${encodeURIComponent(s.placeId)}`);
      const json = (await res.json()) as { address?: ParsedAddress; error?: string };
      if (res.ok && json.address) {
        skipNextFetch.current = true;
        setQuery(json.address.street || s.mainText);
        onAddressSelected(json.address);
        return;
      }
    } catch {
      /* fall through */
    } finally {
      setLoading(false);
    }
    skipNextFetch.current = true;
    setQuery(s.mainText);
    onChange(s.mainText);
  };

  return (
    <div className="nq-address-ac">
      <input
        id={id}
        className={className}
        value={query}
        placeholder={placeholder}
        aria-invalid={invalid}
        aria-autocomplete="list"
        aria-controls={listId}
        aria-expanded={open && suggestions.length > 0}
        autoComplete="street-address"
        onFocus={() => {
          if (suggestions.length) setOpen(true);
        }}
        onBlur={() => {
          blurTimer.current = setTimeout(() => setOpen(false), 150);
        }}
        onChange={(e) => {
          const next = e.target.value;
          setQuery(next);
          onChange(next);
          setOpen(true);
        }}
      />
      {loading ? <span className="nq-address-ac-status">Looking up…</span> : null}
      {open && suggestions.length > 0 ? (
        <ul
          id={listId}
          className="nq-address-ac-list"
          role="listbox"
          onMouseDown={(e) => e.preventDefault()}
        >
          {suggestions.map((s) => (
            <li key={s.placeId}>
              <button type="button" className="nq-address-ac-option" onClick={() => void pick(s)}>
                <span className="nq-address-ac-main">{s.mainText}</span>
                {s.secondaryText ? (
                  <span className="nq-address-ac-secondary">{s.secondaryText}</span>
                ) : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
