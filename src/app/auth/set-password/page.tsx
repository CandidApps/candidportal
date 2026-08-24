'use client';

import { Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { PasswordForm } from '@/components/auth/PasswordForm';

function SetPasswordContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get('next')?.trim() || '/app';
  const safeNext = next.startsWith('/') ? next : '/app';

  return (
    <main
      style={{
        minHeight: '100vh',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        background: 'var(--gray-bg, #f5f5f5)',
      }}
    >
      <div
        style={{
          width: '100%',
          maxWidth: 440,
          background: '#fff',
          border: '1px solid var(--gray-border, #e2e2e2)',
          borderRadius: 12,
          padding: 24,
        }}
      >
        <h1 style={{ marginTop: 0, marginBottom: 8 }}>Create your password</h1>
        <p style={{ marginTop: 0, color: 'var(--gray)', marginBottom: 20, lineHeight: 1.5 }}>
          Welcome to the Candid portal. Choose a password so you can sign in anytime without waiting
          for an email link.
        </p>
        <PasswordForm
          mode="create"
          submitLabel="Save password & continue"
          onSuccess={() => {
            router.replace(safeNext);
            router.refresh();
          }}
        />
      </div>
    </main>
  );
}

export default function SetPasswordPage() {
  return (
    <Suspense fallback={null}>
      <SetPasswordContent />
    </Suspense>
  );
}
