import { useEffect, useState } from 'react';
import { Pressable, View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import DraggableFlatList, { ScaleDecorator, type RenderItemParams } from 'react-native-draggable-flatlist';
import { ArrowUpDown, BookOpen, CheckCircle2, Circle, Eye, EyeOff, GraduationCap, GripVertical, ListChecks, Pencil, Plus, Trash2 } from 'lucide-react-native';
import {
  Banner,
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  ListHeader,
  ListScreen,
  Screen,
  ScreenHeader,
  Segmented,
  Select,
  Sheet,
  SkeletonList,
  StatusBadge,
  Text,
  ToggleRow,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { colors, GUTTER } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { MonoTag } from '../../buyer/orders/kit';
import { RecordCard } from '@/features/admin/ops/kit';

interface Lesson {
  id: string;
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  track: 'onboarding' | 'operations';
  orderIndex: number;
  isPublished: boolean;
  isRequiredForPublish: boolean;
  createdAt: number;
  updatedAt: number;
}

type Track = 'onboarding' | 'operations';

interface LessonForm {
  slug: string;
  title: string;
  summary: string;
  bodyMarkdown: string;
  track: Track;
  orderIndex: string;
  isPublished: boolean;
  isRequiredForPublish: boolean;
}

const EMPTY_FORM: LessonForm = {
  slug: '',
  title: '',
  summary: '',
  bodyMarkdown: '',
  track: 'onboarding',
  orderIndex: '0',
  isPublished: false,
  isRequiredForPublish: false,
};

function toForm(l: Lesson): LessonForm {
  return {
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    bodyMarkdown: l.bodyMarkdown,
    track: l.track,
    orderIndex: String(l.orderIndex),
    isPublished: !!l.isPublished,
    isRequiredForPublish: !!l.isRequiredForPublish,
  };
}

function lessonPayload(l: Lesson, orderIndex = l.orderIndex) {
  return {
    slug: l.slug,
    title: l.title,
    summary: l.summary,
    bodyMarkdown: l.bodyMarkdown,
    track: l.track,
    orderIndex,
    isPublished: !!l.isPublished,
    isRequiredForPublish: !!l.isRequiredForPublish,
  };
}

function formPayload(f: LessonForm) {
  return {
    slug: f.slug.trim(),
    title: f.title.trim(),
    summary: f.summary.trim(),
    bodyMarkdown: f.bodyMarkdown,
    track: f.track,
    orderIndex: Math.max(0, Math.min(1000, Math.floor(Number(f.orderIndex) || 0))),
    isPublished: f.isPublished,
    isRequiredForPublish: f.isRequiredForPublish,
  };
}

function formError(f: LessonForm): string | null {
  if (!/^[a-z0-9-]{2,120}$/.test(f.slug.trim())) return 'Slug must be 2+ chars, lowercase letters, digits and hyphens only.';
  if (f.title.trim().length < 2) return 'Title needs at least 2 characters.';
  if (f.summary.trim().length < 2) return 'Summary needs at least 2 characters.';
  if (f.bodyMarkdown.trim().length < 10) return 'Body needs at least 10 characters.';
  if (!Number.isInteger(Number(f.orderIndex))) return 'Order index must be a whole number.';
  return null;
}

/** /admin/learning — supplier academy lesson management (mirrors web LessonsAdmin + LessonEditor). */
export function AdminLearningScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const [track, setTrack] = useState<Track | 'all'>('all');
  const [editor, setEditor] = useState<{ lesson: Lesson | null } | null>(null);
  const [quizFor, setQuizFor] = useState<Lesson | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);

  const q = useQuery({
    queryKey: ['admin', 'learning', 'list'],
    queryFn: () => api.get<{ lessons: Lesson[] }>('/admin/learning/lessons'),
  });
  const toggle = useMutation({
    mutationFn: (l: Lesson) => api.put(`/admin/learning/lessons/${l.id}`, { ...lessonPayload(l), isPublished: !l.isPublished }),
    onSuccess: () => qc.invalidateQueries({ queryKey: ['admin', 'learning'] }),
    onError: (e) => toast.error('Update failed', errorMessage(e)),
  });
  const del = useMutation({
    mutationFn: (id: string) => api.del(`/admin/learning/lessons/${id}`),
    onSuccess: () => {
      toast.success('Lesson deleted');
      setDeleteTarget(null);
      qc.invalidateQueries({ queryKey: ['admin', 'learning'] });
    },
    onError: (e) => toast.error('Delete failed', errorMessage(e)),
  });

  const lessons = (q.data?.lessons ?? []).filter((l) => track === 'all' || l.track === track);

  /* Drag-to-reorder mode: reassigns each dragged lesson its slot's orderIndex
   * (slots keep the visible set's original indices so hidden tracks stay put). */
  const [reordering, setReordering] = useState(false);
  const [draft, setDraft] = useState<Lesson[] | null>(null);
  const saveOrder = useMutation({
    mutationFn: async (list: Lesson[]) => {
      const slots = list.map((l) => l.orderIndex).sort((a, b) => a - b);
      await Promise.all(
        list.map((l, i) => (l.orderIndex === slots[i] ? Promise.resolve() : api.put(`/admin/learning/lessons/${l.id}`, lessonPayload(l, slots[i])))),
      );
    },
    onSuccess: () => {
      toast.success('Order saved');
      haptic.success();
      setReordering(false);
      setDraft(null);
      qc.invalidateQueries({ queryKey: ['admin', 'learning'] });
    },
    onError: (e) => toast.error('Reorder failed', errorMessage(e)),
  });

  if (reordering) {
    const rows = draft ?? lessons;
    return (
      <Screen
        scroll={false}
        header={
          <ScreenHeader
            back={() => {
              setReordering(false);
              setDraft(null);
            }}
            kicker="Supplier academy"
            title="Reorder"
            subtitle="Long-press a row and drag to set the lesson order."
          />
        }
        footer={
          <>
            <Button title="Save order" icon={CheckCircle2} variant="volt" full loading={saveOrder.isPending} onPress={() => saveOrder.mutate(rows)} />
            <Button
              title="Cancel"
              variant="ghost"
              full
              onPress={() => {
                setReordering(false);
                setDraft(null);
              }}
            />
          </>
        }
      >
        <DraggableFlatList
          data={rows}
          keyExtractor={(l) => l.id}
          onDragBegin={() => haptic.medium()}
          onDragEnd={({ data }) => setDraft(data)}
          activationDistance={14}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: 24, gap: 12 }}
          renderItem={({ item: l, drag, isActive }: RenderItemParams<Lesson>) => (
            <ScaleDecorator activeScale={0.97}>
              <Pressable onLongPress={drag} disabled={isActive} accessibilityLabel={`Drag ${l.title}`} accessibilityRole="button">
                <RecordCard
                  icon={GripVertical}
                  tone={isActive ? 'volt' : 'paper'}
                  title={l.title}
                  subtitle={l.summary}
                  chips={
                    <>
                      <MonoTag label={l.track} tone="copper" />
                      <MonoTag label={`#${l.orderIndex}`} tone="ink" />
                    </>
                  }
                />
              </Pressable>
            </ScaleDecorator>
          )}
        />
      </Screen>
    );
  }

  return (
    <>
      <ListScreen
        data={lessons}
        keyExtractor={(l) => l.id}
        onRefresh={() => q.refetch()}
        header={
          <ListHeader>
            <ScreenHeader
              back
              kicker="Supplier academy"
              title="Learning"
              subtitle={`${q.data?.lessons.length ?? 0} lesson${(q.data?.lessons.length ?? 0) === 1 ? '' : 's'} · ${(q.data?.lessons ?? []).filter((l) => l.isPublished).length} published`}
              right={
                <>
                  <IconButton
                    icon={ArrowUpDown}
                    variant="surface"
                    accessibilityLabel="Reorder lessons"
                    onPress={() => {
                      setDraft(lessons);
                      setReordering(true);
                    }}
                  />
                  <IconButton icon={Plus} variant="ink" accessibilityLabel="New lesson" onPress={() => setEditor({ lesson: null })} />
                </>
              }
            />
            <Segmented<Track | 'all'>
              value={track}
              onChange={setTrack}
              options={[
                { value: 'all', label: 'All' },
                { value: 'onboarding', label: 'Onboarding' },
                { value: 'operations', label: 'Operations' },
              ]}
            />
          </ListHeader>
        }
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonList rows={5} height={80} />
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState icon={BookOpen} title="No lessons" message="Create the first supplier academy lesson." action={{ label: 'New lesson', onPress: () => setEditor({ lesson: null }) }} />
          )
        }
        renderItem={({ item: l }) => (
          <RecordCard
            icon={GraduationCap}
            tone={l.isPublished ? 'volt' : 'paper'}
            title={l.title}
            subtitle={l.summary}
            meta={l.updatedAt ? `Updated ${timeAgo(l.updatedAt)}` : null}
            status={<StatusBadge status={l.isPublished ? 'published' : 'draft'} size="sm" label={l.isPublished ? 'Published' : 'Draft'} />}
            chips={
              <>
                <MonoTag label={l.track} tone="copper" />
                <MonoTag label={`#${l.orderIndex}`} tone="ink" />
                {l.isRequiredForPublish ? <MonoTag label="required" tone="amber" /> : null}
              </>
            }
            actions={
              <>
                <Button
                  title={l.isPublished ? 'Unpublish' : 'Publish'}
                  icon={l.isPublished ? EyeOff : Eye}
                  size="sm"
                  variant={l.isPublished ? 'paper' : 'primary'}
                  loading={toggle.isPending}
                  onPress={() => toggle.mutate(l)}
                />
                <Button title="Edit" icon={Pencil} size="sm" variant="paper" onPress={() => setEditor({ lesson: l })} />
                <IconButton icon={ListChecks} variant="surface" size={34} accessibilityLabel="Edit quiz" onPress={() => setQuizFor(l)} />
                <View style={{ flex: 1 }} />
                <IconButton icon={Trash2} variant="surface" size={34} color={colors.rose} accessibilityLabel="Delete lesson" onPress={() => setDeleteTarget(l)} />
              </>
            }
          />
        )}
      />
      <LessonEditorSheet visible={!!editor} lesson={editor?.lesson ?? null} onClose={() => setEditor(null)} />
      <QuizSheet visible={!!quizFor} lesson={quizFor} onClose={() => setQuizFor(null)} />
      <ConfirmSheet
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
        title="Delete lesson?"
        message={`"${deleteTarget?.title}" and its quiz will be removed from the academy.`}
        confirmLabel="Delete"
        variant="danger"
        loading={del.isPending}
      />
    </>
  );
}

