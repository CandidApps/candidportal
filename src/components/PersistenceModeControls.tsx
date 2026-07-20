'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  clearLocalPersistenceData,
  getLocalPersistenceCounts,
  getLocalPersistenceSnapshot,
} from '@/lib/persistence/local-data-store';

type PersistenceModeControlsProps = {
  collapsed?: boolean;
};

export function PersistenceModeControls({ collapsed = false }: PersistenceModeControlsProps) {
  const [pushing, setPushing] = useState(false);
  const [counts, setCounts] = useState({ services: 0, reviews: 0, fingerprints: 0 });

  const refreshCounts = useCallback(() => {
    setCounts(getLocalPersistenceCounts());
  }, []);

  useEffect(() => {
    refreshCounts();
  }, [refreshCounts]);

  const pushToDatabase = async () => {
    const total = counts.services + counts.reviews + counts.fingerprints;
    if (total === 0) {
      window.alert('No local test data to push.');
      return;
    }

    const confirmed = window.confirm(
      `Before pushing local data to Supabase, confirm that you have personally reviewed the app UI and verified there are no data quality mismatches.\n\nThis will push ${counts.services} service(s), ${counts.reviews} review(s), and ${counts.fingerprints} fingerprint(s) from this browser to Supabase.\n\nBill files stored only locally (local://) will be skipped.`,
    );
    if (!confirmed) return;

    setPushing(true);
    try {
      const snapshot = getLocalPersistenceSnapshot();
      const res = await fetch('/api/persistence/push-local', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(snapshot),
      });
      const json = (await res.json()) as {
        error?: string;
        services?: number;
        reviews?: number;
        fingerprints?: number;
        skippedBillPaths?: number;
      };
      if (!res.ok) throw new Error(json.error ?? 'Push failed');

      const summary = [
        `${json.services ?? 0} service(s)`,
        `${json.reviews ?? 0} review(s)`,
        `${json.fingerprints ?? 0} fingerprint(s)`,
      ].join(', ');
      const skipNote =
        json.skippedBillPaths && json.skippedBillPaths > 0
          ? `\n\n${json.skippedBillPaths} local-only bill path(s) were not uploaded.`
          : '';

      const clearAfter = window.confirm(
        `Pushed to database: ${summary}.${skipNote}\n\nClear local data from this browser? You will stay in local mode either way.`,
      );
      if (clearAfter) {
        clearLocalPersistenceData();
        window.location.reload();
      } else {
        refreshCounts();
      }
    } catch (err) {
      window.alert(err instanceof Error ? err.message : 'Push failed');
    } finally {
      setPushing(false);
    }
  };

  const hasLocalData = counts.services + counts.reviews + counts.fingerprints > 0;

  return (
    <div className={`sb-persistence${collapsed ? ' sb-persistence--collapsed' : ''}`}>
      {!collapsed ? (
        <div className="sb-persistence-label">Local data storage</div>
      ) : null}
      {!collapsed ? (
        <div className="sb-persistence-status" title="Admins work in local browser storage">
          Local mode
        </div>
      ) : null}
      <button
        type="button"
        className="sb-persistence-push"
        onClick={() => void pushToDatabase()}
        disabled={pushing || !hasLocalData}
        title={
          hasLocalData
            ? 'Upload local test data to Supabase'
            : 'No local test data to push'
        }
      >
        {pushing ? '…' : collapsed ? '↑' : 'Push local → DB'}
      </button>
    </div>
  );
}
