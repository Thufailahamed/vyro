import { useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { cn } from '@vyro/ui';
import { ApiError } from '@/lib/api';
import type { AdminQuiz } from '@/lib/learningApi';
import { renderLessonMarkdown } from '@/supplier/learning/markdownSafe';
import {
  AdminPage,
  AdminPageHeader,
  Button,
  Callout,
  Panel,
  Pill,
  Segmented,
  Skeleton,
  buttonClass,
  controlClass,
} from '../ui';
import {
  CheckCircleIcon,
  CheckIcon,
  FileTextIcon,
  GraduationCapIcon,
  PlusIcon,
  SaveIcon,
  SettingsIcon,
  ShieldCheckIcon,
  Trash2Icon,
  XIcon,
} from '@/components/icons';
import {
  useAdminLesson,
  useAdminCreateLesson,
  useAdminUpdateLesson,
  useAdminDeleteLesson,
  useAdminReplaceQuiz,
} from './hooks/useAdminLearning';
import { readMinutes } from './LessonsAdmin';

interface Form {
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  track: 'onboarding' | 'operations';
  orderIndex: number;
  isPublished: boolean;
  isRequiredForPublish: boolean;
}

const EMPTY: Form = {
  slug: '',
  title: '',
  summary: '',
  bodyMarkdown: '',
  track: 'onboarding',
  orderIndex: 0,
  isPublished: false,
  isRequiredForPublish: false,
};

const SUMMARY_MAX = 500;

function slugify(s: string) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 120);
}

function formFrom(raw: Record<string, unknown>): Form {
  return {
    slug: String(raw.slug ?? ''),
    title: String(raw.title ?? ''),
    summary: String(raw.summary ?? ''),
    bodyMarkdown: String(raw.bodyMarkdown ?? ''),
    track: raw.track === 'operations' ? 'operations' : 'onboarding',
    orderIndex: Number(raw.orderIndex ?? 0),
    isPublished: Boolean(raw.isPublished),
    isRequiredForPublish: Boolean(raw.isRequiredForPublish),
  };
}

function validate(f: Form) {
  const e: Partial<Record<keyof Form, string>> = {};
  if (f.title.trim().length < 2) e.title = 'Add a title (at least 2 characters).';
  if (!/^[a-z0-9-]{2,120}$/.test(f.slug)) e.slug = 'Use 2–120 lowercase letters, numbers and dashes.';
  if (f.summary.trim().length < 2) e.summary = 'Add a one-line summary.';
  if (f.bodyMarkdown.trim().length < 10) e.bodyMarkdown = 'The lesson body needs at least 10 characters.';
  return e;
}

function errorMessage(err: unknown) {
  if (err instanceof ApiError) {
    if (err.message === 'LESSON_SLUG_TAKEN') return 'That slug is already used by another lesson.';
    if (err.message === 'QUIZ_INVALID') return 'Every question needs exactly one correct answer.';
    return err.message;
  }
  return err instanceof Error ? err.message : 'Something went wrong.';
}

