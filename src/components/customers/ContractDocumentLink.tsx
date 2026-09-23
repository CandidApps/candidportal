'use client';

import type { MouseEvent } from 'react';
import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import { documentDisplayName } from '@/lib/customer-records';
import { documentViewUrl, findDocumentForContract, findDocumentsForContract } from '@/lib/contract-document-link';
import { isCustomerDocumentAvailable } from '@/lib/crm/document-url';
import { openDocumentViewer } from '@/lib/document-viewer';

const iconBase = {
  width: 14,
  height: 14,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
};

function FileIcon() {
  return (
    <svg {...iconBase}>
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
      <polyline points="14 2 14 8 20 8" />
    </svg>
  );
}

const linkStyle: React.CSSProperties = {
  display: 'inline-flex',
  alignItems: 'center',
  justifyContent: 'center',
  width: 28,
  height: 28,
  border: '1px solid var(--gray-border)',
  borderRadius: 5,
  background: 'var(--white)',
  color: 'var(--blue)',
  flexShrink: 0,
  textDecoration: 'none',
};

/** Document icon for contracts with linked/viewable file(s) — opens primary in viewer. */
export function ContractDocumentLink({
  contract,
  documents,
  onClick,
}: {
  contract: CandidContractRecord;
  documents: CustomerDocument[];
  onClick?: (event: MouseEvent) => void;
}) {
  const linked = findDocumentsForContract(contract, documents);
  const relatedDoc = findDocumentForContract(contract, documents);
  if (!relatedDoc) return null;

  const label = documentDisplayName(relatedDoc);
  const viewHref = documentViewUrl(relatedDoc);
  const canView = Boolean(viewHref && isCustomerDocumentAvailable(relatedDoc));
  const multi = linked.length > 1;

  if (!canView) {
    return (
      <span
        style={{ ...linkStyle, opacity: 0.35, cursor: 'not-allowed', color: 'var(--gray)', position: 'relative' }}
        title={`${label} is on file but not available to view`}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
      >
        <FileIcon />
        {multi ? (
          <span
            style={{
              position: 'absolute',
              top: -4,
              right: -4,
              minWidth: 14,
              height: 14,
              borderRadius: 7,
              background: 'var(--gray)',
              color: '#fff',
              fontSize: 9,
              fontWeight: 700,
              lineHeight: '14px',
              textAlign: 'center',
              padding: '0 3px',
            }}
          >
            {linked.length}
          </span>
        ) : null}
      </span>
    );
  }

  return (
    <button
      type="button"
      style={{ ...linkStyle, cursor: 'pointer', position: 'relative' }}
      title={multi ? `View ${label} (+${linked.length - 1} more)` : `View ${label}`}
      onClick={(e) => {
        e.stopPropagation();
        openDocumentViewer({ url: viewHref!, title: label, filename: relatedDoc.filename });
        onClick?.(e);
      }}
    >
      <FileIcon />
      {multi ? (
        <span
          style={{
            position: 'absolute',
            top: -4,
            right: -4,
            minWidth: 14,
            height: 14,
            borderRadius: 7,
            background: 'var(--blue)',
            color: '#fff',
            fontSize: 9,
            fontWeight: 700,
            lineHeight: '14px',
            textAlign: 'center',
            padding: '0 3px',
          }}
        >
          {linked.length}
        </span>
      ) : null}
    </button>
  );
}
