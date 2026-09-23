/** Small generic pieces shared by the platform config + security screens. */
import { useState, type ReactNode } from 'react';
import { Pressable, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Check, Copy, type LucideIcon } from 'lucide-react-native';
import { colors, fonts, radii } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Button, Card, Pulse, Text } from '@/ui';

/** Mono pill for keys, event names, ids. */
export function MonoTag({ label, tone = 'bone', dark }: { label: string; tone?: 'bone' | 'volt' | 'ink'; dark?: boolean }) {
  const bg = tone === 'volt' ? colors.volt : tone === 'ink' ? colors.ink : dark ? 'rgba(250,247,240,0.08)' : colors.pearl;
  const fg = tone === 'volt' ? colors.ink : tone === 'ink' ? colors.volt : dark ? colors.paper : colors.ink3;
  return (
    <View
      style={{
        alignSelf: 'flex-start',
        paddingHorizontal: 7,
        paddingVertical: 2.5,
        borderRadius: radii.sm,
        backgroundColor: bg,
        borderWidth: tone === 'bone' ? 1 : 0,
        borderColor: dark ? colors.paperLine : colors.lineSoft,
      }}
    >
      <Text numberOfLines={1} style={{ fontFamily: fonts.monoMedium, fontSize: 11, lineHeight: 15, color: fg }}>
        {label}
      </Text>
    </View>
  );
}

/** Tap-to-copy mono value with a transient check. */
export function CopyText({ value, display, dark }: { value: string; display?: string; dark?: boolean }) {
  const [copied, setCopied] = useState(false);
  const Icon = copied ? Check : Copy;
  return (
    <Pressable
      hitSlop={8}
      accessibilityLabel="Copy to clipboard"
      onPress={async () => {
        await Clipboard.setStringAsync(value);
        haptic.success();
        setCopied(true);
        setTimeout(() => setCopied(false), 1600);
      }}
      style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start' }}
    >
      <Text numberOfLines={1} style={{ fontFamily: fonts.monoMedium, fontSize: 12, color: dark ? colors.paper : colors.ink, flexShrink: 1 }}>
        {display ?? value}
      </Text>
      <Icon size={13} color={copied ? colors.mint : dark ? colors.paperMuted : colors.ink4} strokeWidth={2} />
    </Pressable>
  );
}

/** Monospace multiline editor for raw JSON / template bodies. */
export function CodeInput({
  value,
  onChangeText,
  editable = true,
  minHeight = 280,
  placeholder,
  invalid,
}: {
  value: string;
  onChangeText: (v: string) => void;
  editable?: boolean;
  minHeight?: number;
  placeholder?: string;
  invalid?: boolean;
}) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      value={value}
      onChangeText={onChangeText}
      editable={editable}
      multiline
      autoCapitalize="none"
      autoCorrect={false}
      spellCheck={false}
      placeholder={placeholder}
      placeholderTextColor={colors.ink5}
      selectionColor={colors.copper}
      textAlignVertical="top"
      onFocus={() => setFocused(true)}
      onBlur={() => setFocused(false)}
      style={{
        minHeight,
        fontFamily: fonts.mono,
        fontSize: 12.5,
        lineHeight: 18,
        color: colors.ink,
        backgroundColor: colors.paper,
        borderRadius: radii.xl,
        borderWidth: focused ? 1.5 : 1,
        borderColor: invalid ? colors.rose : focused ? colors.ink : colors.line,
        padding: 14,
        opacity: editable ? 1 : 0.75,
      }}
    />
  );
}

/**
 * Volt bar shown while a config section has unsaved edits.
 * The save itself opens a confirmation sheet.
 */
export function DraftBar({
  count,
  label,
  onSave,
  onDiscard,
  saving,
}: {
  count: number;
  label?: string;
  onSave: () => void;
  onDiscard: () => void;
  saving?: boolean;
}) {
  return (
    <Card kind="ink" padding={14} style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <Pulse color={colors.volt} size={7} />
        <Text variant="bodySm" weight="semibold" color="paper" style={{ flex: 1 }}>
          {label ?? `${count} unsaved change${count === 1 ? '' : 's'}`}
        </Text>
      </View>
      <View style={{ flexDirection: 'row', gap: 10 }}>
        <Button title="Discard" variant="outlinePaper" size="sm" onPress={onDiscard} style={{ flex: 1 }} />
        <Button title="Review & save" variant="volt" size="sm" onPress={onSave} loading={saving} style={{ flex: 1.4 }} />
      </View>
    </Card>
  );
}

/** Icon + title + one-line description row for section intros. */
export function SectionIntro({ icon: Icon, title, text, right }: { icon: LucideIcon; title: string; text?: string; right?: ReactNode }) {
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 12 }}>
      <View style={{ width: 40, height: 40, borderRadius: 12, backgroundColor: colors.ink, alignItems: 'center', justifyContent: 'center' }}>
        <Icon size={18} color={colors.volt} strokeWidth={1.7} />
      </View>
      <View style={{ flex: 1, gap: 2 }}>
        <Text variant="h2">{title}</Text>
        {text ? (
          <Text variant="caption" color="ink4">
            {text}
          </Text>
        ) : null}
      </View>
      {right}
    </View>
  );
}

/** A list of "before → after" lines used inside confirm sheets. */
export function ChangeList({ lines }: { lines: string[] }) {
  if (!lines.length) return null;
  const shown = lines.slice(0, 8);
  return (
    <View style={{ backgroundColor: colors.pearl, borderRadius: radii.lg, borderWidth: 1, borderColor: colors.lineSoft, padding: 12, gap: 6 }}>
      {shown.map((l, i) => (
        <Text key={i} style={{ fontFamily: fonts.mono, fontSize: 12, lineHeight: 17, color: colors.ink2 }}>
          {l}
        </Text>
      ))}
      {lines.length > shown.length ? (
        <Text variant="caption" color="ink4">
          +{lines.length - shown.length} more
        </Text>
      ) : null}
    </View>
  );
}
