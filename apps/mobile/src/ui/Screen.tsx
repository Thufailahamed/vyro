import { createContext, useContext, useEffect, useMemo, useRef, useState, type ReactNode, type ReactElement, type RefObject } from 'react';
import {
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  StyleSheet,
  View,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Animated, { Extrapolation, interpolate, useAnimatedScrollHandler, useAnimatedStyle, useSharedValue, type FlatListPropsWithLayout, type SharedValue } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { BlurView } from 'expo-blur';
import { router } from 'expo-router';
import { ChevronLeft } from 'lucide-react-native';
import { colors, GUTTER } from '@/theme/tokens';
import { Text, Kicker } from './Text';
import { IconButton } from './Button';

/** Height reserved at the bottom of tab screens so content clears the floating tab bar. */
export const TAB_BAR_SPACE = 108;

/** Height of the compact navigation bar that fades in on scroll. */
const NAV_H = 52;

/* ------------------------------ scroll chrome ------------------------------ */

type ChromeInfo = { title: string; back: boolean; dark: boolean } | null;

interface ChromeApi {
  setInfo: (i: ChromeInfo) => void;
  setBack: (fn: () => void) => void;
}

/** Lets a ScreenHeader (wherever it sits in the scroll content) feed the compact nav bar. */
const ChromeCtx = createContext<ChromeApi | null>(null);

function useChrome() {
  const [info, setInfo] = useState<ChromeInfo>(null);
  const backRef = useRef<(() => void) | null>(null);
  const scrollY = useSharedValue(0);
  const onScroll = useAnimatedScrollHandler((e) => {
    scrollY.value = e.contentOffset.y;
  });
  // Stable identity: ScreenHeader effects depend on it.
  const api = useMemo<ChromeApi>(
    () => ({
      setInfo,
      setBack: (fn) => {
        backRef.current = fn;
      },
    }),
    [],
  );
  return { api, backRef, info, scrollY, onScroll };
}

/**
 * Native-style compact bar: blurred canvas, centred title and back chevron.
 * Invisible at rest; fades in once the large editorial title scrolls away.
 */
function CompactBar({ info, scrollY, backRef }: { info: ChromeInfo; scrollY: SharedValue<number>; backRef: RefObject<(() => void) | null> }) {
  const bar = useAnimatedStyle(() => ({ opacity: interpolate(scrollY.value, [36, 76], [0, 1], Extrapolation.CLAMP) }));
  const title = useAnimatedStyle(() => ({
    opacity: interpolate(scrollY.value, [52, 88], [0, 1], Extrapolation.CLAMP),
    transform: [{ translateY: interpolate(scrollY.value, [52, 88], [8, 0], Extrapolation.CLAMP) }],
  }));
  if (!info) return null;
  const dark = info.dark;
  return (
    <View pointerEvents="box-none" style={{ position: 'absolute', top: 0, left: 0, right: 0, height: NAV_H, zIndex: 20 }}>
      <Animated.View pointerEvents="none" style={[StyleSheet.absoluteFill, bar]}>
        {Platform.OS === 'ios' ? (
          <BlurView intensity={60} tint={dark ? 'dark' : 'light'} style={StyleSheet.absoluteFill} />
        ) : null}
        <View style={[StyleSheet.absoluteFill, { backgroundColor: dark ? 'rgba(12,14,11,0.9)' : Platform.OS === 'ios' ? 'rgba(242,238,228,0.72)' : colors.bone }]} />
        <View style={{ position: 'absolute', left: 0, right: 0, bottom: 0, height: StyleSheet.hairlineWidth, backgroundColor: dark ? colors.paperLine : colors.line }} />
      </Animated.View>
      <View pointerEvents="box-none" style={{ flex: 1, flexDirection: 'row', alignItems: 'center', paddingHorizontal: GUTTER }}>
        {info.back ? (
          <IconButton icon={ChevronLeft} accessibilityLabel="Go back" onPress={() => backRef.current?.()} variant={dark ? 'glass' : 'surface'} />
        ) : null}
        <Animated.View pointerEvents="none" style={[{ position: 'absolute', left: 72, right: 72, alignItems: 'center' }, title]}>
          <Text variant="h3" color={dark ? 'paper' : 'ink'} numberOfLines={1} style={{ fontFamily: 'Syne_700Bold', letterSpacing: -0.3 }}>
            {info.title}
          </Text>
        </Animated.View>
      </View>
    </View>
  );
}

/* --------------------------------- header --------------------------------- */

export interface ScreenHeaderProps {
  title?: string;
  kicker?: string;
  subtitle?: string;
  back?: boolean | (() => void);
  right?: ReactNode;
  dark?: boolean;
  /** Large editorial title (default) vs compact nav bar. */
  large?: boolean;
}

/** Large-title header: back chevron, overline kicker, Syne title, actions. */
export function ScreenHeader({ title, kicker, subtitle, back, right, dark, large = true }: ScreenHeaderProps) {
  const chrome = useContext(ChromeCtx);
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));
  const hasBack = !!back;

  useEffect(() => {
    if (!chrome) return;
    chrome.setBack(onBack);
  });
  useEffect(() => {
    if (!chrome || !large) return;
    chrome.setInfo(title ? { title, back: hasBack, dark: !!dark } : null);
    return () => chrome.setInfo(null);
  }, [chrome, title, hasBack, dark, large]);

  return (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: large ? 18 : 8, gap: 16 }}>
      {back || right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          {back ? (
            chrome && large && title ? (
              // The floating compact bar owns the back button so it stays put while scrolling.
              <View style={{ width: 40, height: 40 }} />
            ) : (
              <IconButton icon={ChevronLeft} accessibilityLabel="Go back" onPress={onBack} variant={dark ? 'glass' : 'surface'} />
            )
          ) : (
            <View />
          )}
          {!large && title ? (
            <Text variant="h3" color={dark ? 'paper' : 'ink'} numberOfLines={1} style={{ flex: 1, textAlign: 'center', marginHorizontal: 8 }}>
              {title}
            </Text>
          ) : null}
          <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center' }}>{right}</View>
        </View>
      ) : null}
      {large && (title || kicker) ? (
        <View style={{ gap: 6 }}>
          {kicker ? <Kicker color={dark ? 'volt' : 'copper'}>{kicker}</Kicker> : null}
          {title ? (
            <Text variant="displayMd" color={dark ? 'paper' : 'ink'}>
              {title}
            </Text>
          ) : null}
          {subtitle ? (
            <Text variant="bodySm" color={dark ? 'paperMuted' : 'ink4'} style={{ maxWidth: 520 }}>
              {subtitle}
            </Text>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}

/* --------------------------------- screens -------------------------------- */

export interface ScreenProps extends ScreenHeaderProps {
  children?: ReactNode;
  /** Wrap children in a ScrollView (default true). Set false for FlatList screens. */
  scroll?: boolean;
  onRefresh?: () => Promise<unknown> | void;
  /** Extra bottom padding so content clears the floating tab bar. */
  tabBar?: boolean;
  padded?: boolean;
  /** Replace the default header entirely. */
  header?: ReactNode;
  /** Sticky footer (e.g. primary CTA). */
  footer?: ReactNode;
  contentStyle?: StyleProp<ViewStyle>;
  keyboard?: boolean;
  gap?: number;
}

function useRefresh(onRefresh?: () => Promise<unknown> | void) {
  const [refreshing, setRefreshing] = useState(false);
  const refresh = onRefresh
    ? async () => {
        setRefreshing(true);
        try {
          await onRefresh();
        } finally {
          setRefreshing(false);
        }
      }
    : undefined;
  return { refreshing, refresh };
}

/**
 * The shell every screen renders in: bone canvas (or ink for dark), safe
 * areas, large-title header that collapses into a blurred nav bar,
 * pull-to-refresh and an optional floating action footer.
 */
export function Screen({
  children,
  scroll = true,
  onRefresh,
  tabBar,
  padded = true,
  header,
  footer,
  dark,
  contentStyle,
  keyboard,
  gap = 16,
  ...headerProps
}: ScreenProps) {
  const insets = useSafeAreaInsets();
  const { refreshing, refresh } = useRefresh(onRefresh);
  const chrome = useChrome();
  const bg = dark ? colors.ink : colors.bone;
  const bottom = (tabBar ? TAB_BAR_SPACE : 28) + (footer ? 0 : insets.bottom);

  const head =
    header ?? (headerProps.title || headerProps.kicker || headerProps.back || headerProps.right ? <ScreenHeader dark={dark} {...headerProps} /> : null);

  const body = scroll ? (
    <Animated.ScrollView
      style={{ flex: 1 }}
      onScroll={chrome.onScroll}
      scrollEventThrottle={16}
      contentContainerStyle={[{ paddingHorizontal: padded ? GUTTER : 0, paddingBottom: bottom, gap }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={dark ? colors.volt : colors.ink} colors={[colors.ink]} /> : undefined}
    >
      {head ? <View style={{ marginHorizontal: padded ? -GUTTER : 0 }}>{head}</View> : null}
      {children}
    </Animated.ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>
      {head}
      {children}
    </View>
  );

  const content = (
    <ChromeCtx.Provider value={scroll ? chrome.api : null}>
      <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <View style={{ flex: 1 }}>
          {body}
          {scroll ? <CompactBar info={chrome.info} scrollY={chrome.scrollY} backRef={chrome.backRef} /> : null}
        </View>
        {footer ? (
          <View
            style={{
              paddingHorizontal: GUTTER,
              paddingTop: 14,
              paddingBottom: Math.max(insets.bottom, 14) + (tabBar ? TAB_BAR_SPACE - 20 : 0),
              backgroundColor: dark ? colors.ink2 : colors.paper,
              borderTopLeftRadius: 26,
              borderTopRightRadius: 26,
              borderCurve: 'continuous',
              boxShadow: dark ? '0px -8px 28px rgba(0,0,0,0.35)' : '0px -6px 26px rgba(12,14,11,0.08)',
              gap: 10,
            }}
          >
            {footer}
          </View>
        ) : null}
      </View>
    </ChromeCtx.Provider>
  );

  if (keyboard) {
    return (
      <KeyboardAvoidingView style={{ flex: 1, backgroundColor: bg }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        {content}
      </KeyboardAvoidingView>
    );
  }
  return content;
}

/**
 * FlatList pre-wired with pull-to-refresh, gutters, collapsing header and
 * tab-bar padding. Use for long lists (orders, products, users…).
 */
export function ListScreen<T>({
  header,
  onRefresh,
  tabBar,
  dark,
  ...list
}: Omit<FlatListProps<T>, 'ListHeaderComponent'> & {
  header?: ReactElement | null;
  onRefresh?: () => Promise<unknown> | void;
  tabBar?: boolean;
  dark?: boolean;
}) {
  const insets = useSafeAreaInsets();
  const { refreshing, refresh } = useRefresh(onRefresh);
  const chrome = useChrome();
  return (
    <ChromeCtx.Provider value={chrome.api}>
      <View style={{ flex: 1, backgroundColor: dark ? colors.ink : colors.bone, paddingTop: insets.top }}>
        <StatusBar style={dark ? 'light' : 'dark'} />
        <Animated.FlatList
          showsVerticalScrollIndicator={false}
          keyboardShouldPersistTaps="handled"
          onScroll={chrome.onScroll}
          scrollEventThrottle={16}
          ListHeaderComponent={header}
          contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: (tabBar ? TAB_BAR_SPACE : 28) + insets.bottom, gap: 12 }}
          refreshControl={refresh ? <RefreshControl refreshing={refreshing} tintColor={dark ? colors.volt : colors.ink} onRefresh={refresh} /> : undefined}
          {...(list as FlatListPropsWithLayout<T>)}
        />
        <CompactBar info={chrome.info} scrollY={chrome.scrollY} backRef={chrome.backRef} />
      </View>
    </ChromeCtx.Provider>
  );
}

/** Wraps a header block in a FlatList header so it bleeds to the gutters. */
export function ListHeader({ children }: { children: ReactNode }) {
  return <View style={{ marginHorizontal: -GUTTER, gap: 16, paddingBottom: 6 }}>{children}</View>;
}

/** Padded block used inside ListHeader. */
export function Gutter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: GUTTER }, style]}>{children}</View>;
}
