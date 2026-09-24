import type { ReactNode } from 'react';
import { Pressable, View } from 'react-native';
import type { SharedValue } from 'react-native-reanimated';
import ReanimatedSwipeable, { type SwipeableMethods } from 'react-native-gesture-handler/ReanimatedSwipeable';
import type { LucideIcon } from 'lucide-react-native';
import { colors, radii } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';

export interface SwipeAction {
  label: string;
  icon?: LucideIcon;
  tone?: 'mint' | 'rose' | 'ink' | 'volt' | 'amber';
  run: () => void;
}

const SWIPE_TONE: Record<NonNullable<SwipeAction['tone']>, { bg: string; fg: string }> = {
  mint: { bg: colors.mint, fg: colors.ink },
  rose: { bg: colors.rose, fg: colors.paper },
  ink: { bg: colors.ink, fg: colors.volt },
  volt: { bg: colors.volt, fg: colors.ink },
  amber: { bg: colors.amber, fg: colors.ink },
};

/**
 * Swipe-to-act row — swiping reveals action pills beside the card, like the
 * web queue's inline actions. Wire `right`/`left` to `SwipeAction`s.
 */
export function SwipeableRow({
  right,
  left,
  children,
  enabled = true,
}: {
  right?: SwipeAction[];
  left?: SwipeAction[];
  children: ReactNode;
  enabled?: boolean;
}) {
  const render =
    (actions: SwipeAction[]) =>
    function SwipeActions(_progress: SharedValue<number>, _translation: SharedValue<number>, methods: SwipeableMethods) {
      return (
      <View style={{ flexDirection: 'row', alignItems: 'stretch' }}>
        {actions.map((a) => {
          const t = SWIPE_TONE[a.tone ?? 'ink'];
          return (
            <Pressable
              key={a.label}
              accessibilityRole="button"
              accessibilityLabel={a.label}
              onPress={() => {
                haptic.light();
                methods.close();
                a.run();
              }}
              style={{ width: 86, alignItems: 'center', justifyContent: 'center', gap: 5, backgroundColor: t.bg }}
            >
              {a.icon ? <a.icon size={18} color={t.fg} strokeWidth={2} /> : null}
              <Text variant="caption" weight="semibold" style={{ color: t.fg }}>
                {a.label}
              </Text>
            </Pressable>
          );
        })}
      </View>
      );
    };
  return (
    <ReanimatedSwipeable
      enabled={enabled}
      friction={1.6}
      rightThreshold={40}
      leftThreshold={40}
      overshootRight={false}
      overshootLeft={false}
      renderRightActions={right?.length ? render(right) : undefined}
      renderLeftActions={left?.length ? render(left) : undefined}
      containerStyle={{ borderRadius: radii.xl, overflow: 'hidden' }}
    >
      {children}
    </ReanimatedSwipeable>
  );
}
