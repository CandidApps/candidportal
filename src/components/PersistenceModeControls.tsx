'use client';

import { useCallback, useEffect, useState } from 'react';
import {
  getDataPersistenceMode,
  setRuntimePersistenceMode,
  type DataPersistenceMode,
} from '@/lib/persistence/config';
import {
  clearLocalPersistenceData,
  getLocalPersistenceCounts,
  getLocalPersistenceSnapshot,
} from '@/lib/persistence/local-data-store';

type PersistenceModeControlsProps = {
  collapsed?: boolean;
};

export function PersistenceModeControls({ collapsed = false }: PersistenceModeControlsProps) {
  const [mode, setMode] = useState<DataPersistenceMode>('supabase');
  const [pushing, setPushing] = useState(false);
  const [counts, setCounts] = useState({ services: 0, reviews: 0, fingerprints: 0 });

  const refreshCounts = useCallback(() => {
    setCounts(getLocalPersistenceCounts());
  }, []);

  useEffect(() => {
    setMode(getDataPersistenceMode());
    refreshCounts();
  }, [refreshCounts]);

  const switchMode = (next: DataPersistenceMode) => {
    if (next === mode) return;
    setRuntimePersistenceMode(next);
  };

  const pushToDatabase = async () => {
    const total = counts.services + counts.reviews + counts.fingerprints;
    if (total === 0) {
      window.alert('No local test data to push.');
      return;
    }

    const confirmed = window.confirm(
      `Push ${counts.services} service(s), ${counts.reviews} review(s), and ${counts.fingerprints} fingerprint(s) from this browser to Supabase?\n\nBill files stored only locally (local://) will be skipped.`,
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
        `Pushed to database: ${summary}.${skipNote}\n\nClear local test data and switch to database mode?`,
      );
      if (clearAfter) {
        clearLocalPersistenceData();
        setRuntimePersistenceMode('supabase');
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
        <div className="sb-persistence-label">Test data storage</div>
      ) : null}
      <div className="sb-persistence-toggle" role="group" aria-label="Test data storage mode">
        <button
          type="button"
          className={`sb-persistence-option${mode === 'local' ? ' is-active' : ''}`}
          onClick={() => switchMode('local')}
          title="Local browser storage"
        >
          {collapsed ? 'L' : 'Local'}
        </button>
        <button
          type="button"
          className={`sb-persistence-option${mode === 'supabase' ? ' is-active' : ''}`}
          onClick={() => switchMode('supabase')}
          title="Supabase database"
        >
          {collapsed ? 'DB' : 'Database'}
        </button>
      </div>
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
