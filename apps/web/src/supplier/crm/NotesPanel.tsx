import { useState } from 'react';
import { useAddLeadNote, useLeadNotes } from '../useLeadManager';
import { useToast } from '@vyro/ui';
import type { LeadNoteRow } from '@vyro/validation';
import { relTime } from './crmUi';

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

  type NotesPage = { notes: LeadNoteRow[]; nextCursor: string | null };
  const pages = ((notes.data as unknown as { pages?: NotesPage[] } | undefined)?.pages ?? []) as NotesPage[];
  const flatNotes = pages.flatMap((p) => p.notes);
  const hasMore = !!notes.hasNextPage;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="text-[11px] font-bold uppercase tracking-[0.16em] text-ink-3">Team notes</h3>
        {flatNotes.length > 0 && (
          <span className="rounded-full bg-ink/[0.06] px-2 py-0.5 font-mono text-[10px] font-semibold text-ink-3">
            {flatNotes.length}
          </span>
        )}
      </div>

      <div className="max-h-72 space-y-3 overflow-y-auto pr-1 scrollbar-thin">
        {notes.isLoading ? (
          <div className="space-y-2 animate-pulse">
            <div className="h-14 rounded-xl bg-ink/[0.04]" />
            <div className="h-14 rounded-xl bg-ink/[0.04]" />
          </div>
        ) : flatNotes.length === 0 ? (
          <div className="rounded-xl bg-bone/50 p-5 text-center text-xs leading-relaxed text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.08)]">
            No notes yet. Log conversations and next steps below.
          </div>
        ) : (
          flatNotes.map((n: LeadNoteRow) => (
            <div key={n.id} className="flex gap-2.5">
              <span className="mt-0.5 flex size-7 shrink-0 items-center justify-center rounded-full bg-charcoal text-[10px] font-bold text-volt">
                T
              </span>
              <div className="min-w-0 flex-1 rounded-xl rounded-tl-sm bg-bone/60 px-3.5 py-2.5 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.06)]">
                <div className="mb-1 flex items-center justify-between gap-2 text-[11px]">
                  <span className="font-semibold text-ink-2">Team note</span>
                  <span className="text-ink-4" title={new Date(n.createdAt).toLocaleString()}>
                    {relTime(n.createdAt)}
                  </span>
                </div>
                <p className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink">{n.body}</p>
              </div>
            </div>
          ))
        )}
        {hasMore && (
          <button
            type="button"
            onClick={() => notes.fetchNextPage()}
            disabled={notes.isFetchingNextPage}
            className="w-full py-1 text-center text-xs font-medium text-ink-3 hover:text-ink disabled:opacity-50"
          >
            {notes.isFetchingNextPage ? 'Loading…' : 'Load older notes'}
          </button>
        )}
      </div>

      <div className="rounded-xl bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.14)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]">
        <textarea
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') submit();
          }}
          maxLength={1000}
          rows={3}
          aria-label="Add a note"
          placeholder="Log conversation details, buyer requirements, next steps…"
          className="w-full resize-none rounded-t-xl bg-transparent px-3.5 pt-3 text-[13px] leading-relaxed text-ink outline-none placeholder:text-ink-4"
        />
        <div className="flex items-center justify-between px-3 pb-2.5">
          <span className="font-mono text-[11px] text-ink-4">{draft.length}/1000 · ⌘↵ to send</span>
          <button
            type="button"
            disabled={!draft.trim() || addNote.isPending}
            onClick={submit}
            className="inline-flex h-8 items-center rounded-lg bg-ink px-3.5 text-xs font-semibold text-paper transition-colors hover:bg-charcoal disabled:cursor-not-allowed disabled:opacity-40"
          >
            {addNote.isPending ? 'Saving…' : 'Add note'}
          </button>
        </div>
      </div>
    </div>
  );
}
