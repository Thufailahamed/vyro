import { useState } from 'react';
import { useAddLeadNote, useLeadNotes } from '../useLeadManager';
import { useToast } from '@vyro/ui';

interface Props {
  supplierId: string;
  leadId: string;
}

export function NotesPanel({ supplierId, leadId }: Props) {
  const toast = useToast();
  const notes = useLeadNotes(supplierId, leadId);
  const addNote = useAddLeadNote(supplierId);
  const [draft, setDraft] = useState('');

  function submit() {
    const body = draft.trim();
    if (!body) return;
    addNote.mutate(
      { leadId, body },
      {
        onSuccess: () => {
          setDraft('');
          toast.success('Note added');
        },
        onError: () => toast.error('Could not save note'),
      },
    );
  }

  return (
    <div className="space-y-3">
      <div className="text-xs font-semibold uppercase tracking-wide text-ink-4">Notes</div>

      <div className="space-y-2">
        {notes.isLoading ? (
          <div className="text-xs text-ink-4">Loading notes…</div>
        ) : (notes.data?.notes ?? []).length === 0 ? (
          <div className="text-xs text-ink-4">No notes yet.</div>
        ) : (
          (notes.data?.notes ?? []).map((n) => (
            <div key={n.id} className="rounded-md border border-ink-3 bg-paper p-2 text-sm">
              <div className="text-xs text-ink-4">{new Date(n.createdAt).toLocaleString()}</div>
              <div className="whitespace-pre-wrap text-ink-1">{n.body}</div>
            </div>
          ))
        )}
      </div>

      <div className="space-y-2">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Add a note for the team…"
          className="w-full rounded-md border border-ink-3 bg-paper px-3 py-2 text-sm focus:border-ink-1 focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-xs text-ink-4">{draft.length}/1000</span>
          <button
            type="button"
            disabled={!draft.trim() || addNote.isPending}
            onClick={submit}
            className="rounded-md bg-ink px-3 py-1.5 text-xs font-semibold text-paper disabled:opacity-50"
          >
            {addNote.isPending ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>
    </div>
  );
}
