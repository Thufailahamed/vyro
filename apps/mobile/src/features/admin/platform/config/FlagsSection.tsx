import { useMemo, useState } from 'react';
import { View } from 'react-native';
import { Braces, Flag, Plus, Sparkles, ToggleRight, Trash2 } from 'lucide-react-native';
import { colors, fonts } from '@/theme/tokens';
import { errorMessage } from '@/lib/api';
import { usePermission } from '@/features/admin/common/permissions';
import { Appear, Can, InlineEmpty } from '@/features/admin/platform/kit';
import {
  Badge,
  Banner,
  Button,
  Card,
  ConfirmSheet,
  ErrorState,
  Field,
  Input,
  LinkText,
  ProgressBar,
  Pulse,
  SearchBar,
  Segmented,
  Sheet,
  SkeletonList,
  Stepper,
  Switch,
  Text,
  ToggleRow,
  useToast,
} from '@/ui';
import { isStaleWrite, useFeatureFlags, useUpdateFeatureFlags } from './hooks';
import { ChangeList, CodeInput, DraftBar, SectionIntro } from './parts';
import { DEFAULT_FEATURE_FLAGS, normalizeKey, parseFlags, serializeFlags, type FeatureFlagItem } from './types';

type Mode = 'visual' | 'json';

function diffFlags(before: FeatureFlagItem[], after: FeatureFlagItem[]): string[] {
  const out: string[] = [];
  const b = new Map(before.map((f) => [f.key, f]));
  const a = new Map(after.map((f) => [f.key, f]));
  after.forEach((f) => {
    const prev = b.get(f.key);
    if (!prev) {
      out.push(`+ ${f.key} (${f.enabled ? 'on' : 'off'}, ${f.rollout}%)`);
      return;
    }
    if (prev.enabled !== f.enabled) out.push(`${f.key}: ${prev.enabled ? 'on' : 'off'} → ${f.enabled ? 'on' : 'off'}`);
    if (prev.rollout !== f.rollout) out.push(`${f.key}: rollout ${prev.rollout}% → ${f.rollout}%`);
    if (prev.notes !== f.notes) out.push(`${f.key}: notes edited`);
  });
  before.forEach((f) => {
    if (!a.has(f.key)) out.push(`− ${f.key} removed`);
  });
  return out;
}

