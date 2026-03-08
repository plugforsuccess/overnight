'use client';

import { useState } from 'react';
import { FileText, Edit3, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

const MAX_LENGTH = 500;

interface Props {
  notes: string;
  onChange: (notes: string) => void;
  editable?: boolean;
  label?: string;
}

export function CaregiverNotesCard({ notes, onChange, editable = true, label = 'Caregiver notes' }: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(notes);

  function handleSave() {
    onChange(draft.trim());
    setEditing(false);
  }

  function handleCancel() {
    setDraft(notes);
    setEditing(false);
  }

  if (editing) {
    return (
      <div className="rounded-2xl border border-navy-200 bg-navy-50/50 p-4">
        <div className="flex items-center justify-between mb-2">
          <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
            <FileText className="h-4 w-4 text-navy-600" />
            {label}
          </div>
          <div className="flex items-center gap-1">
            <button
              onClick={handleSave}
              className="p-1.5 rounded-lg bg-green-50 text-green-600 hover:bg-green-100 transition-colors"
              title="Save"
            >
              <Check className="h-4 w-4" />
            </button>
            <button
              onClick={handleCancel}
              className="p-1.5 rounded-lg bg-gray-100 text-gray-500 hover:bg-gray-200 transition-colors"
              title="Cancel"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>
        <textarea
          value={draft}
          onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setDraft(e.target.value.slice(0, MAX_LENGTH))}
          placeholder="Bedtime routine, food preferences, comfort items, medication schedule, pickup instructions..."
          rows={4}
          className="w-full rounded-xl border border-gray-200 bg-white p-3 text-sm text-gray-900 placeholder:text-gray-400 focus:border-navy-400 focus:ring-2 focus:ring-navy-100 focus:outline-none resize-none"
          autoFocus
        />
        <div className="flex justify-end mt-1">
          <span className={cn(
            'text-xs',
            draft.length > MAX_LENGTH * 0.9 ? 'text-amber-600' : 'text-gray-400',
          )}>
            {draft.length}/{MAX_LENGTH}
          </span>
        </div>
      </div>
    );
  }

  if (!notes) {
    return (
      <div className="rounded-2xl border border-dashed border-gray-200 bg-gray-50/50 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-gray-400" />
            <span className="text-sm text-gray-500">No caregiver notes added yet</span>
          </div>
          {editable && (
            <button
              onClick={() => { setDraft(''); setEditing(true); }}
              className="text-xs font-medium text-accent-600 hover:text-accent-700"
            >
              Add notes
            </button>
          )}
        </div>
        <p className="text-xs text-gray-400 mt-1 ml-6">
          Add bedtime or pickup instructions for staff
        </p>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-gray-200 bg-white p-4 shadow-soft-sm">
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2 text-sm font-semibold text-gray-900">
          <FileText className="h-4 w-4 text-navy-600" />
          {label}
        </div>
        {editable && (
          <button
            onClick={() => { setDraft(notes); setEditing(true); }}
            className="p-1 rounded-lg text-gray-400 hover:text-gray-600 hover:bg-gray-100 transition-colors"
            title="Edit notes"
          >
            <Edit3 className="h-3.5 w-3.5" />
          </button>
        )}
      </div>
      <p className="text-sm text-gray-700 whitespace-pre-line leading-relaxed">
        {notes}
      </p>
    </div>
  );
}
