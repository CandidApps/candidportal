'use client';

import type { CandidContractRecord, CustomerDocument } from '@/lib/customer-records';
import { documentViewUrl, findDocumentForContract } from '@/lib/contract-document-link';
import { isCustomerDocumentAvailable } from '@/lib/crm/document-url';

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

/** Document icon for contracts with a linked/viewable file — opens in a new tab. */
export function ContractDocumentLink({
  contract,
  documents,
  onClick,
}: {
  contract: CandidContractRecord;
  documents: CustomerDocument[];
  onClick?: (event: React.MouseEvent) => void;
}) {
  const relatedDoc = findDocumentForContract(contract, documents);
  if (!relatedDoc) return null;

  const viewHref = documentViewUrl(relatedDoc);
  const canView = Boolean(viewHref && isCustomerDocumentAvailable(relatedDoc));

  if (!canView) {
    return (
      <span
        style={{ ...linkStyle, opacity: 0.35, cursor: 'not-allowed', color: 'var(--gray)' }}
        title={`${relatedDoc.filename} is on file but not available to view`}
        onClick={(e) => {
          e.stopPropagation();
          onClick?.(e);
        }}
      >
        <FileIcon />
      </span>
    );
  }

  return (
    <a
      href={viewHref!}
      target="_blank"
      rel="noopener noreferrer"
      style={linkStyle}
      title={`View ${relatedDoc.filename}`}
      onClick={(e) => {
        e.stopPropagation();
        onClick?.(e);
      }}
    >
      <FileIcon />
    </a>
  );
}