export function LessonEditor() {
  const { id } = useParams<{ id?: string }>();
  const isNew = !id || id === 'new';
  const lessonId = isNew ? undefined : id;
  const navigate = useNavigate();

  const detail = useAdminLesson(lessonId);
  const create = useAdminCreateLesson();
  const update = useAdminUpdateLesson(lessonId ?? '');
  const del = useAdminDeleteLesson();

  const [form, setForm] = useState<Form>(EMPTY);
  const [baseline, setBaseline] = useState<Form>(EMPTY);
  const [slugTouched, setSlugTouched] = useState(!isNew);
  const [showErrors, setShowErrors] = useState(false);
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [mode, setMode] = useState<'write' | 'preview'>('write');
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Hydrate once per lesson, so background refetches never clobber typing.
  const hydratedId = useRef<string | null>(null);
  useEffect(() => {
    const lesson = detail.data?.lesson;
    if (lesson && hydratedId.current !== lessonId) {
      hydratedId.current = lessonId ?? null;
      const f = formFrom(lesson);
      setForm(f);
      setBaseline(f);
      setSlugTouched(true);
    }
  }, [detail.data?.lesson, lessonId]);

  const set = <K extends keyof Form>(key: K, value: Form[K]) =>
    setForm((f) => {
      const next = { ...f, [key]: value };
      if (key === 'title' && isNew && !slugTouched) next.slug = slugify(String(value));
      return next;
    });

  const errors = validate(form);
  const valid = Object.keys(errors).length === 0;
  const dirty = JSON.stringify(form) !== JSON.stringify(baseline);
  const saving = create.isPending || update.isPending;
  const saveError = create.error ?? update.error;

  const onSave = async () => {
    setShowErrors(true);
    if (!valid || saving) return;
    const payload = { ...form, title: form.title.trim(), summary: form.summary.trim() };
    if (isNew) {
      const res = await create.mutateAsync(payload as unknown as Record<string, unknown>).catch(() => null);
      if (res) navigate(`/admin/learning/${String(res.lesson.id)}/edit`, { replace: true });
    } else {
      const res = await update.mutateAsync(payload as unknown as Record<string, unknown>).catch(() => null);
      if (res) {
        setBaseline(form);
        setSavedAt(Date.now());
      }
    }
  };

  // ⌘S / Ctrl+S saves.
  const saveRef = useRef(onSave);
  saveRef.current = onSave;
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
        e.preventDefault();
        void saveRef.current();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const fieldError = (k: keyof Form) => (showErrors ? errors[k] : undefined);
  const words = form.bodyMarkdown.trim().split(/\s+/).filter(Boolean).length;
  const preview = useMemo(() => (mode === 'preview' ? renderLessonMarkdown(form.bodyMarkdown) : ''), [mode, form.bodyMarkdown]);
  const quiz = detail.data?.quiz ?? null;

  if (!isNew && detail.isLoading) {
    return (
      <AdminPage>
        <div className="space-y-3 border-b border-ink/[0.07] pb-6">
          <Skeleton className="h-6 w-32 rounded-full" />
          <Skeleton className="h-9 w-80" />
          <Skeleton className="h-4 w-96" />
        </div>
        <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
          <Skeleton className="h-[520px] rounded-[18px]" />
          <Skeleton className="h-80 rounded-[18px]" />
        </div>
      </AdminPage>
    );
  }

  if (!isNew && (detail.isError || !detail.data)) {
    return (
      <AdminPage>
        <AdminPageHeader back={{ to: '/admin/learning', label: 'Training center' }} title="Lesson not found" />
        <Callout tone="danger" title="This lesson could not be loaded.">
          {errorMessage(detail.error)}
        </Callout>
      </AdminPage>
    );
  }

  const checklist = [
    { label: 'Title and summary', done: !errors.title && !errors.summary },
    { label: 'Lesson body written', done: words >= 80, hint: `${words} words` },
    { label: 'Knowledge check', done: Boolean(quiz?.questions.length), hint: quiz ? `${quiz.questions.length} questions` : 'None' },
    { label: 'Published', done: form.isPublished },
  ];

  return (
    <AdminPage>
      <AdminPageHeader
        back={{ to: '/admin/learning', label: 'Training center' }}
        kicker={isNew ? 'New lesson' : `${form.track === 'onboarding' ? 'Onboarding' : 'Operations'} · Lesson ${form.orderIndex + 1}`}
        title={form.title.trim() || (isNew ? 'Untitled lesson' : 'Edit lesson')}
        description={form.summary.trim() || 'Write the article suppliers read, then add a short knowledge check.'}
        meta={
          <>
            {form.isPublished ? <Pill tone="success" dot>Published</Pill> : <Pill tone="warning" dot>Draft</Pill>}
            {form.isRequiredForPublish && <Pill tone="brand" icon={<ShieldCheckIcon size={11} />}>Publishing gate</Pill>}
            <Pill>{readMinutes(form.bodyMarkdown)} min read</Pill>
          </>
        }
        actions={
          <>
            <SaveState dirty={dirty} saving={saving} savedAt={savedAt} isNew={isNew} />
            <Button variant="primary" onClick={() => void onSave()} disabled={saving || (!isNew && !dirty)}>
              <SaveIcon size={15} />
              {saving ? 'Saving…' : isNew ? 'Create lesson' : 'Save changes'}
            </Button>
          </>
        }
      />

      {saveError && (
        <Callout tone="danger" title="Couldn’t save the lesson">
          {errorMessage(saveError)}
        </Callout>
      )}

      <div className="grid items-start gap-6 lg:grid-cols-[minmax(0,1fr)_320px]">
        <div className="min-w-0 space-y-6">
          <Panel title="Content" description="What suppliers see in the training center." icon={<FileTextIcon size={16} />}>
            <div className="space-y-5">
              <Field label="Title" error={fieldError('title')}>
                <input
                  className={cn(controlClass, 'h-11 w-full text-[15px] font-medium')}
                  value={form.title}
                  onChange={(e) => set('title', e.target.value)}
                  placeholder="e.g. Quote RFQs like a pro"
                  autoFocus={isNew}
                />
              </Field>

              <Field
                label="URL slug"
                hint={isNew ? 'Generated from the title. Can’t be changed after creation.' : 'Locked after creation so existing links keep working.'}
                error={fieldError('slug')}
              >
                <div className={cn(controlClass, 'flex w-full items-center gap-0 p-0', !isNew && 'opacity-70')}>
                  <span className="select-none pl-3 font-mono text-xs text-ink-5">/learning/</span>
                  <input
                    className="h-full min-w-0 flex-1 bg-transparent pr-3 font-mono text-xs text-ink outline-none disabled:cursor-not-allowed"
                    value={form.slug}
                    disabled={!isNew}
                    onChange={(e) => {
                      setSlugTouched(true);
                      set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'));
                    }}
                  />
                </div>
              </Field>

              <Field
                label="Summary"
                counter={`${form.summary.length}/${SUMMARY_MAX}`}
                hint="One or two sentences shown on the lesson card."
                error={fieldError('summary')}
              >
                <textarea
                  rows={2}
                  maxLength={SUMMARY_MAX}
                  className={cn(controlClass, 'h-auto w-full resize-none py-2.5 leading-relaxed')}
                  value={form.summary}
                  onChange={(e) => set('summary', e.target.value)}
                  placeholder="What will suppliers learn?"
                />
              </Field>

              <div>
                <div className="mb-2 flex items-end justify-between gap-3">
                  <FieldLabel>Lesson body</FieldLabel>
                  <Segmented
                    ariaLabel="Editor mode"
                    value={mode}
                    onChange={setMode}
                    items={[
                      { key: 'write', label: 'Write' },
                      { key: 'preview', label: 'Preview' },
                    ]}
                  />
                </div>
                <div
                  className={cn(
                    'overflow-hidden rounded-xl bg-paper shadow-[inset_0_0_0_1px_rgba(12,14,11,0.12),0_1px_2px_rgba(12,14,11,0.04)] transition-shadow focus-within:shadow-[inset_0_0_0_1px_#0C0E0B,0_0_0_4px_rgba(198,220,74,0.3)]',
                    fieldError('bodyMarkdown') && 'shadow-[inset_0_0_0_1px_rgba(196,90,74,0.6)]',
                  )}
                >
                  {mode === 'write' ? (
                    <textarea
                      className="block min-h-[420px] w-full resize-y bg-transparent px-4 py-3.5 font-mono text-[13px] leading-[1.7] text-ink outline-none placeholder:text-ink-5"
                      value={form.bodyMarkdown}
                      onChange={(e) => set('bodyMarkdown', e.target.value)}
                      placeholder={'## Why this matters\n\nWrite the lesson in Markdown…'}
                      spellCheck
                    />
                  ) : form.bodyMarkdown.trim() ? (
                    <div
                      className="prose prose-sm min-h-[420px] max-w-none px-6 py-5 text-ink prose-headings:font-semibold prose-headings:text-ink prose-p:leading-relaxed prose-p:text-ink-2 prose-strong:text-ink prose-code:rounded prose-code:bg-bone prose-code:px-1 prose-code:py-0.5 prose-code:text-ink"
                      dangerouslySetInnerHTML={{ __html: preview }}
                    />
                  ) : (
                    <div className="flex min-h-[420px] items-center justify-center text-sm text-ink-5">Nothing to preview yet.</div>
                  )}
                  <div className="flex items-center justify-between gap-3 border-t border-ink/[0.07] bg-bone/50 px-4 py-2 text-[11px] text-ink-5">
                    <span>Markdown · headings, lists, **bold**, `code`</span>
                    <span className="num-tabular">
                      {words} words · {readMinutes(form.bodyMarkdown)} min read
                    </span>
                  </div>
                </div>
                {fieldError('bodyMarkdown') && <p className="mt-1.5 text-xs text-rose">{fieldError('bodyMarkdown')}</p>}
              </div>
            </div>
          </Panel>

          {isNew ? (
            <section className="vyro-surface flex items-center gap-4 p-5 sm:p-6">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-volt-soft text-ink">
                <GraduationCapIcon size={18} />
              </span>
              <div>
                <div className="text-sm font-semibold text-ink">Knowledge check</div>
                <p className="mt-0.5 text-xs text-ink-4">Create the lesson first, then add quiz questions suppliers must pass.</p>
              </div>
            </section>
          ) : (
            <QuizBuilder key={quiz?.id ?? 'none'} lessonId={lessonId!} quiz={quiz} />
          )}
        </div>

        <aside className="space-y-6 lg:sticky lg:top-6">
          <Panel title="Publishing" icon={<SettingsIcon size={16} />}>
            <div className="space-y-5">
              <div>
                <FieldLabel>Track</FieldLabel>
                <Segmented
                  className="mt-2 w-full [&>button]:flex-1"
                  ariaLabel="Track"
                  value={form.track}
                  onChange={(t) => set('track', t)}
                  items={[
                    { key: 'onboarding', label: 'Onboarding' },
                    { key: 'operations', label: 'Operations' },
                  ]}
                />
              </div>

              <Field label="Position in track" hint="Lower numbers appear first.">
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    className={buttonClass('secondary', 'sm', 'size-9 justify-center px-0')}
                    onClick={() => set('orderIndex', Math.max(0, form.orderIndex - 1))}
                    aria-label="Move earlier"
                  >
                    −
                  </button>
                  <input
                    type="number"
                    min={0}
                    max={1000}
                    className={cn(controlClass, 'w-full text-center num-tabular')}
                    value={form.orderIndex}
                    onChange={(e) => set('orderIndex', Math.min(1000, Math.max(0, parseInt(e.target.value, 10) || 0)))}
                  />
                  <button
                    type="button"
                    className={buttonClass('secondary', 'sm', 'size-9 justify-center px-0')}
                    onClick={() => set('orderIndex', Math.min(1000, form.orderIndex + 1))}
                    aria-label="Move later"
                  >
                    +
                  </button>
                </div>
              </Field>

              <div className="space-y-1 border-t border-ink/[0.07] pt-4">
                <Toggle
                  checked={form.isPublished}
                  onChange={(v) => set('isPublished', v)}
                  label="Published"
                  description="Visible to suppliers in the training center."
                />
                <Toggle
                  checked={form.isRequiredForPublish}
                  onChange={(v) => set('isRequiredForPublish', v)}
                  label="Required to publish"
                  description="Suppliers must pass this lesson before listing products."
                />
                {form.isRequiredForPublish && !form.isPublished && (
                  <p className="rounded-lg bg-amber/[0.1] px-3 py-2 text-xs text-[#a86c28]">
                    Drafts aren’t enforced. Publish the lesson for the gate to apply.
                  </p>
                )}
              </div>
            </div>
          </Panel>

          <Panel title="Readiness" bodyClassName="py-3">
            <ul className="space-y-0.5">
              {checklist.map((c) => (
                <li key={c.label} className="flex items-center gap-3 py-1.5 text-[13px]">
                  <span
                    className={cn(
                      'flex size-5 shrink-0 items-center justify-center rounded-full',
                      c.done ? 'bg-mint text-paper' : 'shadow-[inset_0_0_0_1.5px_rgba(12,14,11,0.15)]',
                    )}
                  >
                    {c.done && <CheckIcon size={11} />}
                  </span>
                  <span className={cn('flex-1', c.done ? 'text-ink' : 'text-ink-4')}>{c.label}</span>
                  {c.hint && <span className="text-xs text-ink-5 num-tabular">{c.hint}</span>}
                </li>
              ))}
            </ul>
          </Panel>

          {!isNew && (
            <section className="rounded-[18px] p-5 shadow-[inset_0_0_0_1px_rgba(196,90,74,0.22)]">
              <div className="text-sm font-semibold text-ink">Delete lesson</div>
              <p className="mt-1 text-xs leading-relaxed text-ink-4">
                Removes the lesson, its quiz, and every supplier’s progress on it. This can’t be undone.
              </p>
              <div className="mt-3 flex gap-2">
                {confirmDelete ? (
                  <>
                    <Button
                      variant="danger"
                      size="sm"
                      disabled={del.isPending}
                      onClick={() => del.mutate(lessonId!, { onSuccess: () => navigate('/admin/learning') })}
                    >
                      {del.isPending ? 'Deleting…' : 'Yes, delete it'}
                    </Button>
                    <Button variant="ghost" size="sm" onClick={() => setConfirmDelete(false)}>
                      Cancel
                    </Button>
                  </>
                ) : (
                  <Button variant="secondary" size="sm" className="text-rose" onClick={() => setConfirmDelete(true)}>
                    <Trash2Icon size={13} />
                    Delete lesson
                  </Button>
                )}
              </div>
            </section>
          )}
        </aside>
      </div>
    </AdminPage>
  );
}

