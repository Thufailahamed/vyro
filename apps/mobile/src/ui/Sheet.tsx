import { createContext, useCallback, useContext, useEffect, useRef, useState, type ReactNode } from 'react';
import { KeyboardAvoidingView, Modal, Platform, Pressable, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import Animated, { FadeIn, FadeOut, SlideInDown, SlideOutDown, SlideInUp, SlideOutUp } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { BlurView } from 'expo-blur';
import { CheckCircle2, Info, X, XCircle, type LucideIcon } from 'lucide-react-native';
import { colors, radii, shadow } from '@/theme/tokens';
import { haptic } from '@/lib/haptics';
import { Text } from './Text';
import { Button, IconButton, type ButtonVariant } from './Button';

/**
 * Bottom sheet built on Modal + Reanimated layout animations.
 * Used for pickers, forms, filters and confirmations.
 */
export function Sheet({
  visible,
  onClose,
  title,
  subtitle,
  children,
  footer,
  scroll,
  dark,
  maxHeight = 0.88,
}: {
  visible: boolean;
  onClose: () => void;
  title?: string;
  subtitle?: string;
  children: ReactNode;
  footer?: ReactNode;
  scroll?: boolean;
  dark?: boolean;
  maxHeight?: number;
}) {
  const insets = useSafeAreaInsets();
  const { height } = useWindowDimensions();
  const bg = dark ? colors.ink : colors.bone;
  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose} statusBarTranslucent navigationBarTranslucent>
      {visible ? (
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1, justifyContent: 'flex-end' }}>
          <Animated.View entering={FadeIn.duration(200)} exiting={FadeOut.duration(180)} style={[StyleSheet.absoluteFill, { backgroundColor: 'rgba(8,9,7,0.55)' }]}>
            {Platform.OS === 'ios' ? <BlurView intensity={14} tint="dark" style={StyleSheet.absoluteFill} /> : null}
            <Pressable style={{ flex: 1 }} onPress={onClose} accessibilityLabel="Close" />
          </Animated.View>
          <Animated.View
            entering={SlideInDown.springify().damping(26).stiffness(280).mass(0.9)}
            exiting={SlideOutDown.duration(220)}
            style={[
              {
                backgroundColor: bg,
                borderTopLeftRadius: radii['3xl'],
                borderTopRightRadius: radii['3xl'],
                borderCurve: 'continuous',
                maxHeight: height * maxHeight,
                paddingBottom: Math.max(insets.bottom, 16),
              },
              shadow.lg,
            ]}
          >
            <View style={{ alignItems: 'center', paddingTop: 10 }}>
              <View style={{ width: 44, height: 5, borderRadius: 3, backgroundColor: dark ? 'rgba(250,247,240,0.2)' : 'rgba(12,14,11,0.16)' }} />
            </View>
            {title ? (
              <View style={{ flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingTop: 16, paddingBottom: 10, gap: 12 }}>
                <View style={{ flex: 1, gap: 3 }}>
                  <Text variant="h1" color={dark ? 'paper' : 'ink'}>
                    {title}
                  </Text>
                  {subtitle ? (
                    <Text variant="bodySm" color={dark ? 'paperMuted' : 'ink4'}>
                      {subtitle}
                    </Text>
                  ) : null}
                </View>
                <IconButton icon={X} accessibilityLabel="Close" onPress={onClose} variant={dark ? 'glass' : 'surface'} size={34} />
              </View>
            ) : null}
            {scroll ? (
              <ScrollView keyboardShouldPersistTaps="handled" contentContainerStyle={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 }}>
                {children}
              </ScrollView>
            ) : (
              <View style={{ paddingHorizontal: 20, paddingTop: 6, paddingBottom: 12 }}>{children}</View>
            )}
            {footer ? <View style={{ paddingHorizontal: 20, paddingTop: 8, gap: 10 }}>{footer}</View> : null}
          </Animated.View>
        </KeyboardAvoidingView>
      ) : null}
    </Modal>
  );
}

