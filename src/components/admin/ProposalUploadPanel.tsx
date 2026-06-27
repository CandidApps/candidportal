'use client';

import { useCallback, useState, type DragEvent } from 'react';
import type { AnalysisProposalDocument } from '@/lib/bill-parse-types';
import { DocumentEmbed } from '@/components/admin/DocumentEmbed';

export function ProposalUploadPanel({
  reviewId,
  proposal,
  onUploaded,
  onRemoved,
}: {
  reviewId: string;
  proposal?: AnalysisProposalDocument | null;
  onUploaded: (doc: AnalysisProposalDocument) => void;
  onRemoved: () => void;
}) {
  const [uploading, setUploading] = useState(false);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState('');

  const uploadFile = useCallback(
    async (file: File) => {
      setUploading(true);
      setError('');
      try {
        const form = new FormData();
        form.append('file', file);
        const res = await fetch(`/api/admin/analysis-reviews/${reviewId}/proposal`, {
          method: 'POST',
          body: form,
        });
        if (!res.ok) {
          const data = (await res.json()) as { error?: string };
          throw new Error(data.error ?? 'Upload failed');
        }
        const data = (await res.json()) as { proposalDocument: AnalysisProposalDocument };
        onUploaded(data.proposalDocument);
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Upload failed');
      } finally {
        setUploading(false);
        setDragOver(false);
      }
    },
    [reviewId, onUploaded],
  );

  const removeProposal = async () => {
    setUploading(true);
    setError('');
    try {
      const res = await fetch(`/api/admin/analysis-reviews/${reviewId}/proposal`, {
        method: 'DELETE',
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        throw new Error(data.error ?? 'Remove failed');
      }
      onRemoved();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Remove failed');
    } finally {
      setUploading(false);
    }
  };

  const onDrop = (e: DragEvent) => {
    e.preventDefault();
    setDragOver(false);
    const file = e.dataTransfer.files[0];
    if (file) void uploadFile(file);
  };

  const previewUrl = `/api/analysis-reviews/${reviewId}/proposal`;

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header">
        <div className="card-title">Customer proposal document</div>
      </div>
      <div className="card-body">
        <p style={{ fontSize: 13, color: 'var(--gray)', marginTop: 0, lineHeight: 1.55 }}>
          For categories without built-in fee analysis, upload the proposal PDF or document. Customers
          will see it embedded in their portal after you publish.
        </p>

        {proposal ? (
          <div className="proposal-upload-preview">
            <div className="proposal-upload-file-row">
              <span className="proposal-upload-filename">{proposal.filename}</span>
              <button
                type="button"
                className="admin-ticket-btn"
                disabled={uploading}
                onClick={() => void removeProposal()}
              >
                Remove
              </button>
            </div>
            <DocumentEmbed
              url={previewUrl}
              title={`Proposal preview: ${proposal.filename}`}
              filename={proposal.filename}
              mimeType={proposal.mimeType}
            />
          </div>
        ) : (
          <label
            className={`proposal-upload-dropzone${dragOver ? ' is-dragover' : ''}`}
            onDragOver={(e) => {
              e.preventDefault();
              setDragOver(true);
            }}
            onDragLeave={() => setDragOver(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept=".pdf,.doc,.docx,.png,.jpg,.jpeg,.webp"
              hidden
              disabled={uploading}
              onChange={(e) => {
                const file = e.target.files?.[0];
                if (file) void uploadFile(file);
                e.target.value = '';
              }}
            />
            <div className="proposal-upload-dropzone-title">
              {uploading ? 'Uploading…' : 'Drag and drop proposal here'}
            </div>
            <div className="proposal-upload-dropzone-sub">PDF recommended · or click to browse</div>
          </label>
        )}

        {error && <p style={{ color: 'var(--red)', fontSize: 13, marginBottom: 0 }}>{error}</p>}
      </div>
    </div>
  );
}