/* ---------------------------------------------------------------- Quiz builder */

interface DraftOption {
  key: string;
  label: string;
  isCorrect: boolean;
}
interface DraftQuestion {
  key: string;
  prompt: string;
  options: DraftOption[];
}

let keySeq = 0;
const nextKey = () => `k${++keySeq}`;
const blankQuestion = (): DraftQuestion => ({
  key: nextKey(),
  prompt: '',
  options: [
    { key: nextKey(), label: '', isCorrect: true },
    { key: nextKey(), label: '', isCorrect: false },
  ],
});

function QuizBuilder({ lessonId, quiz }: { lessonId: string; quiz: AdminQuiz | null }) {
  const replace = useAdminReplaceQuiz(lessonId);
  const initial = useMemo<DraftQuestion[]>(
    () =>
      quiz?.questions.map((q) => ({
        key: nextKey(),
        prompt: q.prompt,
        options: q.options.map((o) => ({ key: nextKey(), label: o.label, isCorrect: o.isCorrect })),
      })) ?? [],
    [quiz],
  );
  const [questions, setQuestions] = useState<DraftQuestion[]>(initial);
  const [threshold, setThreshold] = useState(quiz?.passThreshold ?? 1);
  const [saved, setSaved] = useState(false);
  const [touched, setTouched] = useState(false);

  const update = (fn: (qs: DraftQuestion[]) => DraftQuestion[]) => {
    setQuestions(fn);
    setTouched(true);
    setSaved(false);
  };
  const patchQ = (key: string, patch: (q: DraftQuestion) => DraftQuestion) =>
    update((qs) => qs.map((q) => (q.key === key ? patch(q) : q)));

  const maxThreshold = Math.max(1, Math.min(10, questions.length));
  const effectiveThreshold = Math.min(threshold, maxThreshold);

  const problems: string[] = [];
  if (questions.length === 0) problems.push('Add at least one question.');
  questions.forEach((q, i) => {
    if (q.prompt.trim().length < 3) problems.push(`Question ${i + 1} needs a prompt.`);
    if (q.options.some((o) => !o.label.trim())) problems.push(`Question ${i + 1} has an empty answer.`);
  });

  const onSave = () => {
    setTouched(true);
    if (problems.length) return;
    replace.mutate(
      {
        passThreshold: effectiveThreshold,
        questions: questions.map((q) => ({
          prompt: q.prompt.trim(),
          options: q.options.map((o) => ({ label: o.label.trim(), isCorrect: o.isCorrect })),
        })),
      },
      {
        onSuccess: () => {
          setSaved(true);
          setTouched(false);
        },
      },
    );
  };

  return (
    <Panel
      title="Knowledge check"
      description="Suppliers answer these after reading. Saving replaces the existing quiz."
      icon={<GraduationCapIcon size={16} />}
      actions={
        questions.length > 0 ? (
          <Pill tone={quiz ? 'success' : 'neutral'} dot>
            {questions.length} {questions.length === 1 ? 'question' : 'questions'}
          </Pill>
        ) : undefined
      }
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2 text-[13px] text-ink-3">
            <span>Pass with</span>
            <select
              className={cn(controlClass, 'h-8 pr-7')}
              value={effectiveThreshold}
              onChange={(e) => {
                setThreshold(Number(e.target.value));
                setTouched(true);
                setSaved(false);
              }}
              disabled={questions.length === 0}
            >
              {Array.from({ length: maxThreshold }, (_, i) => i + 1).map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <span>of {questions.length} correct</span>
          </div>
          <div className="flex items-center gap-3">
            {saved && !touched && (
              <span className="inline-flex items-center gap-1.5 text-xs font-medium text-mint">
                <CheckCircleIcon size={13} /> Quiz saved
              </span>
            )}
            <Button variant="primary" size="sm" onClick={onSave} disabled={replace.isPending || !touched}>
              {replace.isPending ? 'Saving…' : 'Save quiz'}
            </Button>
          </div>
        </div>
      }
    >
      {questions.length === 0 ? (
        <div className="flex flex-col items-center rounded-xl px-6 py-10 text-center shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] [border-style:dashed]">
          <p className="text-sm font-medium text-ink">No questions yet</p>
          <p className="mt-1 max-w-xs text-xs text-ink-4">Add 2–5 short multiple-choice questions to confirm suppliers understood the lesson.</p>
          <Button className="mt-4" size="sm" onClick={() => update((qs) => [...qs, blankQuestion()])}>
            <PlusIcon size={13} /> Add first question
          </Button>
        </div>
      ) : (
        <ol className="space-y-4">
          {questions.map((q, qi) => (
            <li key={q.key} className="rounded-xl bg-bone/40 p-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.07)]">
              <div className="flex items-start gap-3">
                <span className="mt-1.5 flex size-6 shrink-0 items-center justify-center rounded-md bg-ink text-[11px] font-bold text-volt num-tabular">
                  {qi + 1}
                </span>
                <input
                  className={cn(controlClass, 'h-10 w-full font-medium')}
                  value={q.prompt}
                  placeholder="Question prompt"
                  onChange={(e) => patchQ(q.key, (x) => ({ ...x, prompt: e.target.value }))}
                />
                <button
                  type="button"
                  className="mt-1 flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-5 transition-colors hover:bg-rose/[0.08] hover:text-rose"
                  aria-label={`Remove question ${qi + 1}`}
                  onClick={() => update((qs) => qs.filter((x) => x.key !== q.key))}
                >
                  <Trash2Icon size={14} />
                </button>
              </div>

              <div role="radiogroup" aria-label={`Answers for question ${qi + 1}`} className="mt-3 space-y-2 pl-9">
                {q.options.map((o, oi) => (
                  <div key={o.key} className="flex items-center gap-2">
                    <button
                      type="button"
                      role="radio"
                      aria-checked={o.isCorrect}
                      aria-label={`Mark answer ${oi + 1} correct`}
                      title={o.isCorrect ? 'Correct answer' : 'Mark as correct'}
                      onClick={() =>
                        patchQ(q.key, (x) => ({ ...x, options: x.options.map((y) => ({ ...y, isCorrect: y.key === o.key })) }))
                      }
                      className={cn(
                        'flex size-5 shrink-0 items-center justify-center rounded-full transition-all',
                        o.isCorrect
                          ? 'bg-mint text-paper shadow-[0_0_0_3px_rgba(61,139,110,0.15)]'
                          : 'bg-paper shadow-[inset_0_0_0_1.5px_rgba(12,14,11,0.2)] hover:shadow-[inset_0_0_0_1.5px_rgba(61,139,110,0.6)]',
                      )}
                    >
                      {o.isCorrect && <CheckIcon size={11} />}
                    </button>
                    <input
                      className={cn(controlClass, 'w-full', o.isCorrect && 'shadow-[inset_0_0_0_1px_rgba(61,139,110,0.45)]')}
                      value={o.label}
                      placeholder={`Answer ${oi + 1}`}
                      onChange={(e) =>
                        patchQ(q.key, (x) => ({
                          ...x,
                          options: x.options.map((y) => (y.key === o.key ? { ...y, label: e.target.value } : y)),
                        }))
                      }
                    />
                    <button
                      type="button"
                      disabled={q.options.length <= 2}
                      className="flex size-8 shrink-0 items-center justify-center rounded-lg text-ink-5 transition-colors hover:bg-ink/[0.05] hover:text-ink disabled:pointer-events-none disabled:opacity-30"
                      aria-label={`Remove answer ${oi + 1}`}
                      onClick={() =>
                        patchQ(q.key, (x) => {
                          const options = x.options.filter((y) => y.key !== o.key);
                          if (!options.some((y) => y.isCorrect)) options[0] = { ...options[0]!, isCorrect: true };
                          return { ...x, options };
                        })
                      }
                    >
                      <XIcon size={13} />
                    </button>
                  </div>
                ))}
                {q.options.length < 6 && (
                  <button
                    type="button"
                    className="ml-7 inline-flex items-center gap-1.5 rounded-md px-1.5 py-1 text-xs font-medium text-ink-4 transition-colors hover:bg-ink/[0.05] hover:text-ink"
                    onClick={() =>
                      patchQ(q.key, (x) => ({ ...x, options: [...x.options, { key: nextKey(), label: '', isCorrect: false }] }))
                    }
                  >
                    <PlusIcon size={12} /> Add answer
                  </button>
                )}
              </div>
            </li>
          ))}
        </ol>
      )}

      {questions.length > 0 && questions.length < 20 && (
        <button
          type="button"
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl py-3 text-[13px] font-medium text-ink-4 shadow-[inset_0_0_0_1px_rgba(12,14,11,0.1)] transition-all [border-style:dashed] hover:bg-bone/50 hover:text-ink"
          onClick={() => update((qs) => [...qs, blankQuestion()])}
        >
          <PlusIcon size={14} /> Add question
        </button>
      )}

      {touched && problems.length > 0 && (
        <Callout tone="warning" className="mt-4" title="Finish the quiz before saving">
          {problems[0]}
          {problems.length > 1 && ` (+${problems.length - 1} more)`}
        </Callout>
      )}
      {replace.error && (
        <Callout tone="danger" className="mt-4" title="Couldn’t save the quiz">
          {errorMessage(replace.error)}
        </Callout>
      )}
    </Panel>
  );
}

