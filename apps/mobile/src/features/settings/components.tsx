import { type ReactNode } from 'react';
import { View, type StyleProp, type ViewStyle } from 'react-native';
import { Image } from 'expo-image';
import Animated, { FadeIn, FadeOut } from 'react-native-reanimated';
import { assetUrl } from '@/lib/api';
import { cookieHeader } from '@/lib/cookieJar';
import { initials } from '@/lib/format';
import { Button, Kicker, ListCard, Text } from '@/ui';
import { colors, fonts, radii } from '@/theme/tokens';

/**
 * Avatar that can load the API's session-protected `/api/settings/avatars/…`
 * images by forwarding the native cookie jar (expo-image doesn't share it).
 */
export function UserAvatar({
  uri,
  name,
  size = 56,
  ring,
  online,
}: {
  uri?: string | null;
  name?: string | null;
  size?: number;
  /** Volt ring — used on ink heroes. */
  ring?: boolean;
  online?: boolean;
}) {
  const src = assetUrl(uri);
  const needsCookie = !!src && /\/api\/settings\/avatars\//.test(src);
  const cookie = needsCookie ? cookieHeader() : undefined;
  return (
    <View style={{ width: size, height: size }}>
      <View
        style={{
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: colors.ink,
          alignItems: 'center',
          justifyContent: 'center',
          overflow: 'hidden',
          borderWidth: ring ? 2 : 0,
          borderColor: 'rgba(198,220,74,0.55)',
        }}
      >
        {src ? (
          <Image
            source={{ uri: src, headers: cookie ? { cookie } : undefined }}
            style={{ width: size, height: size }}
            contentFit="cover"
            transition={200}
          />
        ) : (
          <Text style={{ fontFamily: fonts.displayBold, fontSize: size * 0.36, color: colors.volt, letterSpacing: -0.5 }}>{initials(name)}</Text>
        )}
      </View>
      {online ? (
        <View
          style={{
            position: 'absolute',
            right: size * 0.02,
            bottom: size * 0.02,
            width: Math.max(12, size * 0.22),
            height: Math.max(12, size * 0.22),
            borderRadius: size,
            backgroundColor: colors.mint,
            borderWidth: 2.5,
            borderColor: ring ? colors.ink : colors.paper,
          }}
        />
      ) : null}
    </View>
  );
}

/** iOS-Settings style group: overline title, paper card of rows, footnote. */
export function SettingsGroup({
  title,
  footnote,
  children,
  style,
  action,
}: {
  title?: string;
  footnote?: string;
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  action?: ReactNode;
}) {
  return (
    <View style={[{ gap: 8 }, style]}>
      {title || action ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 4 }}>
          {title ? <Kicker color="ink4">{title}</Kicker> : <View />}
          {action}
        </View>
      ) : null}
      <ListCard>{children}</ListCard>
      {footnote ? (
        <Text variant="caption" color="ink4" style={{ paddingHorizontal: 4 }}>
          {footnote}
        </Text>
      ) : null}
    </View>
  );
}

/** Volt "Unsaved changes" pill — the web's ProfileSettingsSection dirty flag. */
export function DirtyPill({ dirty }: { dirty: boolean }) {
  if (!dirty) return null;
  return (
    <Animated.View
      entering={FadeIn.duration(180)}
      exiting={FadeOut.duration(140)}
      style={{ alignSelf: 'flex-start', backgroundColor: colors.volt, borderRadius: radii.pill, paddingHorizontal: 9, paddingVertical: 3 }}
    >
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 10.5, color: colors.ink, letterSpacing: 0.6 }}>UNSAVED CHANGES</Text>
    </Animated.View>
  );
}

/** Sticky save footer used by every settings form. */
export function SaveFooter({
  dirty,
  saving,
  onSave,
  label = 'Save changes',
  disabled,
}: {
  dirty: boolean;
  saving: boolean;
  onSave: () => void;
  label?: string;
  disabled?: boolean;
}) {
  return (
    <View style={{ gap: 8 }}>
      <Button title={dirty ? label : 'No unsaved changes'} size="lg" full loading={saving} disabled={!dirty || saving || disabled} onPress={onSave} />
    </View>
  );
}

/** Numbered step badge used in the 2FA enrolment flow. */
export function StepDot({ n, done }: { n: number; done?: boolean }) {
  return (
    <View
      style={{
        width: 24,
        height: 24,
        borderRadius: 12,
        backgroundColor: done ? colors.volt : colors.ink,
        alignItems: 'center',
        justifyContent: 'center',
      }}
    >
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 11.5, color: done ? colors.ink : colors.volt }}>{n}</Text>
    </View>
  );
}

/** Mono tag chip (e.g. "Critical logistics"). */
export function MonoTag({ label, tone = 'mist' }: { label: string; tone?: 'mist' | 'volt' | 'copper' | 'mint' | 'ink' }) {
  const bg =
    tone === 'volt' ? colors.voltSoft : tone === 'copper' ? colors.copperSoft : tone === 'mint' ? colors.mintSoft : tone === 'ink' ? colors.ink : colors.mist;
  const fg = tone === 'volt' ? colors.voltDeep : tone === 'copper' ? colors.copperDeep : tone === 'mint' ? colors.mint : tone === 'ink' ? colors.volt : colors.ink3;
  return (
    <View style={{ alignSelf: 'flex-start', backgroundColor: bg, borderRadius: radii.sm, paddingHorizontal: 6, paddingVertical: 2 }}>
      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9.5, letterSpacing: 0.8, color: fg }}>{label.toUpperCase()}</Text>
    </View>
  );
}
