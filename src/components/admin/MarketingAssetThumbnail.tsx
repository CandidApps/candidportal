'use client';

import { useEffect, useMemo, useState } from 'react';
import { AppIcon } from '@/components/AppIcon';
import { marketingAssetViewUrl } from '@/lib/marketing-hub';
import {
  marketingPreviewKindFromAsset,
  marketingPreviewKindFromFile,
  type MarketingAsset,
  type MarketingPreviewKind,
} from '@/lib/marketing-hub-types';

const thumbFrameStyle: React.CSSProperties = {
  width: '100%',
  height: '100%',
  overflow: 'hidden',
  position: 'relative',
  background: '#fff',
};

const scaledIframeStyle: React.CSSProperties = {
  position: 'absolute',
  top: 0,
  left: 0,
  width: '400%',
  height: '400%',
  transform: 'scale(0.25)',
  transformOrigin: 'top left',
  border: 'none',
  pointerEvents: 'none',
};

function DocumentPlaceholder({ label }: { label?: string }) {
  return (
    <div
      style={{
        ...thumbFrameStyle,
        display: 'flex',
        flexDirection: 'column',
        padding: 10,
        boxSizing: 'border-box',
        background: 'linear-gradient(180deg, #fff 0%, var(--gray-pale) 100%)',
      }}
    >
      <div style={{ width: '36%', height: 6, borderRadius: 3, background: 'var(--red-pale)', marginBottom: 8 }} />
      <div style={{ height: 4, borderRadius: 2, background: 'var(--gray-border)', marginBottom: 4, width: '92%' }} />
      <div style={{ height: 4, borderRadius: 2, background: 'var(--gray-border)', marginBottom: 4, width: '78%' }} />
      <div style={{ height: 4, borderRadius: 2, background: 'var(--gray-border)', marginBottom: 4, width: '86%' }} />
      <div style={{ flex: 1 }} />
      <div style={{ display: 'flex', alignItems: 'center', gap: 6, color: 'var(--gray-mid)', fontSize: 10, fontWeight: 600 }}>
        <AppIcon name="file" size={14} />
        <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{label ?? 'Document'}</span>
      </div>
    </div>
  );
}

function PreviewByKind({
  kind,
  src,
  label,
  fit = 'cover',
}: {
  kind: MarketingPreviewKind;
  src: string;
  label?: string;
  fit?: 'cover' | 'contain';
}) {
  if (kind === 'image') {
    return (
      <img
        src={src}
        alt={label ?? ''}
        style={{ width: '100%', height: '100%', objectFit: fit, display: 'block', background: '#fff' }}
      />
    );
  }
  if (kind === 'pdf') {
    return (
      <div style={thumbFrameStyle}>
        <iframe
          src={`${src}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`}
          title={label ?? 'PDF preview'}
          tabIndex={-1}
          style={scaledIframeStyle}
        />
      </div>
    );
  }
  if (kind === 'html') {
    return (
      <div style={thumbFrameStyle}>
        <iframe src={src} title={label ?? 'HTML preview'} tabIndex={-1} style={scaledIframeStyle} />
      </div>
    );
  }
  return <DocumentPlaceholder label={label} />;
}

/** Inline rectangle preview for marketing assets (grid cards, upload drop zone). */
export function MarketingAssetThumbnail({
  asset,
  file,
  label,
  fit = 'cover',
}: {
  asset?: MarketingAsset;
  file?: File | null;
  label?: string;
  fit?: 'cover' | 'contain';
}) {
  const [objectUrl, setObjectUrl] = useState<string | null>(null);

  const fileKind = useMemo(() => (file ? marketingPreviewKindFromFile(file) : null), [file]);
  const assetKind = useMemo(() => (asset ? marketingPreviewKindFromAsset(asset) : null), [asset]);

  useEffect(() => {
    if (!file) {
      setObjectUrl(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setObjectUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  if (file && objectUrl && fileKind) {
    return <PreviewByKind kind={fileKind} src={objectUrl} label={label ?? file.name} fit={fit} />;
  }

  if (asset && assetKind) {
    return (
      <PreviewByKind
        kind={assetKind}
        src={marketingAssetViewUrl(asset.id)}
        label={label ?? asset.title}
        fit={fit}
      />
    );
  }

  return <DocumentPlaceholder label={label} />;
}
