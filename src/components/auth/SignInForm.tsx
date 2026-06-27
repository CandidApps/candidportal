'use client';

import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';
import { createSupabaseBrowserClient } from '@/lib/supabase/browser';
import { sendMagicLinkSignIn } from '@/lib/auth/magic-link';

type SignInMode = 'password' | 'magic';

export function SignInForm({ initialError }: { initialError?: string }) {
  const router = useRouter();
  const [mode, setMode] = useState<SignInMode>('password');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState(initialError ?? '');
  const [notice, setNotice] = useState('');
  const [loading, setLoading] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError('');
    setNotice('');

    const trimmed = email.trim();
    if (!trimmed) {
      setError('Please enter your email address.');
      return;
    }

    setLoading(true);

    if (mode === 'magic') {
      const result = await sendMagicLinkSignIn(trimmed);
      setLoading(false);
      if (!result.ok) {
        setError(result.message);
        return;
      }
      setNotice(result.message);
      return;
    }

    const supabase = createSupabaseBrowserClient();
    const { error: signInError } = await supabase.auth.signInWithPassword({
      email: trimmed,
      password,
    });
    setLoading(false);

    if (signInError) {
      setError(signInError.message);
      return;
    }

    router.push('/app');
    router.refresh();
  };

  return (
    <>
      <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
        <button
          type="button"
          onClick={() => {
            setMode('password');
            setError('');
            setNotice('');
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${mode === 'password' ? '#8b1a12' : '#e2e2e2'}`,
            background: mode === 'password' ? '#c8281e' : '#fff',
            color: mode === 'password' ? '#fff' : '#6b6b6b',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Password
        </button>
        <button
          type="button"
          onClick={() => {
            setMode('magic');
            setError('');
            setNotice('');
          }}
          style={{
            flex: 1,
            padding: '8px 10px',
            borderRadius: 8,
            border: `1px solid ${mode === 'magic' ? '#8b1a12' : '#e2e2e2'}`,
            background: mode === 'magic' ? '#c8281e' : '#fff',
            color: mode === 'magic' ? '#fff' : '#6b6b6b',
            fontWeight: 600,
            fontSize: 12,
            cursor: 'pointer',
          }}
        >
          Email link
        </button>
      </div>

      {error ? (
        <div
          style={{
            border: '1px solid #fecaca',
            background: '#fef2f2',
            color: '#991b1b',
            padding: '10px 12px',
            borderRadius: 10,
            marginBottom: 12,
            fontSize: 13,
          }}
        >
          {error}
        </div>
      ) : null}

      {notice ? (
        <div
          style={{
            border: '1px solid #bbf7d0',
            background: '#f0fdf4',
            color: '#166534',
            padding: '10px 12px',
            borderRadius: 10,
            marginBottom: 12,
            fontSize: 13,
            lineHeight: 1.45,
          }}
        >
          {notice}
        </div>
      ) : null}

      <form onSubmit={submit} style={{ display: 'grid', gap: 12 }}>
        <label style={{ display: 'grid', gap: 6 }}>
          <span style={{ fontSize: 12, color: '#6b6b6b' }}>Email</span>
          <input
            name="email"
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            placeholder="you@company.com"
            style={{
              padding: '10px 12px',
              borderRadius: 10,
              border: '1px solid #e2e2e2',
            }}
          />
        </label>

        {mode === 'password' ? (
          <label style={{ display: 'grid', gap: 6 }}>
            <span style={{ fontSize: 12, color: '#6b6b6b' }}>Password</span>
            <input
              name="password"
              type="password"
              required
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="••••••••"
              style={{
                padding: '10px 12px',
                borderRadius: 10,
                border: '1px solid #e2e2e2',
              }}
            />
          </label>
        ) : (
          <p style={{ margin: 0, fontSize: 12, color: '#6b6b6b', lineHeight: 1.5 }}>
            We&apos;ll email you a secure one-time sign-in link. No password needed.
          </p>
        )}

        <button
          type="submit"
          disabled={loading}
          style={{
            padding: '10px 12px',
            borderRadius: 10,
            border: '1px solid #8b1a12',
            background: loading ? '#e2e2e2' : '#c8281e',
            color: loading ? '#6b6b6b' : '#fff',
            fontWeight: 600,
            cursor: loading ? 'not-allowed' : 'pointer',
          }}
        >
          {loading
            ? 'Please wait…'
            : mode === 'magic'
              ? 'Send sign-in link'
              : 'Sign in'}
        </button>
      </form>
    </>
  );
}