function LessonEditorSheet({ visible, lesson, onClose }: { visible: boolean; lesson: Lesson | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const isNew = !lesson;
  const [form, setForm] = useState<LessonForm>(EMPTY_FORM);
  const [err, setErr] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!visible) return;
    if ((lesson?.id ?? 'new') === loadedFor) return;
    setLoadedFor(lesson?.id ?? 'new');
    setForm(lesson ? toForm(lesson) : EMPTY_FORM);
    setErr(null);
  }, [visible, lesson?.id, loadedFor]);

  const save = useMutation({
    mutationFn: () => {
      const payload = formPayload(form);
      return isNew ? api.post('/admin/learning/lessons', payload) : api.put(`/admin/learning/lessons/${lesson!.id}`, payload);
    },
    onSuccess: () => {
      toast.success(isNew ? 'Lesson created' : 'Lesson saved');
      qc.invalidateQueries({ queryKey: ['admin', 'learning'] });
      onClose();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const set = (patch: Partial<LessonForm>) => setForm((f) => ({ ...f, ...patch }));

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={isNew ? 'New lesson' : 'Edit lesson'}
      subtitle={isNew ? 'Created as a draft — publish when ready.' : lesson?.slug}
      scroll
      footer={
        <Button
          title={isNew ? 'Create lesson' : 'Save lesson'}
          icon={GraduationCap}
          variant="volt"
          full
          loading={save.isPending}
          onPress={() => {
            const e = formError(form);
            if (e) {
              setErr(e);
              return;
            }
            setErr(null);
            save.mutate();
          }}
        />
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label="Title" required>
          <Input value={form.title} onChangeText={(v) => set({ title: v })} placeholder="Cold-chain handling basics" />
        </Field>
        <Field label="Slug" required hint="Lowercase letters, digits, hyphens." >
          <Input value={form.slug} onChangeText={(v) => set({ slug: v })} placeholder="cold-chain-basics" autoCapitalize="none" editable={isNew} />
        </Field>
        <Field label="Summary" required>
          <Input value={form.summary} onChangeText={(v) => set({ summary: v })} placeholder="What this lesson covers…" multiline numberOfLines={2} style={{ minHeight: 56, textAlignVertical: 'top' }} />
        </Field>
        <Field label="Body (Markdown)" required hint="Minimum 10 characters.">
          <Input value={form.bodyMarkdown} onChangeText={(v) => set({ bodyMarkdown: v })} placeholder={'## Why cold chain matters\n…'} multiline numberOfLines={8} autoCapitalize="none" style={{ minHeight: 160, textAlignVertical: 'top' }} />
        </Field>
        <View style={{ flexDirection: 'row', gap: 10 }}>
          <View style={{ flex: 1 }}>
            <Field label="Track" required>
              <Select<Track>
                value={form.track}
                onChange={(v) => set({ track: v })}
                title="Track"
                options={[
                  { value: 'onboarding', label: 'Onboarding' },
                  { value: 'operations', label: 'Operations' },
                ]}
              />
            </Field>
          </View>
          <View style={{ flex: 1 }}>
            <Field label="Order index" required>
              <Input value={form.orderIndex} onChangeText={(v) => set({ orderIndex: v })} keyboardType="number-pad" />
            </Field>
          </View>
        </View>
        <View>
          <ToggleRow label="Published" description="Visible to suppliers in the academy." value={form.isPublished} onValueChange={(v) => set({ isPublished: v })} />
          <ToggleRow label="Required for publish gate" description="Supplier must pass this lesson before going live." value={form.isRequiredForPublish} onValueChange={(v) => set({ isRequiredForPublish: v })} last />
        </View>
      </View>
    </Sheet>
  );
}

interface QuizOptionDraft {
  label: string;
  isCorrect: boolean;
}
interface QuizQuestionDraft {
  prompt: string;
  options: QuizOptionDraft[];
}

const EMPTY_QUESTION: QuizQuestionDraft = {
  prompt: '',
  options: [
    { label: '', isCorrect: true },
    { label: '', isCorrect: false },
  ],
};

function QuizSheet({ visible, lesson, onClose }: { visible: boolean; lesson: Lesson | null; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [threshold, setThreshold] = useState('1');
  const [questions, setQuestions] = useState<QuizQuestionDraft[]>([EMPTY_QUESTION]);
  const [err, setErr] = useState<string | null>(null);
  const [loadedFor, setLoadedFor] = useState<string | null>(null);

  useEffect(() => {
    if (!visible || !lesson) return;
    if (lesson.id === loadedFor) return;
    setLoadedFor(lesson.id);
    setThreshold('1');
    setQuestions([EMPTY_QUESTION]);
    setErr(null);
  }, [visible, lesson, loadedFor]);

  const save = useMutation({
    mutationFn: () =>
      api.post(`/admin/learning/lessons/${lesson!.id}/quiz`, {
        passThreshold: Math.max(1, Math.floor(Number(threshold) || 1)),
        questions: questions.map((qq) => ({
          prompt: qq.prompt.trim(),
          options: qq.options.map((o) => ({ label: o.label.trim(), isCorrect: o.isCorrect })),
        })),
      }),
    onSuccess: () => {
      toast.success('Quiz saved');
      qc.invalidateQueries({ queryKey: ['admin', 'learning'] });
      onClose();
    },
    onError: (e) => setErr(errorMessage(e)),
  });

  const patchQuestion = (qi: number, patch: Partial<QuizQuestionDraft>) =>
    setQuestions((qs) => qs.map((qq, i) => (i === qi ? { ...qq, ...patch } : qq)));

  const validate = (): string | null => {
    if (questions.length < 1 || questions.length > 20) return 'Between 1 and 20 questions.';
    for (const [i, qq] of questions.entries()) {
      if (qq.prompt.trim().length < 3) return `Question ${i + 1}: prompt needs at least 3 characters.`;
      if (qq.options.length < 2 || qq.options.length > 6) return `Question ${i + 1}: needs 2–6 options.`;
      if (qq.options.some((o) => !o.label.trim())) return `Question ${i + 1}: every option needs a label.`;
      if (qq.options.filter((o) => o.isCorrect).length !== 1) return `Question ${i + 1}: mark exactly one correct option.`;
    }
    if (!Number.isInteger(Number(threshold)) || Number(threshold) < 1) return 'Pass threshold must be a whole number ≥ 1.';
    return null;
  };

  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="Replace quiz"
      subtitle={lesson ? lesson.title : undefined}
      scroll
      footer={
        <Button
          title="Save quiz"
          icon={ListChecks}
          variant="volt"
          full
          loading={save.isPending}
          onPress={() => {
            const e = validate();
            if (e) {
              setErr(e);
              return;
            }
            setErr(null);
            save.mutate();
          }}
        />
      }
    >
      <View style={{ gap: 14 }}>
        {err ? <Banner tone="danger" message={err} /> : null}
        <Field label="Pass threshold" hint="Correct answers required to pass.">
          <Input value={threshold} onChangeText={setThreshold} keyboardType="number-pad" />
        </Field>
        {questions.map((qq, qi) => (
          <View key={qi} style={{ gap: 10, padding: 12, borderRadius: 16, borderCurve: 'continuous', backgroundColor: colors.pearl }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <Text variant="overline" color="ink5">
                Question {qi + 1}
              </Text>
              {questions.length > 1 ? (
                <Pressable onPress={() => setQuestions((qs) => qs.filter((_, i) => i !== qi))} hitSlop={8}>
                  <Trash2 size={16} color={colors.rose} />
                </Pressable>
              ) : null}
            </View>
            <Input value={qq.prompt} onChangeText={(v) => patchQuestion(qi, { prompt: v })} placeholder="What should a supplier do when…" multiline />
            {qq.options.map((o, oi) => (
              <View key={oi} style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Pressable
                  onPress={() =>
                    patchQuestion(qi, {
                      options: qq.options.map((x, xi) => ({ ...x, isCorrect: xi === oi })),
                    })
                  }
                  hitSlop={6}
                >
                  {o.isCorrect ? <CheckCircle2 size={20} color={colors.mint} /> : <Circle size={20} color={colors.ink5} />}
                </Pressable>
                <View style={{ flex: 1 }}>
                  <Input
                    value={o.label}
                    onChangeText={(v) => patchQuestion(qi, { options: qq.options.map((x, xi) => (xi === oi ? { ...x, label: v } : x)) })}
                    placeholder={`Option ${oi + 1}`}
                  />
                </View>
                {qq.options.length > 2 ? (
                  <Pressable onPress={() => patchQuestion(qi, { options: qq.options.filter((_, xi) => xi !== oi) })} hitSlop={6}>
                    <Trash2 size={15} color={colors.ink5} />
                  </Pressable>
                ) : null}
              </View>
            ))}
            {qq.options.length < 6 ? (
              <Button
                title="Add option"
                size="sm"
                variant="ghost"
                onPress={() => patchQuestion(qi, { options: [...qq.options, { label: '', isCorrect: false }] })}
              />
            ) : null}
          </View>
        ))}
        {questions.length < 20 ? (
          <Button title="Add question" size="sm" variant="paper" icon={Plus} onPress={() => setQuestions((qs) => [...qs, { prompt: '', options: [{ label: '', isCorrect: true }, { label: '', isCorrect: false }] }])} />
        ) : null}
        <Text variant="caption" color="ink4">
          Saving replaces the entire quiz for this lesson.
        </Text>
      </View>
    </Sheet>
  );
}
