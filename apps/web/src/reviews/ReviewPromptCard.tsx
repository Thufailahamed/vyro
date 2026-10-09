import { useEffect, useState } from 'react';
import { CheckCircleIcon, UploadCloudIcon, XIcon } from '@/components/icons';
import { useReviewEligibility } from './useReviewEligibility';

const RATING_LABEL = ['', 'Poor', 'Fair', 'Good', 'Great', 'Excellent'];

const QUICK_TAGS = ['On-time delivery', 'Well packed', 'Matches description', 'Good communication', 'Fair pricing'];

function Star({ filled, size = 26 }: { filled: boolean; size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden>
      <path
        d="M12 2.8l2.84 5.75 6.35.92-4.6 4.48 1.09 6.32L12 17.3l-5.68 2.97 1.09-6.32-4.6-4.48 6.35-.92L12 2.8z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth={1.5}
        strokeLinejoin="round"
      />
    </svg>
  );
}

function StarPicker({ value, onChange }: { value: number; onChange: (n: number) => void }) {
  const [hover, setHover] = useState(0);
  const shown = hover || value;
  return (
    <div className="flex items-center gap-3">
      <div role="radiogroup" aria-label="Rating" className="flex items-center gap-0.5" onMouseLeave={() => setHover(0)}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button
            key={n}
            type="button"
            role="radio"
            aria-checked={value === n}
            aria-label={`${n} star${n === 1 ? '' : 's'}`}
            onMouseEnter={() => setHover(n)}
            onFocus={() => setHover(n)}
            onBlur={() => setHover(0)}
            onClick={() => onChange(n)}
            className={`rounded-md p-0.5 transition-transform duration-150 hover:scale-110 focus:outline-none focus-visible:ring-2 focus-visible:ring-volt ${
              n <= shown ? 'text-volt drop-shadow-[0_0_8px_rgba(198,220,74,0.45)]' : 'text-paper/25'
            }`}
          >
            <Star filled={n <= shown} />
          </button>
        ))}
      </div>
      <span className="min-w-[72px] font-mono text-[11px] font-bold uppercase tracking-[0.14em] text-volt">
        {RATING_LABEL[shown] ?? ''}
      </span>
    </div>
  );
}

async function readErrorCode(res: Response): Promise<string> {
  const j = (await res.json().catch(() => ({}))) as { error?: { code?: string; message?: string } };
  return j?.error?.message ?? j?.error?.code ?? `Request failed (${res.status})`;
}

/**
 * Post-delivery prompt asking the buyer to review the supplier.
 * Renders nothing unless the order is eligible (delivered / completed, not yet reviewed).
 */
