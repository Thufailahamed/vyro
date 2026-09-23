import { type ReactNode } from 'react';
import { KeyboardAvoidingView, Platform, ScrollView, View } from 'react-native';
import { router } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import Animated, { FadeInDown, FadeInUp } from 'react-native-reanimated';
import { ArrowLeft } from 'lucide-react-native';
import { FlowField, IconButton, Kicker, Text, Wordmark } from '@/ui';
import { colors, GUTTER, radii } from '@/theme/tokens';

/**
 * Ink hero on top, bone form sheet sliding up underneath — the mobile take on
 * the web's split login layout.
 */
export function AuthLayout({
  kicker,
  title,
  subtitle,
  children,
  footer,
  back = true,
}: {
  kicker: string;
  title: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  back?: boolean;
}) {
  const insets = useSafeAreaInsets();
  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colors.ink }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <StatusBar style="light" />
      <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ flexGrow: 1 }} bounces={false}>
        <View style={{ paddingTop: insets.top + 8, paddingHorizontal: GUTTER, paddingBottom: 40, minHeight: 250 }}>
          <FlowField seed={title} />
          <View style={{ flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', height: 44 }}>
            {back ? (
              <IconButton
                icon={ArrowLeft}
                variant="glass"
                accessibilityLabel="Go back"
                onPress={() => (router.canGoBack() ? router.back() : router.replace('/welcome'))}
              />
            ) : (
              <View />
            )}
            <Wordmark tone="paper" size={17} />
          </View>
          <Animated.View entering={FadeInDown.duration(500)} style={{ marginTop: 36, gap: 10 }}>
            <Kicker color="volt">{kicker}</Kicker>
            <Text variant="displayLg" color="paper">
              {title}
            </Text>
            {subtitle ? (
              <Text variant="body" color="paperMuted">
                {subtitle}
              </Text>
            ) : null}
          </Animated.View>
        </View>
        <Animated.View
          entering={FadeInUp.delay(120).duration(520)}
          style={{
            flex: 1,
            backgroundColor: colors.bone,
            borderTopLeftRadius: radii['3xl'],
            borderTopRightRadius: radii['3xl'],
            paddingHorizontal: GUTTER,
            paddingTop: 28,
            paddingBottom: insets.bottom + 24,
            gap: 18,
          }}
        >
          {children}
          {footer ? <View style={{ marginTop: 'auto', paddingTop: 12 }}>{footer}</View> : null}
        </Animated.View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}
