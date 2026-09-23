import { useEffect } from 'react';
import { Platform, Pressable, View, useWindowDimensions } from 'react-native';
import { Tabs } from 'expo-router';
import type { BottomTabBarProps } from 'expo-router/build/react-navigation/bottom-tabs';
import { BlurView } from 'expo-blur';
import Animated, { useAnimatedStyle, useSharedValue, withSpring } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { LucideIcon } from 'lucide-react-native';
import { colors, fonts, shadow } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';

export interface PortalTab {
  /** Route file name inside the (tabs) folder, e.g. `index`, `orders`. */
  name: string;
  label: string;
  icon: LucideIcon;
  badge?: number;
}

const BAR_H = 66;
const SIDE = 14;

/**
 * Floating ink capsule with a volt "lens" that glides to the active tab.
 * Shared by the buyer, supplier and admin portals.
 */
function FloatingTabBar({ state, navigation, tabs }: BottomTabBarProps & { tabs: PortalTab[] }) {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const barW = Math.min(width - SIDE * 2, 520);
  const visible = state.routes.filter((r) => tabs.some((t) => t.name === r.name));
  const itemW = barW / Math.max(visible.length, 1);
  const activeName = state.routes[state.index]?.name;
  const activeIdx = Math.max(0, visible.findIndex((r) => r.name === activeName));
  const x = useSharedValue(activeIdx * itemW);

  useEffect(() => {
    x.value = withSpring(activeIdx * itemW, { damping: 20, stiffness: 220, mass: 0.8 });
  }, [activeIdx, itemW, x]);

  const lens = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View
      pointerEvents="box-none"
      style={{ position: 'absolute', left: 0, right: 0, bottom: Math.max(insets.bottom - 6, 10), alignItems: 'center' }}
    >
      <View style={[{ width: barW, height: BAR_H, borderRadius: BAR_H / 2, overflow: 'hidden', backgroundColor: Platform.OS === 'android' ? colors.ink : 'rgba(12,14,11,0.9)' }, shadow.lg]}>
        {Platform.OS === 'ios' ? <BlurView intensity={40} tint="dark" style={{ position: 'absolute', inset: 0 }} /> : null}
        <Animated.View style={[{ position: 'absolute', top: 7, left: 0, width: itemW, height: BAR_H - 14, alignItems: 'center' }, lens]}>
          <View style={{ width: itemW - 14, height: '100%', borderRadius: (BAR_H - 14) / 2, backgroundColor: 'rgba(198,220,74,0.14)', borderWidth: 1, borderColor: 'rgba(198,220,74,0.28)' }} />
        </Animated.View>
        <View style={{ flexDirection: 'row', flex: 1 }}>
          {visible.map((route) => {
            const tab = tabs.find((t) => t.name === route.name)!;
            const focused = route.name === activeName;
            const Icon = tab.icon;
            return (
              <Pressable
                key={route.key}
                accessibilityRole="tab"
                accessibilityState={{ selected: focused }}
                accessibilityLabel={tab.label}
                onPress={() => {
                  const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
                  if (!focused && !event.defaultPrevented) {
                    haptic.tap();
                    navigation.navigate(route.name, route.params);
                  }
                }}
                onLongPress={() => navigation.emit({ type: 'tabLongPress', target: route.key })}
                style={{ width: itemW, alignItems: 'center', justifyContent: 'center', gap: 3 }}
              >
                <View>
                  <Icon size={21} color={focused ? colors.volt : colors.paperMuted} strokeWidth={focused ? 2 : 1.6} />
                  {tab.badge ? (
                    <View
                      style={{
                        position: 'absolute',
                        top: -5,
                        right: -9,
                        minWidth: 16,
                        height: 16,
                        paddingHorizontal: 3,
                        borderRadius: 8,
                        backgroundColor: colors.copper,
                        alignItems: 'center',
                        justifyContent: 'center',
                        borderWidth: 1.5,
                        borderColor: colors.ink,
                      }}
                    >
                      <Text style={{ fontFamily: fonts.monoMedium, fontSize: 9, lineHeight: 11, color: colors.paper }}>{tab.badge > 99 ? '99+' : tab.badge}</Text>
                    </View>
                  ) : null}
                </View>
                <Text
                  style={{
                    fontFamily: focused ? fonts.sansSemi : fonts.sansMedium,
                    fontSize: 10.5,
                    letterSpacing: 0.2,
                    color: focused ? colors.paper : colors.paperMuted,
                  }}
                  numberOfLines={1}
                >
                  {tab.label}
                </Text>
              </Pressable>
            );
          })}
        </View>
      </View>
    </View>
  );
}

/** Drop-in `(tabs)/_layout.tsx` body for a portal. */
export function PortalTabs({ tabs }: { tabs: PortalTab[] }) {
  return (
    <Tabs
      screenOptions={{ headerShown: false, animation: 'fade', sceneStyle: { backgroundColor: colors.bone } }}
      tabBar={(props) => <FloatingTabBar {...props} tabs={tabs} />}
    >
      {tabs.map((t) => (
        <Tabs.Screen key={t.name} name={t.name} options={{ title: t.label }} />
      ))}
    </Tabs>
  );
}