/* ---------------------------------------------------------------- Bits */

function SaveState({ dirty, saving, savedAt, isNew }: { dirty: boolean; saving: boolean; savedAt: number | null; isNew: boolean }) {
  if (isNew || saving) return null;
  return (
    <span className="mr-1 hidden items-center gap-1.5 text-xs text-ink-4 sm:inline-flex">
      {dirty ? (
        <>
          <span className="size-1.5 rounded-full bg-amber" aria-hidden /> Unsaved changes
          <kbd className="ml-1 rounded bg-ink/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-ink-4">⌘S</kbd>
        </>
      ) : savedAt ? (
        <>
          <CheckCircleIcon size={13} className="text-mint" /> Saved
        </>
      ) : (
        <>All changes saved</>
      )}
    </span>
  );
}

function FieldLabel({ children }: { children: ReactNode }) {
  return <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-ink-4">{children}</span>;
}

function Field({
  label,
  hint,
  error,
  counter,
  children,
}: {
  label: string;
  hint?: string | undefined;
  error?: string | undefined;
  counter?: string | undefined;
  children: ReactNode;
}) {
  return (
    <label className="block">
      <div className="mb-2 flex items-baseline justify-between gap-3">
        <FieldLabel>{label}</FieldLabel>
        {counter && <span className="text-[11px] text-ink-5 num-tabular">{counter}</span>}
      </div>
      {children}
      {error ? (
        <p className="mt-1.5 text-xs text-rose">{error}</p>
      ) : hint ? (
        <p className="mt-1.5 text-xs text-ink-5">{hint}</p>
      ) : null}
    </label>
  );
}

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className="-mx-2 flex w-[calc(100%+1rem)] items-start gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-bone/50"
    >
      <span className="min-w-0 flex-1">
        <span className="block text-[13px] font-semibold text-ink">{label}</span>
        <span className="mt-0.5 block text-xs leading-relaxed text-ink-4">{description}</span>
      </span>
      <span
        className={cn(
          'relative mt-0.5 inline-flex h-5 w-9 shrink-0 items-center rounded-full transition-colors duration-200',
          checked ? 'bg-ink' : 'bg-ink/15',
        )}
        aria-hidden
      >
        <span
          className={cn(
            'absolute size-4 rounded-full shadow-[0_1px_3px_rgba(12,14,11,0.3)] transition-all duration-200',
            checked ? 'left-[18px] bg-volt' : 'left-0.5 bg-paper',
          )}
        />
      </span>
    </button>
  );
}
