import { useState } from 'react';
import type { ReactNode } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Button, Input, Select, Textarea } from '@/components/ui';
import { AdminPage, AdminPageHeader, Panel } from '../ui';
import {
  useAdminLessons,
  useAdminCreateLesson,
  useAdminUpdateLesson,
  useAdminReplaceQuiz,
} from './hooks/useAdminLearning';

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

export function LessonEditor() {
  const { id } = useParams<{ id?: string }>();
  const navigate = useNavigate();
  const isNew = !id || id === 'new';
  const { data } = useAdminLessons();
  const create = useAdminCreateLesson();
  const update = useAdminUpdateLesson(id ?? '');
  const replaceQuiz = useAdminReplaceQuiz(id ?? '');

  const existing = !isNew
    ? (data?.lessons ?? []).find((l) => (l as { id: string }).id === id)
    : undefined;
  const initial: Form = existing
    ? {
        slug: (existing as { slug: string }).slug,
        title: (existing as { title: string }).title,
        summary: (existing as { summary: string }).summary,
        bodyMarkdown: (existing as { bodyMarkdown?: string }).bodyMarkdown ?? '',
        track: (existing as { track: 'onboarding' | 'operations' }).track,
        orderIndex: (existing as { orderIndex: number }).orderIndex,
        isPublished: Boolean((existing as { isPublished: number | boolean }).isPublished),
        isRequiredForPublish: Boolean(
          (existing as { isRequiredForPublish: number | boolean }).isRequiredForPublish,
        ),
      }
    : EMPTY;

  const [form, setForm] = useState<Form>(initial);

  const onSave = async () => {
    if (isNew) {
      await create.mutateAsync(form as unknown as Record<string, unknown>);
      navigate('/admin/learning');
    } else {
      await update.mutateAsync(form as unknown as Record<string, unknown>);
    }
  };

  const onSaveQuiz = async () => {
    const thresholdStr = prompt('Pass threshold (number of correct answers required)?', '2');
    if (!thresholdStr) return;
    const threshold = parseInt(thresholdStr, 10);
    if (Number.isNaN(threshold)) return;
    const raw = prompt(
      'Paste quiz JSON: { questions: [{ prompt, options: [{label, isCorrect}] }] }',
      JSON.stringify({ passThreshold: threshold, questions: [] }),
    );
    if (!raw) return;
    try {
      const parsed = JSON.parse(raw);
      await replaceQuiz.mutateAsync(parsed);
      alert('Quiz saved.');
    } catch (e) {
      alert(`Invalid JSON: ${(e as Error).message}`);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">{isNew ? 'New lesson' : 'Edit lesson'}</h1>
        <Link to="/admin/learning" className="text-sm text-sky-700 underline">← Back</Link>
      </div>

      <label className="block">
        <span className="text-xs uppercase text-slate-500">Slug</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          value={form.slug}
          onChange={(e) => setForm({ ...form, slug: e.target.value })}
          disabled={!isNew}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase text-slate-500">Title</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          value={form.title}
          onChange={(e) => setForm({ ...form, title: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase text-slate-500">Summary</span>
        <input
          className="mt-1 w-full rounded border px-2 py-1"
          value={form.summary}
          onChange={(e) => setForm({ ...form, summary: e.target.value })}
        />
      </label>
      <label className="block">
        <span className="text-xs uppercase text-slate-500">Body (Markdown)</span>
        <textarea
          className="mt-1 w-full rounded border px-2 py-1 font-mono"
          rows={12}
          value={form.bodyMarkdown}
          onChange={(e) => setForm({ ...form, bodyMarkdown: e.target.value })}
        />
      </label>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase text-slate-500">Track</span>
          <select
            className="mt-1 w-full rounded border px-2 py-1"
            value={form.track}
            onChange={(e) => setForm({ ...form, track: e.target.value as Form['track'] })}
          >
            <option value="onboarding">onboarding</option>
            <option value="operations">operations</option>
          </select>
        </label>
        <label className="block">
          <span className="text-xs uppercase text-slate-500">Order index</span>
          <input
            type="number"
            className="mt-1 w-full rounded border px-2 py-1"
            value={form.orderIndex}
            onChange={(e) => setForm({ ...form, orderIndex: parseInt(e.target.value, 10) || 0 })}
          />
        </label>
      </div>

      <div className="flex gap-4 text-sm">
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isPublished}
            onChange={(e) => setForm({ ...form, isPublished: e.target.checked })}
          />
          Published
        </label>
        <label className="inline-flex items-center gap-2">
          <input
            type="checkbox"
            checked={form.isRequiredForPublish}
            onChange={(e) => setForm({ ...form, isRequiredForPublish: e.target.checked })}
          />
          Required for publish gate
        </label>
      </div>

      <div className="flex gap-3 pt-2">
        <button
          type="button"
          onClick={onSave}
          disabled={create.isPending || update.isPending}
          className="rounded bg-sky-600 px-3 py-1 text-white disabled:opacity-50"
        >
          Save lesson
        </button>
        {!isNew && (
          <button
            type="button"
            onClick={onSaveQuiz}
            className="rounded border border-sky-600 px-3 py-1 text-sky-700"
          >
            Replace quiz (JSON)
          </button>
        )}
      </div>
    </div>
  );
}