export function ReviewPromptCard({ orderId }: { orderId: string }) {
  const eligibility = useReviewEligibility(orderId);
  const [rating, setRating] = useState(0);
  const [tags, setTags] = useState<string[]>([]);
  const [body, setBody] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [previews, setPreviews] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [done, setDone] = useState(false);

  useEffect(() => {
    const urls = files.map((f) => URL.createObjectURL(f));
    setPreviews(urls);
    return () => urls.forEach((u) => URL.revokeObjectURL(u));
  }, [files]);

  if (done) {
    return (
      <section className="overflow-hidden rounded-2xl border border-mint/25 bg-mint/[0.07] p-5">
        <div className="flex items-start gap-3">
          <span className="flex size-9 shrink-0 items-center justify-center rounded-xl bg-mint/15 text-mint">
            <CheckCircleIcon size={17} />
          </span>
          <div>
            <h3 className="font-display text-base font-semibold text-ink">Thanks for your review</h3>
            <p className="mt-1 text-xs leading-relaxed text-ink-3">
              It's now live on the supplier's profile and helps other buyers choose with confidence.
            </p>
            <div className="mt-2 flex text-volt-deep">
              {[1, 2, 3, 4, 5].map((n) => (
                <Star key={n} filled={n <= rating} size={16} />
              ))}
            </div>
          </div>
        </div>
      </section>
    );
  }

  if (eligibility.isLoading || !eligibility.canReview) return null;

  const expanded = rating > 0;
  const composed = [tags.length ? tags.join(' · ') : '', body.trim()].filter(Boolean).join('\n\n');

  function toggleTag(t: string) {
    setTags((cur) => (cur.includes(t) ? cur.filter((x) => x !== t) : [...cur, t]));
  }

  function addFiles(list: FileList | null) {
    if (!list) return;
    const picked = Array.from(list).filter((f) => f.type.startsWith('image/'));
    const tooBig = picked.find((f) => f.size > 5 * 1024 * 1024);
    if (tooBig) {
      setError(`${tooBig.name} is over 5 MB.`);
      return;
    }
    setError('');
    setFiles((cur) => [...cur, ...picked].slice(0, 3));
  }

  async function submit() {
    setError('');
    if (!composed) {
      setError('Pick a highlight or write a few words.');
      return;
    }
    setSubmitting(true);
    try {
      const imageR2Keys: string[] = [];
      for (const f of files) {
        const form = new FormData();
        form.append('file', f);
        const up = await fetch('/api/reviews/images/upload-direct', { method: 'POST', credentials: 'include', body: form });
        if (!up.ok) {
          setError(`Photo upload failed: ${await readErrorCode(up)}`);
          return;
        }
        const j = (await up.json()) as { r2Key?: string };
        if (j.r2Key) imageR2Keys.push(j.r2Key);
      }
      const res = await fetch('/api/reviews', {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ orderId, rating, body: composed.slice(0, 2000), ...(imageR2Keys.length ? { imageR2Keys } : {}) }),
      });
      if (!res.ok) {
        setError(await readErrorCode(res));
        return;
      }
      setDone(true);
    } catch {
      setError('Could not submit your review. Check your connection and try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="grain relative overflow-hidden rounded-2xl bg-ink p-5 text-paper shadow-[0_24px_48px_-28px_rgba(12,14,11,0.8)]">
      <div aria-hidden className="pointer-events-none absolute -right-16 -top-16 size-48 rounded-full bg-volt/[0.16] blur-3xl" />
      <div aria-hidden className="pointer-events-none absolute -bottom-20 -left-12 size-40 rounded-full bg-copper/[0.22] blur-3xl" />

      <div className="relative space-y-4">
        <div>
          <div className="font-mono text-[10px] font-bold uppercase tracking-[0.18em] text-volt">Rate your supplier</div>
          <h3 className="mt-1.5 font-display text-lg font-semibold leading-snug">How did this order go?</h3>
          <p className="mt-1 text-[13px] leading-relaxed text-paper/60">
            Your review helps other buyers choose and helps the supplier improve.
          </p>
        </div>

        <StarPicker value={rating} onChange={setRating} />

        {expanded && (
          <div className="animate-fade-in space-y-4 border-t border-dashed border-paper/15 pt-4">
            <div>
              <div className="mb-2 font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">What stood out?</div>
              <div className="flex flex-wrap gap-1.5">
                {QUICK_TAGS.map((t) => {
                  const on = tags.includes(t);
                  return (
                    <button
                      key={t}
                      type="button"
                      aria-pressed={on}
                      onClick={() => toggleTag(t)}
                      className={`rounded-full border px-3 py-1 text-xs font-medium transition-colors duration-150 ${
                        on
                          ? 'border-volt bg-volt text-ink'
                          : 'border-paper/15 bg-paper/[0.06] text-paper/75 hover:border-paper/30 hover:text-paper'
                      }`}
                    >
                      {t}
                    </button>
                  );
                })}
              </div>
            </div>

            <div>
              <label htmlFor={`review-body-${orderId}`} className="mb-2 block font-mono text-[10px] uppercase tracking-[0.14em] text-paper/45">
                Tell others more <span className="normal-case tracking-normal text-paper/35">(optional)</span>
              </label>
              <textarea
                id={`review-body-${orderId}`}
                value={body}
                maxLength={1800}
                rows={3}
                onChange={(e) => setBody(e.target.value)}
                placeholder="Quality, delivery, packaging, communication…"
                className="w-full resize-none rounded-xl border border-paper/15 bg-paper/[0.06] px-3.5 py-2.5 text-sm text-paper placeholder:text-paper/35 transition-colors focus:border-volt/60 focus:outline-none focus:ring-2 focus:ring-volt/25"
              />
              <div className="mt-1 text-right font-mono text-[10px] text-paper/35">{body.length}/1800</div>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              {previews.map((src, i) => (
                <div key={src} className="group relative size-14 overflow-hidden rounded-lg border border-paper/15">
                  <img src={src} alt={`Photo ${i + 1}`} className="size-full object-cover" />
                  <button
                    type="button"
                    aria-label={`Remove photo ${i + 1}`}
                    onClick={() => setFiles((cur) => cur.filter((_, j) => j !== i))}
                    className="absolute right-0.5 top-0.5 rounded-full bg-ink/80 p-0.5 text-paper opacity-0 transition-opacity group-hover:opacity-100"
                  >
                    <XIcon size={11} />
                  </button>
                </div>
              ))}
              {files.length < 3 && (
                <label className="flex size-14 cursor-pointer flex-col items-center justify-center gap-0.5 rounded-lg border border-dashed border-paper/25 text-paper/50 transition-colors hover:border-volt/60 hover:text-volt">
                  <UploadCloudIcon size={15} />
                  <span className="text-[9px] font-semibold">Photo</span>
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="sr-only"
                    onChange={(e) => {
                      addFiles(e.target.files);
                      e.target.value = '';
                    }}
                  />
                </label>
              )}
              <span className="text-[11px] text-paper/40">Up to 3 photos · 5 MB each</span>
            </div>

            {error && <p className="rounded-lg bg-rose/20 px-3 py-2 text-xs font-semibold text-paper">{error}</p>}

            <button
              type="button"
              onClick={() => void submit()}
              disabled={submitting || !composed}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-volt px-4 py-3 text-sm font-bold text-ink shadow-[0_10px_28px_-10px_rgba(198,220,74,0.55)] transition-all duration-200 hover:-translate-y-px hover:bg-volt-glow disabled:pointer-events-none disabled:opacity-50"
            >
              {submitting ? 'Posting review…' : 'Post review'}
            </button>
          </div>
        )}
      </div>
    </section>
  );
}
