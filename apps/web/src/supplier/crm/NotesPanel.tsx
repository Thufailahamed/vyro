import { useState } from 'react';
import { useAddLeadNote, useLeadNotes } from '../useLeadManager';
import { useToast } from '@vyro/ui';
import type { LeadNoteRow } from '@vyro/validation';

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

  // Aggregate paginated pages into a single list.
  type NotesPage = { notes: LeadNoteRow[]; nextCursor: string | null };
  const pages = ((notes.data as unknown as { pages?: NotesPage[] } | undefined)?.pages ?? []) as NotesPage[];
  const flatNotes = pages.flatMap((p) => p.notes);
  const hasMore = !!notes.hasNextPage;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs font-mono font-bold uppercase tracking-wider text-ink-3">
          Internal Team Notes
        </span>
        {flatNotes.length > 0 && (
          <span className="text-[11px] font-mono text-ink-4">
            {flatNotes.length} {flatNotes.length === 1 ? 'entry' : 'entries'}
          </span>
        )}
      </div>

      <div className="space-y-2.5 max-h-64 overflow-y-auto pr-1">
        {notes.isLoading ? (
          <div className="py-4 text-center text-xs text-ink-4">Loading notes…</div>
        ) : flatNotes.length === 0 ? (
          <div className="rounded-lg border border-dashed border-ink/15 p-4 text-center text-xs text-ink-4 bg-bone/30">
            No notes yet. Add internal remarks or follow-up details below.
          </div>
        ) : (
          flatNotes.map((n: LeadNoteRow) => (
            <div key={n.id} className="rounded-lg border border-ink/10 bg-bone/40 p-3 text-xs shadow-xs space-y-1">
              <div className="flex items-center justify-between text-[11px] text-ink-4 font-mono">
                <span className="font-semibold text-ink-2">Team Note</span>
                <span>{new Date(n.createdAt).toLocaleDateString([], { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
              </div>
              <div className="whitespace-pre-wrap text-ink-1 text-xs leading-relaxed font-sans">{n.body}</div>
            </div>
          ))
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => notes.fetchNextPage()}
            disabled={notes.isFetchingNextPage}
            className="w-full py-1 text-center text-xs text-ink-3 underline hover:text-ink-1 disabled:opacity-50 cursor-pointer"
          >
            {notes.isFetchingNextPage ? 'Loading…' : 'Load older notes'}
          </button>
        )}
      </div>

      <div className="space-y-2 pt-1 border-t border-ink/10">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          rows={3}
          placeholder="Log conversation details, buyer requirements, next steps…"
          className="w-full rounded-lg border border-ink/15 bg-paper px-3 py-2 text-xs leading-relaxed text-ink placeholder:text-ink-4 focus:border-ink focus:outline-none focus:ring-1 focus:ring-volt/50 transition-all resize-none"
        />
        <div className="flex items-center justify-between">
          <span className="text-[11px] font-mono text-ink-4">{draft.length}/1000</span>
          <button
            type="button"
            disabled={!draft.trim() || addNote.isPending}
            onClick={submit}
            className="inline-flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-1.5 text-xs font-semibold text-paper shadow-xs hover:bg-charcoal disabled:opacity-40 disabled:cursor-not-allowed transition-colors cursor-pointer"
          >
            {addNote.isPending ? 'Saving…' : 'Add Note'}
          </button>
        </div>
      </div>
    </div>
  );
}
