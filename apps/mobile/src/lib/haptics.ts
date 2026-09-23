import { Platform } from 'react-native';
import * as Haptics from 'expo-haptics';

const on = Platform.OS === 'ios' || Platform.OS === 'android';

export const haptic = {
  tap: () => on && Haptics.selectionAsync().catch(() => {}),
  light: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {}),
  medium: () => on && Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium).catch(() => {}),
  success: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {}),
  warning: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {}),
  error: () => on && Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {}),
};
