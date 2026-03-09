'use client';

import { useRef, useState } from 'react';
import { DOCUMENT_TYPES, DOCUMENT_TYPE_LABELS, type ChildDocumentRow, type DocumentType } from '@/types/children';

type Props = {
  childId: string;
  documents: ChildDocumentRow[];
  onUploaded: (doc: ChildDocumentRow) => void;
  onDeleted: (id: string) => void;
};

export function ChildDocumentsPanel({ childId, documents, onUploaded, onDeleted }: Props) {
  const fileRef = useRef<HTMLInputElement | null>(null);
  const [uploading, setUploading] = useState(false);
  const [progressText, setProgressText] = useState('');
  const [documentType, setDocumentType] = useState<DocumentType>('immunization_certificate');
  const [expiresAt, setExpiresAt] = useState('');

  async function upload(file: File) {
    setUploading(true);
    setProgressText('Uploading...');
    const form = new FormData();
    form.append('file', file);
    form.append('metadata', JSON.stringify({ document_type: documentType, expires_at: expiresAt || null }));
    const res = await fetch(`/api/children/${childId}/documents`, { method: 'POST', body: form });
    const data = await res.json();
    setUploading(false);
    setProgressText('');
    if (!res.ok) throw new Error(data.error || 'Upload failed');
    onUploaded(data.document);
  }

  async function deleteDoc(id: string) {
    const res = await fetch(`/api/child-documents/${id}`, { method: 'DELETE' });
    if (res.ok) onDeleted(id);
  }

  return (
    <div className="space-y-4">
      <div className="rounded-lg border p-4 bg-gray-50">
        <p className="text-sm text-gray-700 mb-3">Required before booking: immunization certificate, medication authorization (if needed), and physician note (if provided).</p>
        <div className="grid md:grid-cols-3 gap-3 items-end">
          <div>
            <label className="text-sm font-medium">Type</label>
            <select className="input-field" value={documentType} onChange={(e) => setDocumentType(e.target.value as DocumentType)}>
              {DOCUMENT_TYPES.map((t) => <option value={t} key={t}>{DOCUMENT_TYPE_LABELS[t]}</option>)}
            </select>
          </div>
          <div>
            <label className="text-sm font-medium">Expires at</label>
            <input type="date" className="input-field" value={expiresAt} onChange={(e) => setExpiresAt(e.target.value)} />
          </div>
          <button className="btn-primary" disabled={uploading} onClick={() => fileRef.current?.click()}>
            {uploading ? 'Uploading...' : 'Upload Document'}
          </button>
          <input ref={fileRef} className="hidden" type="file" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        </div>
        {progressText && <p className="text-xs text-gray-500 mt-2">{progressText}</p>}
      </div>

      <div className="space-y-2">
        {documents.map((doc) => (
          <div key={doc.id} className="border rounded-lg p-3 flex items-center justify-between">
            <div>
              <p className="text-sm font-medium">{DOCUMENT_TYPE_LABELS[doc.document_type]}</p>
              <p className="text-xs text-gray-600">{doc.file_name} • {new Date(doc.created_at).toLocaleDateString()} • {doc.verified ? 'Verified' : 'Awaiting admin review'}</p>
            </div>
            <button className="text-red-600 text-sm" onClick={() => deleteDoc(doc.id)}>Delete</button>
          </div>
        ))}
        {documents.length === 0 && <p className="text-sm text-gray-500">No documents uploaded yet.</p>}
      </div>
    </div>
  );
}
