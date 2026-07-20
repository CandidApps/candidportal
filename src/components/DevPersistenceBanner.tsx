'use client';

import { showLocalPersistenceControls } from '@/lib/persistence/config';
import { clearLocalPersistenceData } from '@/lib/persistence/local-data-store';

export function DevPersistenceBanner() {
  if (!showLocalPersistenceControls()) return null;

  return (
    <div className="dev-persistence-banner" role="status">
      <strong>Local test mode</strong>
      <span>
        Uploads, services, and analysis reviews are saved in this browser only — not Supabase.
      </span>
      <button
        type="button"
        className="dev-persistence-banner-btn"
        onClick={() => {
          if (
            window.confirm(
              'Clear all local test data from this browser? (Services, reviews, upload fingerprints)',
            )
          ) {
            clearLocalPersistenceData();
            window.location.reload();
          }
        }}
      >
        Clear local data
      </button>
      <span className="dev-persistence-banner-hint">
        Use the sidebar control (above Sign Out) to push reviewed local data to the database.
      </span>
    </div>
  );
}
