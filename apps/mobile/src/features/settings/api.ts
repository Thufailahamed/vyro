import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/lib/auth';

/** Shapes mirror apps/api/src/modules/settings/routes.ts (and the web's profile forms). */
export interface ProfileSettings {
  displayName: string | null;
  avatarUrl: string | null;
  phone: string | null;
}

export interface SecuritySettings {
  twoFactorEnabled: boolean;
  sessionTimeoutMin: number;
}

export interface NotificationSettings {
  notifyOrderUpdates: boolean;
  notifyMessages: boolean;
  notifyMarketing: boolean;
  /** PDPA marketing consent, stored on users.marketing_opt_in. */
  marketingOptIn?: boolean;
}

export interface EnrollResponse {
  totpURI?: string;
  secret?: string;
  backupCodes?: string[];
}

export type PrefKind = 'preferred_supplier' | 'frequently_ordered' | 'procurement_default';

export interface PrefRow {
  id: string;
  kind: PrefKind;
  key: string;
  valueJson: string;
  source: 'user' | 'inferred';
  confidence: number;
  occurrences: number;
}

/** Same query keys as the web so cache invalidation lines up. */
export const settingsKeys = {
  profile: ['profile-settings'] as const,
  security: ['profile-security'] as const,
  notifications: ['profile-notifications'] as const,
  aiPrefs: ['ai-prefs'] as const,
};

export function useProfileSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: settingsKeys.profile,
    queryFn: () => api.get<{ settings: ProfileSettings }>('/settings/me'),
    enabled: !!user,
  });
}

export function useSecuritySettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: settingsKeys.security,
    queryFn: () => api.get<SecuritySettings>('/settings/me/security'),
    enabled: !!user,
  });
}

export function useNotificationSettings() {
  const { user } = useAuth();
  return useQuery({
    queryKey: settingsKeys.notifications,
    queryFn: () => api.get<NotificationSettings>('/settings/me/notifications'),
    enabled: !!user,
  });
}

/** Unread badge count; lives under the web's `notifications-me` key family. */
export function useUnreadCount() {
  const { user } = useAuth();
  return useQuery({
    queryKey: ['notifications-me', 'unread-count'],
    queryFn: () => api.get<{ unreadCount: number }>('/notifications/me/unread-count'),
    enabled: !!user,
    refetchInterval: 30_000,
  });
}

export const TIMEOUT_OPTIONS: { value: number; label: string; description: string }[] = [
  { value: 15, label: '15 minutes', description: 'Strict banking standard' },
  { value: 30, label: '30 minutes', description: 'Recommended' },
  { value: 60, label: '1 hour', description: 'Default' },
  { value: 240, label: '4 hours', description: 'Long shifts' },
  { value: 1440, label: '24 hours', description: 'Full business day' },
];

export function timeoutLabel(min: number | undefined): string {
  return TIMEOUT_OPTIONS.find((o) => o.value === min)?.label ?? (min ? `${min} min` : '—');
}
