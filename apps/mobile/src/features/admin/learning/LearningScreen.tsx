import { useState } from 'react';
import { View } from 'react-native';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { BookOpen, Eye, EyeOff, GraduationCap, Plus, Trash2 } from 'lucide-react-native';
import {
  Button,
  ConfirmSheet,
  EmptyState,
  ErrorState,
  Field,
  IconButton,
  Input,
  ListHeader,
  ListScreen,
  ScreenHeader,
  Sheet,
  SkeletonList,
  StatusBadge,
  useToast,
} from '@/ui';
import { api, errorMessage } from '@/lib/api';
import { timeAgo } from '@/lib/format';
import { colors } from '@/theme/tokens';
import { MonoTag } from '../../buyer/orders/kit';
import { RecordCard } from '@/features/admin/ops/kit';

interface Lesson {
  id: string;
  slug?: string;
  title?: string;
  summary?: string;
  category?: string;
  difficulty?: string;
  durationMin?: number;
  published?: boolean;
  updatedAt?: number;
}

/** /admin/learning — supplier academy lesson management. */
export function AdminLearningScreen() {
  const qc = useQueryClient();
  const toast = useToast();
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Lesson | null>(null);

  const q = useQuery({
    queryKey: ['admin', 'learning', 'list'],
    queryFn: () => api.get<{ lessons: Lesson[] }>('/admin/learning/lessons'),
  });
  const toggle = useMutation({
    mutationFn: (l: Lesson) => api.put(`/admin/learning/lessons/${l.id}`, { published: !l.published }),
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

  const lessons = q.data?.lessons ?? [];

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
              subtitle={`${lessons.length} lesson${lessons.length === 1 ? '' : 's'} · ${lessons.filter((l) => l.published).length} published`}
              right={<IconButton icon={Plus} variant="ink" accessibilityLabel="New lesson" onPress={() => setCreateOpen(true)} />}
            />
          </ListHeader>
        }
        ListEmptyComponent={
          q.isLoading ? (
            <SkeletonList rows={5} height={80} />
          ) : q.isError ? (
            <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />
          ) : (
            <EmptyState icon={BookOpen} title="No lessons" message="Create the first supplier academy lesson." action={{ label: 'New lesson', onPress: () => setCreateOpen(true) }} />
          )
        }
        renderItem={({ item: l }) => (
          <RecordCard
            icon={GraduationCap}
            tone={l.published ? 'volt' : 'paper'}
            title={l.title ?? l.slug ?? l.id}
            subtitle={l.summary}
            meta={l.updatedAt ? `Updated ${timeAgo(l.updatedAt)}` : null}
            status={<StatusBadge status={l.published ? 'published' : 'draft'} size="sm" label={l.published ? 'Published' : 'Draft'} />}
            chips={
              l.category || l.difficulty || l.durationMin ? (
                <>
                  {l.category ? <MonoTag label={l.category} tone="copper" /> : null}
                  {l.difficulty ? <MonoTag label={l.difficulty} tone="ink" /> : null}
                  {l.durationMin ? <MonoTag label={`${l.durationMin}m`} tone="ink" /> : null}
                </>
              ) : undefined
            }
            actions={
              <>
                <Button
                  title={l.published ? 'Unpublish' : 'Publish'}
                  icon={l.published ? EyeOff : Eye}
                  size="sm"
                  variant={l.published ? 'paper' : 'primary'}
                  loading={toggle.isPending}
                  onPress={() => toggle.mutate(l)}
                />
                <View style={{ flex: 1 }} />
                <IconButton icon={Trash2} variant="surface" size={34} color={colors.rose} accessibilityLabel="Delete lesson" onPress={() => setDeleteTarget(l)} />
              </>
            }
          />
        )}
      />
      <CreateLessonSheet visible={createOpen} onClose={() => setCreateOpen(false)} />
      <ConfirmSheet
        visible={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => deleteTarget && del.mutate(deleteTarget.id)}
        title="Delete lesson?"
        message={`"${deleteTarget?.title ?? deleteTarget?.slug}" will be removed from the academy.`}
        confirmLabel="Delete"
        variant="danger"
        loading={del.isPending}
      />
    </>
  );
}

function CreateLessonSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const qc = useQueryClient();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [slug, setSlug] = useState('');
  const [summary, setSummary] = useState('');
  const [category, setCategory] = useState('');
  const create = useMutation({
    mutationFn: () =>
      api.post('/admin/learning/lessons', {
        title: title.trim(),
        slug: slug.trim() || title.trim().toLowerCase().replace(/[^a-z0-9]+/g, '-'),
        summary: summary.trim() || undefined,
        category: category.trim() || undefined,
        published: false,
      }),
    onSuccess: () => {
      toast.success('Lesson created as draft');
      qc.invalidateQueries({ queryKey: ['admin', 'learning'] });
      onClose();
      setTitle('');
      setSlug('');
      setSummary('');
      setCategory('');
    },
    onError: (e) => toast.error('Create failed', errorMessage(e)),
  });
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title="New lesson"
      subtitle="Created as a draft — publish when content is ready."
      footer={<Button title="Create lesson" icon={GraduationCap} variant="volt" full loading={create.isPending} disabled={!title.trim()} onPress={() => create.mutate()} />}
    >
      <View style={{ gap: 14 }}>
        <Field label="Title" required>
          <Input value={title} onChangeText={setTitle} placeholder="Cold-chain handling basics" />
        </Field>
        <Field label="Slug" hint="Leave blank to auto-generate from the title.">
          <Input value={slug} onChangeText={setSlug} placeholder="cold-chain-basics" autoCapitalize="none" />
        </Field>
        <Field label="Summary">
          <Input value={summary} onChangeText={setSummary} placeholder="What this lesson covers…" multiline numberOfLines={3} style={{ minHeight: 72, textAlignVertical: 'top' }} />
        </Field>
        <Field label="Category">
          <Input value={category} onChangeText={setCategory} placeholder="Fulfilment" />
        </Field>
      </View>
    </Sheet>
  );
}
