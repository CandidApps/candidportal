'use client';

import { useEffect, useState } from 'react';
import {
  MARKETING_ASSET_PICKER_EVENT,
  type MarketingAssetPickerLaunch,
} from '@/lib/marketing-hub';
import { MarketingAssetPickerModal } from '@/components/admin/MarketingAssetPickerModal';

/** Global marketing asset picker — open via openMarketingAssetPicker(). */
export function MarketingAssetPickerHost() {
  const [handler, setHandler] = useState<((asset: import('@/lib/marketing-hub-types').MarketingAsset) => void) | null>(null);

  useEffect(() => {
    const onOpen = (e: Event) => {
      const detail = (e as CustomEvent<MarketingAssetPickerLaunch>).detail;
      if (detail?.onSelect) setHandler(() => detail.onSelect);
    };
    window.addEventListener(MARKETING_ASSET_PICKER_EVENT, onOpen);
    return () => window.removeEventListener(MARKETING_ASSET_PICKER_EVENT, onOpen);
  }, []);

  if (!handler) return null;
  return (
    <MarketingAssetPickerModal
      onSelect={handler}
      onClose={() => setHandler(null)}
    />
  );
}
