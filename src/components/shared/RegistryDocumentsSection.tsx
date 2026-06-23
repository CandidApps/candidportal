'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
  defaultDocumentType,
  documentOptionsForEntity,
  guessRegistryDocumentType,
  registryDocumentTypeLabel,
  type RegistryDocument,
  type RegistryDocumentType,
  type RegistryEntityType,
} from '@/lib/registry-documents-types';
import {
  deleteRegistryDocument,
  listRegistryDocuments,
  registryDocumentViewUrl,
  uploadRegistryDocument,
} from '@/lib/registry-documents';

const inputStyle: React.CSSProperties = {
  width: '100%',
  border: '1px solid var(--gray-border)',
  borderRadius: 6,
  padding: '8px 10px',
  fontFamily: 'var(--font-sans)',
  fontSize: 13,
  color: 'var(--gray-dark)',
  outline: 'none',
  boxSizing: 'border-box',
};

function formatDisplayDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

export function RegistryDocumentsSection({
  entityType,
  entityKey,
  entityLabel,
  subtitle,
  embedded = false,
  uploadedBy = 'Candid Team',
}: {
  entityType: RegistryEntityType;
  entityKey: string;
  entityLabel: string;
  subtitle?: string;
  embedded?: boolean;
  uploadedBy?: string;
}) {
  const fileRef = useRef<HTMLInputElement>(null);
  const typeOptions = documentOptionsForEntity(entityType);
  const [documents, setDocuments] = useState<RegistryDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [documentType, setDocumentType] = useState<RegistryDocumentType>(defaultDocumentType(entityType));
  const [signedDate, setSignedDate] = useState('');
  const [notes, setNotes] = useState('');
  const [selectedFile, setSelectedFile] = useState<File | null>(null);

  const reload = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const docs = await listRegistryDocuments(entityType, entityKey);
      setDocuments(docs);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load documents');
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [entityType, entityKey]);

  useEffect(() => {
    void reload();
  }, [reload]);

  const resetUploadForm = () => {
    setDocumentType(defaultDocumentType(entityType));
    setSignedDate('');
    setNotes('');
    setSelectedFile(null);
    if (fileRef.current) fileRef.current.value = '';
  };

  const handleFilePick = (file: File | null) => {
    setSelectedFile(file);
    if (file) {
      setDocumentType(guessRegistryDocumentType(entityType, file.name));
    }
  };

  const handleUpload = async () => {
    if (!selectedFile) {
      setError('Choose a file to upload.');
      return;
    }
    setUploading(true);
    setError('');
    try {
      const doc = await uploadRegistryDocument({
        entityType,
        entityKey,
        file: selectedFile,
        documentType,
        uploadedBy,
        signedDate: signedDate || undefined,
        notes: notes || undefined,
      });
      setDocuments((prev) => [doc, ...prev]);
      setUploadOpen(false);
      resetUploadForm();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDelete = async (doc: RegistryDocument) => {
    if (!window.confirm(`Delete ${doc.filename}?`)) return;
    setError('');
    try {
      await deleteRegistryDocument(doc.id);
      setDocuments((prev) => prev.filter((d) => d.id !== doc.id));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const defaultSubtitle =
    entityType === 'commission_partner'
      ? 'Partner agreements, Schedule A, product pricing, and related paperwork'
      : 'Vendor agreements, rate sheets, product pricing, and related paperwork';

  const content = (
    <>
      {error && (
        <div
          style={{
            padding: embedded ? '12px 0' : '12px 16px',
            fontSize: 12,
            color: 'var(--red)',
            borderBottom: embedded ? undefined : '1px solid var(--gray-border)',
          }}
        >
          {error}
        </div>
      )}

      {loading ? (
        <p style={{ padding: embedded ? '12px 0' : 20, fontSize: 13, color: 'var(--gray)' }}>Loading documents…</p>
      ) : documents.length === 0 ? (
        <p style={{ padding: embedded ? '12px 0' : 20, fontSize: 13, color: 'var(--gray)' }}>
          No documents on file for {entityLabel}. Upload an agreement or pricing sheet to get started.
        </p>
      ) : (
        <table className="admin-mini-table comm-table">
          <thead>
            <tr>
              <th>File</th>
              <th>Type</th>
              <th>Signed</th>
              <th>Uploaded</th>
              <th style={{ textAlign: 'right' }}>Size</th>
              <th style={{ width: 140 }}>Actions</th>
            </tr>
          </thead>
          <tbody>
            {documents.map((doc) => (
              <tr key={doc.id}>
                <td>
                  <a
                    href={registryDocumentViewUrl(doc.id)}
                    target="_blank"
                    rel="noopener noreferrer"
                    style={{ color: 'var(--blue)', fontWeight: 600, textDecoration: 'none', fontSize: 13 }}
                  >
                    {doc.filename}
                  </a>
                  {doc.notes ? (
                    <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 3 }}>{doc.notes}</div>
                  ) : null}
                </td>
                <td style={{ fontSize: 12 }}>
                  {registryDocumentTypeLabel(entityType, doc.documentType)}
                </td>
                <td style={{ fontSize: 12, color: 'var(--gray)' }}>{doc.signedDate || '—'}</td>
                <td style={{ fontSize: 12, color: 'var(--gray)' }}>{formatDisplayDate(doc.createdAt)}</td>
                <td style={{ textAlign: 'right', fontFamily: 'var(--font-mono)', fontSize: 12 }}>{doc.fileSizeLabel}</td>
                <td>
                  <div style={{ display: 'flex', gap: 6 }}>
                    <a
                      href={registryDocumentViewUrl(doc.id)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px', textDecoration: 'none' }}
                    >
                      View
                    </a>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: 11, padding: '4px 10px' }}
                      onClick={() => void handleDelete(doc)}
                    >
                      Delete
                    </button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {uploadOpen && (
        <div
          onClick={(e) => {
            if (!uploading && e.target === e.currentTarget) setUploadOpen(false);
          }}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0,0,0,0.65)',
            zIndex: 750,
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              background: 'var(--white)',
              borderRadius: 14,
              width: 480,
              maxWidth: '95vw',
              boxShadow: '0 24px 80px rgba(0,0,0,0.28)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ background: 'var(--gray-dark)', padding: '20px 26px', position: 'relative' }}>
              <div
                style={{
                  position: 'absolute',
                  top: 0,
                  left: 0,
                  right: 0,
                  height: 3,
                  background: 'linear-gradient(90deg,var(--red-dark),var(--red-light))',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div style={{ fontSize: 17, fontWeight: 600, color: 'var(--white)' }}>Upload document</div>
                <button
                  type="button"
                  onClick={() => !uploading && setUploadOpen(false)}
                  style={{ background: 'transparent', border: 'none', color: '#9CA3AF', cursor: 'pointer' }}
                >
                  ✕
                </button>
              </div>
            </div>
            <div style={{ padding: 24, display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
                  Document type
                </label>
                <select
                  value={documentType}
                  onChange={(e) => setDocumentType(e.target.value as RegistryDocumentType)}
                  style={inputStyle}
                >
                  {typeOptions.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label}
                    </option>
                  ))}
                </select>
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
                  File
                </label>
                <input
                  ref={fileRef}
                  type="file"
                  accept=".pdf,.doc,.docx,.xlsx,.jpg,.jpeg,.png,.webp,.csv"
                  onChange={(e) => handleFilePick(e.target.files?.[0] ?? null)}
                  style={inputStyle}
                />
                {selectedFile ? (
                  <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 4 }}>{selectedFile.name}</div>
                ) : null}
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
                  Signed date (optional)
                </label>
                <input type="date" value={signedDate} onChange={(e) => setSignedDate(e.target.value)} style={inputStyle} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: 11, fontWeight: 600, color: 'var(--gray)', marginBottom: 5 }}>
                  Notes (optional)
                </label>
                <textarea
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={3}
                  style={{ ...inputStyle, resize: 'vertical' }}
                />
              </div>
              <div style={{ display: 'flex', gap: 8, marginTop: 4 }}>
                <button
                  type="button"
                  className="btn-primary"
                  disabled={uploading || !selectedFile}
                  onClick={() => void handleUpload()}
                >
                  {uploading ? 'Uploading…' : 'Upload'}
                </button>
                <button type="button" className="btn-secondary" disabled={uploading} onClick={() => setUploadOpen(false)}>
                  Cancel
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );

  if (embedded) {
    return (
      <div>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, marginBottom: 12 }}>
          <div>
            <div style={{ fontSize: 11, fontWeight: 700, letterSpacing: '0.08em', textTransform: 'uppercase', color: 'var(--gray)' }}>
              Documents
            </div>
            <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>{subtitle ?? defaultSubtitle}</div>
          </div>
          <button
            type="button"
            className="btn-primary"
            style={{ fontSize: 12 }}
            onClick={() => {
              resetUploadForm();
              setUploadOpen(true);
            }}
          >
            + Upload
          </button>
        </div>
        {content}
      </div>
    );
  }

  return (
    <div className="card" style={{ marginBottom: 16 }}>
      <div className="card-header" style={{ gap: 12 }}>
        <div style={{ flex: 1 }}>
          <div className="card-title" style={{ fontSize: 14 }}>Documents</div>
          <div style={{ fontSize: 11, color: 'var(--gray)', marginTop: 2 }}>{subtitle ?? defaultSubtitle}</div>
        </div>
        <button
          type="button"
          className="btn-primary"
          style={{ fontSize: 12 }}
          onClick={() => {
            resetUploadForm();
            setUploadOpen(true);
          }}
        >
          + Upload document
        </button>
      </div>
      <div className="card-body" style={{ padding: 0 }}>{content}</div>
    </div>
  );
}