/** Yes/no confirmation sheet with an optional reason text slot. */
export function ConfirmSheet({
  visible,
  onClose,
  onConfirm,
  title,
  message,
  confirmLabel = 'Confirm',
  variant = 'primary',
  loading,
  children,
}: {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  title: string;
  message?: string;
  confirmLabel?: string;
  variant?: ButtonVariant;
  loading?: boolean;
  children?: ReactNode;
}) {
  return (
    <Sheet
      visible={visible}
      onClose={onClose}
      title={title}
      subtitle={message}
      footer={
        <>
          <Button
            title={confirmLabel}
            variant={variant}
            onPress={() => {
              if (variant === 'danger') haptic.medium();
              else haptic.tap();
              onConfirm();
            }}
            loading={loading}
            full
            size="lg"
          />
          <Button title="Cancel" variant="ghost" onPress={onClose} full />
        </>
      }
    >
      {children ?? <View />}
    </Sheet>
  );
}

/* ---------------------------------- Toasts --------------------------------- */

type ToastTone = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  title: string;
  message?: string;
  tone: ToastTone;
}

interface ToastApi {
  show: (t: { title: string; message?: string; tone?: ToastTone }) => void;
  success: (title: string, message?: string) => void;
  error: (title: string, message?: string) => void;
  info: (title: string, message?: string) => void;
}

const ToastCtx = createContext<ToastApi | null>(null);

const TOAST_ICON: Record<ToastTone, LucideIcon> = { success: CheckCircle2, error: XCircle, info: Info };

export function ToastProvider({ children }: { children: ReactNode }) {
  const insets = useSafeAreaInsets();
  const [item, setItem] = useState<ToastItem | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const seq = useRef(0);

  const show = useCallback<ToastApi['show']>(({ title, message, tone = 'info' }) => {
    if (timer.current) clearTimeout(timer.current);
    if (tone === 'success') haptic.success();
    else if (tone === 'error') haptic.error();
    seq.current += 1;
    setItem({ id: seq.current, title, message, tone });
    timer.current = setTimeout(() => setItem(null), 3200);
  }, []);

  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const api: ToastApi = {
    show,
    success: (title, message) => show({ title, message, tone: 'success' }),
    error: (title, message) => show({ title, message, tone: 'error' }),
    info: (title, message) => show({ title, message, tone: 'info' }),
  };

  const Icon = item ? TOAST_ICON[item.tone] : Info;
  const accent = item?.tone === 'error' ? colors.rose : item?.tone === 'success' ? colors.volt : colors.copper;

  return (
    <ToastCtx.Provider value={api}>
      {children}
      {item ? (
        <Animated.View
          key={item.id}
          entering={SlideInUp.springify().damping(20).stiffness(300).mass(0.8)}
          exiting={SlideOutUp.duration(240)}
          pointerEvents="box-none"
          style={{ position: 'absolute', left: 14, right: 14, top: insets.top + 8, zIndex: 1000 }}
        >
          <Pressable
            onPress={() => setItem(null)}
            style={[
              {
                flexDirection: 'row',
                alignItems: 'center',
                gap: 12,
                backgroundColor: colors.ink,
                borderRadius: radii.pill,
                paddingVertical: 12,
                paddingLeft: 12,
                paddingRight: 20,
                borderWidth: 1,
                borderColor: colors.paperLine,
              },
              shadow.lg,
            ]}
          >
            <View style={{ width: 34, height: 34, borderRadius: 17, backgroundColor: 'rgba(250,247,240,0.08)', alignItems: 'center', justifyContent: 'center' }}>
              <Icon size={19} color={accent} strokeWidth={2} />
            </View>
            <View style={{ flex: 1 }}>
              <Text variant="body" weight="semibold" color="paper" numberOfLines={1}>
                {item.title}
              </Text>
              {item.message ? (
                <Text variant="caption" color="paperMuted" numberOfLines={2}>
                  {item.message}
                </Text>
              ) : null}
            </View>
          </Pressable>
        </Animated.View>
      ) : null}
    </ToastCtx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(ToastCtx);
  if (!v) throw new Error('useToast must be used inside <ToastProvider>');
  return v;
}
