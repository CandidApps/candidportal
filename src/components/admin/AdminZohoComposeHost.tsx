'use client';

import { useEffect, useState } from 'react';
import {
  ADMIN_COMPOSE_EVENT,
  type AdminComposeLaunch,
} from '@/lib/email/admin-compose';
import { AdminZohoComposeModal } from '@/components/admin/AdminZohoComposeModal';

/** Global listener so any admin surface can open Zoho compose without mailto:. */
export function AdminZohoComposeHost() {
  const [target, setTarget] = useState<AdminComposeLaunch | null>(null);

  useEffect(() => {
    const onLaunch = (e: Event) => {
      const detail = (e as CustomEvent<AdminComposeLaunch>).detail;
      if (detail?.to) setTarget(detail);
    };
    window.addEventListener(ADMIN_COMPOSE_EVENT, onLaunch);
    return () => window.removeEventListener(ADMIN_COMPOSE_EVENT, onLaunch);
  }, []);

  if (!target) return null;
  return <AdminZohoComposeModal target={target} onClose={() => setTarget(null)} />;
}