export function FlagsSection() {
  const canWrite = usePermission('feature_flag:write');
  const toast = useToast();
  const q = useFeatureFlags();
  const update = useUpdateFeatureFlags();

  const baseline = useMemo(() => parseFlags(q.data?.value), [q.data]);
  const [draft, setDraft] = useState<FeatureFlagItem[] | null>(null);
  const items = draft ?? baseline;
  const changes = useMemo(() => (draft ? diffFlags(baseline, draft) : []), [baseline, draft]);

  const [mode, setMode] = useState<Mode>('visual');
  const [json, setJson] = useState<string | null>(null);
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [addOpen, setAddOpen] = useState(false);
  const [confirm, setConfirm] = useState<null | { kind: 'save' | 'json' | 'defaults'; value: Record<string, unknown>; lines: string[] }>(null);

  const jsonText = json ?? JSON.stringify(q.data?.value ?? {}, null, 2);
  const version = q.data?.version ?? 0;

  const filtered = useMemo(() => {
    const t = search.trim().toLowerCase();
    if (!t) return items;
    return items.filter((f) => f.key.toLowerCase().includes(t) || f.notes.toLowerCase().includes(t));
  }, [items, search]);

  const edit = (key: string, patch: Partial<FeatureFlagItem>) => setDraft(items.map((f) => (f.key === key ? { ...f, ...patch } : f)));

  const switchMode = (next: Mode) => {
    if (next === mode) return;
    if (next === 'json') {
      setJson(draft ? JSON.stringify(serializeFlags(draft), null, 2) : null);
      setJsonError(null);
      setMode('json');
      return;
    }
    if (json !== null) {
      try {
        const parsed = JSON.parse(json);
        if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('shape');
        const next = parseFlags(parsed as Record<string, unknown>);
        setDraft(diffFlags(baseline, next).length ? next : null);
      } catch {
        setJsonError('Fix the JSON before switching back to cards.');
        return;
      }
    }
    setJson(null);
    setJsonError(null);
    setMode('visual');
  };

  const openSave = () => {
    if (mode === 'visual') {
      if (!draft) return;
      setConfirm({ kind: 'save', value: serializeFlags(draft), lines: changes });
      return;
    }
    try {
      const parsed = JSON.parse(jsonText);
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) {
        setJsonError('Feature flags must be a valid JSON object');
        return;
      }
      setJsonError(null);
      setConfirm({ kind: 'json', value: parsed as Record<string, unknown>, lines: diffFlags(baseline, parseFlags(parsed as Record<string, unknown>)) });
    } catch {
      setJsonError('Invalid JSON syntax. Please verify commas and quotes.');
    }
  };

  const commit = () => {
    if (!confirm) return;
    update.mutate(
      { value: confirm.value, expectedVersion: version },
      {
        onSuccess: (res) => {
          toast.success('Feature flags saved', `Now at v${res?.version ?? version + 1}`);
          setConfirm(null);
          setDraft(null);
          setJson(null);
        },
        onError: (e) => {
          setConfirm(null);
          if (isStaleWrite(e)) toast.error('Someone saved first', 'Flags were reloaded — review and apply your change again.');
          else toast.error('Could not save flags', errorMessage(e));
        },
      },
    );
  };

  if (q.isLoading) return <SkeletonList rows={4} height={130} />;
  if (q.isError) return <ErrorState message={errorMessage(q.error)} onRetry={() => q.refetch()} />;

  const liveCount = items.filter((f) => f.enabled).length;

  return (
    <View style={{ gap: 14 }}>
      <Appear i={0}>
        <SectionIntro
          icon={Flag}
          title="Feature flags"
          text={`v${version} · ${liveCount}/${items.length} live · optimistic-lock protected`}
          right={
            canWrite && mode === 'visual' ? (
              <Button title="New" icon={Plus} size="sm" variant="secondary" onPress={() => setAddOpen(true)} />
            ) : null
          }
        />
      </Appear>

      <Appear i={1}>
        <Segmented
          value={mode}
          onChange={switchMode}
          options={[
            { value: 'visual', label: 'Cards' },
            { value: 'json', label: 'Raw JSON' },
          ]}
        />
      </Appear>

      {canWrite && ((mode === 'visual' && draft) || (mode === 'json' && json !== null)) ? (
        <Appear i={2}>
          <DraftBar
            count={mode === 'visual' ? changes.length : 1}
            label={mode === 'json' ? 'JSON edited — not yet saved' : undefined}
            onSave={openSave}
            saving={update.isPending}
            onDiscard={() => {
              setDraft(null);
              setJson(null);
              setJsonError(null);
            }}
          />
        </Appear>
      ) : null}

      {jsonError ? <Banner tone="danger" title="JSON problem" message={jsonError} /> : null}

      {mode === 'visual' ? (
        items.length === 0 ? (
          <Appear i={2}>
            <Card kind="bone" style={{ gap: 14 }}>
              <InlineEmpty
                icon={ToggleRight}
                title="No feature flags defined"
                message="The configuration is an empty {}. Seed the standard VYRO flags or create a custom one."
              />
              <Can perm="feature_flag:write">
                <View style={{ gap: 8 }}>
                  <Button
                    title="Initialize standard flags"
                    icon={Sparkles}
                    full
                    onPress={() =>
                      setConfirm({
                        kind: 'defaults',
                        value: DEFAULT_FEATURE_FLAGS,
                        lines: Object.entries(DEFAULT_FEATURE_FLAGS).map(([k, v]) => `+ ${k} (${v.enabled ? 'on' : 'off'}, ${v.rollout}%)`),
                      })
                    }
                  />
                  <Button title="Create custom flag" variant="secondary" full onPress={() => setAddOpen(true)} />
                </View>
              </Can>
            </Card>
          </Appear>
        ) : (
          <>
            <SearchBar value={search} onChangeText={setSearch} placeholder="Search flags or notes" />
            {filtered.length === 0 ? <InlineEmpty title="No flags match" message={`Nothing matches “${search}”.`} /> : null}
            {filtered.map((f, i) => (
              <Appear key={f.key} i={i + 2}>
                <FlagCard flag={f} canWrite={canWrite} onChange={(p) => edit(f.key, p)} onDelete={() => setDraft(items.filter((x) => x.key !== f.key))} />
              </Appear>
            ))}
          </>
        )
      ) : (
        <Appear i={2}>
          <Card kind="flat" style={{ gap: 12 }}>
            <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Braces size={15} color={colors.copper} />
                <Text variant="overline" color="ink4">
                  Direct editor · v{version}
                </Text>
              </View>
              <LinkText
                title="Format"
                onPress={() => {
                  try {
                    setJson(JSON.stringify(JSON.parse(jsonText), null, 2));
                    setJsonError(null);
                  } catch {
                    setJsonError('Invalid JSON syntax');
                  }
                }}
              />
            </View>
            <CodeInput value={jsonText} onChangeText={(v) => setJson(v)} editable={canWrite} minHeight={340} invalid={!!jsonError} />
          </Card>
        </Appear>
      )}

      <AddFlagSheet
        visible={addOpen}
        onClose={() => setAddOpen(false)}
        onAdd={(f) => {
          setDraft([...items.filter((x) => x.key !== f.key), f]);
          setAddOpen(false);
          toast.info('Flag staged', `${f.key} — save to publish it.`);
        }}
      />

      <ConfirmSheet
        visible={!!confirm}
        onClose={() => setConfirm(null)}
        onConfirm={commit}
        loading={update.isPending}
        variant={confirm?.lines.some((l) => l.startsWith('maintenance_mode') || l.startsWith('−')) ? 'danger' : 'primary'}
        title={confirm?.kind === 'defaults' ? 'Initialize standard flags?' : 'Publish flag changes?'}
        message={`Flags take effect platform-wide immediately. Written against v${version}; if someone saved in between, this write is rejected.`}
        confirmLabel={confirm?.kind === 'defaults' ? 'Initialize flags' : 'Publish changes'}
      >
        <ChangeList lines={confirm?.lines.length ? confirm.lines : ['No field-level differences detected — the JSON will be rewritten as-is.']} />
      </ConfirmSheet>
    </View>
  );
}

