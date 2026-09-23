import { useState, type ReactNode, type ReactElement } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  RefreshControl,
  ScrollView,
  View,
  type FlatListProps,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { StatusBar } from 'expo-status-bar';
import { router } from 'expo-router';
import { ArrowLeft } from 'lucide-react-native';
import { colors, GUTTER } from '@/theme/tokens';
import { Text, Kicker } from './Text';
import { IconButton } from './Button';

/** Height reserved at the bottom of tab screens so content clears the floating tab bar. */
export const TAB_BAR_SPACE = 104;

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

/** Editorial header: back chip, overline kicker, Syne title, actions. */
export function ScreenHeader({ title, kicker, subtitle, back, right, dark, large = true }: ScreenHeaderProps) {
  const onBack = typeof back === 'function' ? back : () => (router.canGoBack() ? router.back() : router.replace('/'));
  return (
    <View style={{ paddingHorizontal: GUTTER, paddingTop: 6, paddingBottom: large ? 14 : 8, gap: 14 }}>
      {back || right ? (
        <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
          {back ? <IconButton icon={ArrowLeft} accessibilityLabel="Go back" onPress={onBack} variant={dark ? 'glass' : 'surface'} /> : <View />}
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

/**
 * The shell every screen renders in: bone background (or ink for dark),
 * safe areas, editorial header, pull-to-refresh and optional sticky footer.
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
  const [refreshing, setRefreshing] = useState(false);
  const bg = dark ? colors.ink : colors.bone;
  const bottom = (tabBar ? TAB_BAR_SPACE : 24) + (footer ? 0 : insets.bottom);

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

  const head =
    header ?? (headerProps.title || headerProps.kicker || headerProps.back || headerProps.right ? <ScreenHeader dark={dark} {...headerProps} /> : null);

  const body = scroll ? (
    <ScrollView
      style={{ flex: 1 }}
      contentContainerStyle={[{ paddingHorizontal: padded ? GUTTER : 0, paddingBottom: bottom, gap }, contentStyle]}
      keyboardShouldPersistTaps="handled"
      showsVerticalScrollIndicator={false}
      refreshControl={refresh ? <RefreshControl refreshing={refreshing} onRefresh={refresh} tintColor={dark ? colors.volt : colors.ink} colors={[colors.ink]} /> : undefined}
    >
      {head ? <View style={{ marginHorizontal: padded ? -GUTTER : 0 }}>{head}</View> : null}
      {children}
    </ScrollView>
  ) : (
    <View style={[{ flex: 1 }, contentStyle]}>
      {head}
      {children}
    </View>
  );

  const content = (
    <View style={{ flex: 1, backgroundColor: bg, paddingTop: insets.top }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      {body}
      {footer ? (
        <View
          style={{
            paddingHorizontal: GUTTER,
            paddingTop: 12,
            paddingBottom: Math.max(insets.bottom, 14) + (tabBar ? TAB_BAR_SPACE - 20 : 0),
            backgroundColor: dark ? colors.ink : colors.bone,
            borderTopWidth: 1,
            borderTopColor: dark ? colors.paperLine : colors.lineSoft,
            gap: 10,
          }}
        >
          {footer}
        </View>
      ) : null}
    </View>
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
 * FlatList pre-wired with pull-to-refresh, gutters, header and tab-bar padding.
 * Use for long lists (orders, products, users…).
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
  const [refreshing, setRefreshing] = useState(false);
  return (
    <View style={{ flex: 1, backgroundColor: dark ? colors.ink : colors.bone, paddingTop: insets.top }}>
      <StatusBar style={dark ? 'light' : 'dark'} />
      <FlatList
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
        ListHeaderComponent={header}
        contentContainerStyle={{ paddingHorizontal: GUTTER, paddingBottom: (tabBar ? TAB_BAR_SPACE : 24) + insets.bottom, gap: 10 }}
        refreshControl={
          onRefresh ? (
            <RefreshControl
              refreshing={refreshing}
              tintColor={dark ? colors.volt : colors.ink}
              onRefresh={async () => {
                setRefreshing(true);
                try {
                  await onRefresh();
                } finally {
                  setRefreshing(false);
                }
              }}
            />
          ) : undefined
        }
        {...list}
      />
    </View>
  );
}

/** Wraps a header block in a FlatList header so it bleeds to the gutters. */
export function ListHeader({ children }: { children: ReactNode }) {
  return <View style={{ marginHorizontal: -GUTTER, gap: 14, paddingBottom: 6 }}>{children}</View>;
}

/** Padded block used inside ListHeader. */
export function Gutter({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  return <View style={[{ paddingHorizontal: GUTTER }, style]}>{children}</View>;
}
