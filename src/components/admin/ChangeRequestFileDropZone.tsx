'use client';

import { useCallback, useState } from 'react';

export function FileDropZone({
  accept,
  multiple = true,
  disabled,
  label = 'Drop files here or click to browse',
  onFiles,
}: {
  accept?: string;
  multiple?: boolean;
  disabled?: boolean;
  label?: string;
  onFiles: (files: File[]) => void;
}) {
  const [dragOver, setDragOver] = useState(false);

  const pick = useCallback(
    (list: FileList | null) => {
      if (!list?.length || disabled) return;
      onFiles([...list]);
    },
    [disabled, onFiles],
  );

  return (
    <label
      className={`roadmap-dropzone${dragOver ? ' is-dragover' : ''}${disabled ? ' is-disabled' : ''}`}
      onDragEnter={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setDragOver(true);
      }}
      onDragOver={(e) => {
        e.preventDefault();
        e.stopPropagation();
        if (!disabled) setDragOver(true);
      }}
      onDragLeave={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
      }}
      onDrop={(e) => {
        e.preventDefault();
        e.stopPropagation();
        setDragOver(false);
        if (disabled) return;
        pick(e.dataTransfer.files);
      }}
    >
      <input
        type="file"
        accept={accept}
        multiple={multiple}
        disabled={disabled}
        className="roadmap-dropzone-input"
        onChange={(e) => {
          pick(e.target.files);
          e.target.value = '';
        }}
      />
      <span className="roadmap-dropzone-label">{label}</span>
    </label>
  );
}