function FlagCard({
  flag,
  canWrite,
  onChange,
  onDelete,
}: {
  flag: FeatureFlagItem;
  canWrite: boolean;
  onChange: (p: Partial<FeatureFlagItem>) => void;
  onDelete: () => void;
}) {
  const danger = flag.key === 'maintenance_mode' && flag.enabled;
  return (
    <Card kind={danger ? 'copper' : 'flat'} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'flex-start', gap: 12 }}>
        <View style={{ flex: 1, gap: 6 }}>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink }} numberOfLines={1}>
              {flag.key}
            </Text>
            {flag.enabled ? (
              <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                <Pulse color={danger ? colors.rose : colors.mint} size={6} />
                <Badge label="Active" tone={danger ? 'danger' : 'success'} size="sm" />
              </View>
            ) : (
              <Badge label="Disabled" tone="neutral" size="sm" />
            )}
          </View>
          <Text variant="bodySm" color="ink4">
            {flag.notes || 'No operational documentation provided for this flag.'}
          </Text>
        </View>
        <Switch value={flag.enabled} disabled={!canWrite} onValueChange={(v) => onChange({ enabled: v })} />
      </View>

      <View style={{ gap: 8, paddingTop: 10, borderTopWidth: 1, borderTopColor: colors.lineSoft }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
          <Text variant="overline" color="ink4">
            Rollout cohort
          </Text>
          <Text style={{ fontFamily: fonts.monoMedium, fontSize: 14, color: colors.ink }}>{flag.rollout}%</Text>
        </View>
        <ProgressBar value={flag.enabled ? flag.rollout : 0} tone={flag.enabled ? 'volt' : 'ink'} />
        {canWrite ? (
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: 10, opacity: flag.enabled ? 1 : 0.4 }}>
            <View style={{ flexDirection: 'row', gap: 6 }}>
              {[0, 25, 50, 100].map((p) => (
                <Button
                  key={p}
                  title={`${p}`}
                  size="sm"
                  variant={flag.rollout === p ? 'primary' : 'ghost'}
                  disabled={!flag.enabled}
                  onPress={() => onChange({ rollout: p })}
                  style={{ paddingHorizontal: 10 }}
                />
              ))}
            </View>
            {flag.enabled ? <Stepper size="sm" value={flag.rollout} min={0} max={100} step={5} onChange={(v) => onChange({ rollout: v })} /> : null}
          </View>
        ) : null}
      </View>

      {canWrite ? (
        <View style={{ flexDirection: 'row', justifyContent: 'flex-end' }}>
          <Button title="Delete" icon={Trash2} size="sm" variant="ghost" onPress={onDelete} style={{ paddingHorizontal: 8 }} />
        </View>
      ) : null}
    </Card>
  );
}

function AddFlagSheet({ visible, onClose, onAdd }: { visible: boolean; onClose: () => void; onAdd: (f: FeatureFlagItem) => void }) {
  const [key, setKey] = useState('');
  const [notes, setNotes] = useState('');
  const [rollout, setRollout] = useState(100);
  const [enabled, setEnabled] = useState(true);
  const formatted = normalizeKey(key);
  const reset = () => {
    setKey('');
    setNotes('');
    setRollout(100);
    setEnabled(true);
  };
  return (
    <Sheet
      visible={visible}
      onClose={() => {
        reset();
        onClose();
      }}
      title="Create feature flag"
      subtitle="Staged locally until you publish."
      scroll
      footer={
        <Button
          title="Add flag"
          full
          size="lg"
          disabled={!key.trim()}
          onPress={() => {
            onAdd({ key: formatted, enabled, rollout, notes: notes.trim() });
            reset();
          }}
        />
      }
    >
      <View style={{ gap: 16 }}>
        <Field label="Flag key" hint={key.trim() ? `Saved as ${formatted}` : 'Lowercase letters, numbers and underscores.'} required>
          <Input value={key} onChangeText={setKey} placeholder="e.g. instant_supplier_settlement" autoCapitalize="none" autoCorrect={false} />
        </Field>
        <Field label="Operational notes">
          <Input value={notes} onChangeText={setNotes} placeholder="Explain what this flag gates…" multiline />
        </Field>
        <ToggleRow label="Enabled on publish" description={enabled ? 'Active (on)' : 'Disabled (off)'} value={enabled} onValueChange={setEnabled} />
        <Field label="Rollout %">
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' }}>
            <ProgressBar value={rollout} style={{ flex: 1, marginRight: 14 }} />
            <Stepper value={rollout} min={0} max={100} step={5} onChange={setRollout} />
          </View>
        </Field>
      </View>
    </Sheet>
  );
}
