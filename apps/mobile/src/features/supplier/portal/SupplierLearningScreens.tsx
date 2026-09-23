import { useState } from 'react';
import { router, useLocalSearchParams } from 'expo-router';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { CheckCircle2, GraduationCap } from 'lucide-react-native';
import { api, errorMessage, qs } from '@/lib/api';
import { useSupplierId } from '@/lib/auth';
import {
  Button,
  Card,
  EmptyState,
  ErrorState,
  ProgressBar,
  RadioCards,
  Screen,
  SkeletonList,
  StatusBadge,
  Text,
  useToast,
} from '@/ui';
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

  return (
    <Screen back onRefresh={() => q.refetch()} kicker="Training" title="Learning centre" subtitle="Complete required training to publish and sell.">
      {lessons.length ? <ProgressBar value={done} max={Math.max(1, lessons.length)} tone="success" /> : null}
      <Text variant="caption" color="ink4">
        {done}/{lessons.length} complete
      </Text>
      {lessons.length === 0 ? (
        <EmptyState icon={GraduationCap} title="No lessons yet" message="Training modules appear here when published." />
      ) : (
        lessons.map((l) => (
          <Card key={l.slug} kind="flat" onPress={() => router.push(`/supplier/learning/${l.slug}` as never)} style={{ gap: 6 }}>
            <StatusBadge status={l.completed ? 'completed' : l.required ? 'required' : 'optional'} size="sm" />
            <Text variant="h3">{l.title}</Text>
            <Text variant="caption" color="ink4">
              {l.track ?? 'General'}
              {l.durationMinutes ? ` · ${l.durationMinutes} min` : ''}
            </Text>
          </Card>
        ))
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
      {lesson.body || lesson.content ? <Card kind="flat"><Text variant="body">{lesson.body ?? lesson.content ?? ''}</Text></Card> : null}
      {quizQs.map((qq) => (
        <Card key={qq.id} kind="flat" style={{ gap: 10 }}>
          <Text variant="h3">{qq.question}</Text>
          <RadioCards value={answers[qq.id] ?? null} onChange={(v) => setAnswers((a) => ({ ...a, [qq.id]: v }))} options={qq.options.map((o) => ({ value: o.id, label: o.label }))} />
        </Card>
      ))}
    </Screen>
  );
}
