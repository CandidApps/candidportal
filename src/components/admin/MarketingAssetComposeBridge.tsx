'use client';

import { useEffect } from 'react';
import { launchAdminZohoCompose } from '@/lib/email/admin-compose';
import {
  composeLaunchFromMarketingAsset,
  MARKETING_ASSET_SELECTED_EVENT,
} from '@/lib/marketing-hub';
import type { MarketingAssetSelectedDetail } from '@/lib/marketing-hub-types';

/** Bridges marketing asset selection into the Zoho compose modal. */
export function MarketingAssetComposeBridge() {
  useEffect(() => {
    const onSelected = (e: Event) => {
      const detail = (e as CustomEvent<MarketingAssetSelectedDetail>).detail;
      if (!detail?.asset || !detail.openCompose) return;
      void composeLaunchFromMarketingAsset(detail.asset).then((launch) => launchAdminZohoCompose(launch));
    };
    window.addEventListener(MARKETING_ASSET_SELECTED_EVENT, onSelected);
    return () => window.removeEventListener(MARKETING_ASSET_SELECTED_EVENT, onSelected);
  }, []);
  return null;
}
