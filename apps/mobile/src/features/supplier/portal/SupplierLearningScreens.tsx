import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { View } from 'react-native';
import { ArrowRight, BookOpen, CheckCircle2, CircleHelp, GraduationCap } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  IconTile,
  Kicker,
  ProgressBar,
  RadioCards,
  Screen,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
import { Enter, ItemCard, SummaryHero } from '@/features/supplier/ops/kit';
import { useSupplierLesson, useSupplierLessons } from './api';

export function SupplierLearningScreen() {
  const supplierId = useSupplierId();
  const q = useSupplierLessons(supplierId);

  if (q.isLoading)
    return (
      <Screen back kicker="Training" title="Learning centre">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Training" title="Learning centre" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );

  const lessons = q.data?.lessons ?? [];
  const done = lessons.filter((l) => l.completed).length;
  const todo = lessons.filter((l) => !l.completed).sort((a, b) => Number(!!b.required) - Number(!!a.required));
  const completed = lessons.filter((l) => l.completed);
  const requiredLeft = todo.filter((l) => l.required).length;
  const next = todo[0];

  const row = (l: (typeof lessons)[number], i: number) => (
    <Enter key={l.slug} i={i + 1}>
      <ItemCard
        icon={l.completed ? CheckCircle2 : BookOpen}
        iconTone={l.completed ? 'success' : l.required ? 'warning' : 'paper'}
        title={l.title}
        subtitle={`${l.track ?? 'General'}${l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}`}
        badge={<StatusBadge status={l.completed ? 'completed' : l.required ? 'required' : 'optional'} size="sm" />}
        onPress={() => router.push(`/supplier/learning/${l.slug}` as never)}
      />
    </Enter>
  );

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Training" title="Learning centre" subtitle="Complete required training to publish and sell.">
      <Enter>
        <SummaryHero
          icon={GraduationCap}
          kicker="Your progress"
          value={`${done} of ${lessons.length} lessons`}
          sub={requiredLeft ? `${requiredLeft} required ${requiredLeft === 1 ? 'lesson' : 'lessons'} left before you can go live.` : lessons.length ? 'All required training complete — you are cleared to sell.' : undefined}
          right={
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 13, color: colors.volt }}>
              {lessons.length ? Math.round((done / lessons.length) * 100) : 0}%
            </Text>
          }
        >
          {lessons.length ? <ProgressBar value={done} max={Math.max(1, lessons.length)} tone="volt" track="rgba(250,247,240,0.12)" /> : null}
          {next ? (
            <Button
              title={`Continue · ${next.title}`}
              icon={ArrowRight}
              variant="volt"
              full
              onPress={() => router.push(`/supplier/learning/${next.slug}` as never)}
            />
          ) : null}
        </SummaryHero>
      </Enter>
      {lessons.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No lessons yet" message="Training modules appear here when published." />
      ) : (
        <>
          {todo.length ? (
            <Text variant="overline" color="ink4" style={{ marginLeft: 6, marginBottom: -6 }}>
              To do · {todo.length}
            </Text>
          ) : null}
          {todo.map(row)}
          {completed.length ? (
            <Text variant="overline" color="ink4" style={{ marginLeft: 6, marginTop: 6, marginBottom: -6 }}>
              Completed · {completed.length}
            </Text>
          ) : null}
          {completed.map((l, i) => row(l, todo.length + i))}
        </>
      )}
    </Screen>
  );
}

export function SupplierLessonDetailScreen() {
  const { slug } = useLocalSearchParams<{ slug: string }>();
  const supplierId = useSupplierId();
  const qc = useQueryClient();
  const toast = useToast();
  const s = typeof slug === 'string' ? slug : undefined;
  const q = useSupplierLesson(supplierId, s);
  const [answers, setAnswers] = useState<Record<string, string>>({});

  const complete = useMutation({
    mutationFn: () => api.post(`/supplier/learning/${encodeURIComponent(s ?? '')}/complete-article${qs({ supplierId })}`),
    onSuccess: () => {
      toast.success('Lesson completed');
      void qc.invalidateQueries({ queryKey: ['learning', 'detail', supplierId, s] });
      void qc.invalidateQueries({ queryKey: ['learning', 'list', supplierId] });
    },
    onError: (e) => toast.error('Could not complete', errorMessage(e)),
  });

  const quiz = useMutation({
    mutationFn: (payload: { questionId: string; optionId: string }[]) =>
      api.post(`/supplier/learning/${encodeURIComponent(s ?? '')}/quiz${qs({ supplierId })}`, { answers: payload }),
    onSuccess: () => {
      toast.success('Quiz submitted');
      void qc.invalidateQueries({ queryKey: ['learning', 'detail', supplierId, s] });
      void qc.invalidateQueries({ queryKey: ['learning', 'list', supplierId] });
    },
    onError: (e) => toast.error('Quiz failed', errorMessage(e)),
  });

  if (q.isLoading)
    return (
      <Screen back kicker="Training" title="Lesson">
        <SkeletonList rows={5} />
      </Screen>
    );
  if (q.isError)
    return (
      <Screen back kicker="Training" title="Lesson" onRefresh={() => q.refetch()}>
        <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
      </Screen>
    );
  if (!q.data)
    return (
      <Screen back kicker="Training" title="Lesson">
        <EmptyState icon={GraduationCap} title="Lesson not found" message="This module may have been removed." />
      </Screen>
    );

  const lesson = q.data;
  const quizQs = lesson.quiz ?? [];

  return (
    <Screen
      back
      onRefresh={() => q.refetch()}
      kicker="Training"
      title={lesson.title}
      subtitle={lesson.track ?? undefined}
      footer={
        quizQs.length === 0 ? (
          <Button title={lesson.completed ? 'Completed' : complete.isPending ? 'Saving…' : 'Mark complete'} icon={CheckCircle2} full loading={complete.isPending} disabled={!!lesson.completed} onPress={() => complete.mutate()} />
        ) : (
          <Button
            title={quiz.isPending ? 'Submitting…' : 'Submit quiz'}
            full
            loading={quiz.isPending}
            onPress={() => quiz.mutate(quizQs.map((qq) => ({ questionId: qq.id, optionId: answers[qq.id] ?? '' })))}
          />
        )
      }
    >
      {lesson.body || lesson.content ? (
        <Card kind="flat" padding={20}>
          <Text variant="bodyLg" color="ink2">
            {lesson.body ?? lesson.content ?? ''}
          </Text>
        </Card>
      ) : null}
      {quizQs.map((qq, i) => (
        <Card key={qq.id} kind="flat" padding={18} style={{ gap: 14 }}>
          <View style={{ flexDirection: 'row', gap: 12, alignItems: 'flex-start' }}>
            <IconTile icon={CircleHelp} tone="ink" size={36} />
            <View style={{ flex: 1, gap: 3 }}>
              <Kicker>{`Question ${i + 1} of ${quizQs.length}`}</Kicker>
              <Text variant="h3">{qq.question}</Text>
            </View>
          </View>
          <RadioCards value={answers[qq.id] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [qq.id]: v }))} options={qq.options.map((o) => ({ value: o.id, label: o.label }))} />
        </Card>
      ))}
    </Screen>
  );
}
