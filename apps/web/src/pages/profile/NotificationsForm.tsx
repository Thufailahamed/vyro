import { useEffect, useState } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { api, ApiError } from '@/lib/api';
import { useToast } from '@vyro/ui';
import { ProfileSettingsSection } from './ProfileSettingsSection';
import { PackageIcon, BellIcon, SparklesIcon, CheckIcon } from '@/components/icons';

type Settings = {
  notifyOrderUpdates: boolean;
  notifyMessages: boolean;
  notifyMarketing: boolean;
  marketingOptIn?: boolean;
};

// notifyMarketing = email/channel preference (toggle in this form)
// marketingOptIn  = PDPA Sri Lanka opt-out flag (stored on users.marketing_opt_in,
//                   enforced by notifications dispatcher for category='marketing').
// Users who opt out via this flag still see this toggle as decorative; turning the
// toggle off here only suppresses emails — it does NOT bypass the PDPA opt-out.

const TOGGLES: Array<{
  key: keyof Settings;
  label: string;
  badge: string;
  hint: string;
  icon: typeof PackageIcon;
}> = [
  {
    key: 'notifyOrderUpdates',
    label: 'Order Lifecycle & Freight Milestones',
    badge: 'Critical Logistics',
    hint: 'Real-time notifications when your POs are accepted, staged in warehouse, en route with driver plate details, and dockside GRN signed.',
    icon: PackageIcon,
  },
  {
    key: 'notifyMessages',
    label: 'Direct Supplier Inquiries & Chat',
    badge: 'Operations',
    hint: 'Instant alert when a miller, distributor, or procurement officer messages regarding delivery schedules or order adjustments.',
    icon: BellIcon,
  },
  {
    key: 'notifyMarketing',
    label: 'Wholesale Price Index & Market Trends',
    badge: 'Market Intel',
    hint: 'Weekly Sri Lankan wholesale price intelligence, seasonal crop forecasts, new mill openings, and volume rebate announcements.',
    icon: SparklesIcon,
  },
];

export function NotificationsForm() {
  const qc = useQueryClient();
  const toast = useToast();
  const q = useQuery({
    queryKey: ['profile-notifications'],
    queryFn: () => api.get<Settings>('/settings/me/notifications'),
  });

  const initial: Settings = q.data ?? {
    notifyOrderUpdates: true,
    notifyMessages: true,
    notifyMarketing: false,
  };
  const [draft, setDraft] = useState<Settings>(initial);
  useEffect(() => {
    if (q.data) setDraft(q.data);
  }, [q.data]);

  const dirty =
    draft.notifyOrderUpdates !== initial.notifyOrderUpdates ||
    draft.notifyMessages !== initial.notifyMessages ||
    draft.notifyMarketing !== initial.notifyMarketing;

  const save = useMutation({
    mutationFn: () => api.patch('/settings/me/notifications', draft),
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ['profile-notifications'] });
      toast.success('Notification preferences saved');
    },
    onError: (e) => toast.error(e instanceof ApiError ? e.message : 'Failed to save'),
  });

  return (
    <ProfileSettingsSection
      title="Notification Signals & Alerts"
      sub="Choose which dispatch, procurement, and market events trigger immediate alerts to your registered email and inbox."
      saving={save.isPending}
      dirty={dirty}
      onSave={() => save.mutate()}
    >
      <div className="space-y-3">
        {TOGGLES.map((t) => {
          const Icon = t.icon;
          const isChecked = draft[t.key];
          return (
            <div
              key={t.key}
              onClick={() => setDraft({ ...draft, [t.key]: !isChecked })}
              className={`flex items-start gap-4 p-4 border transition-all duration-200 cursor-pointer select-none ${
                isChecked
                  ? 'border-ink bg-paper shadow-sm'
                  : 'border-ink/10 bg-paper/40 opacity-75 hover:opacity-100 hover:border-ink/20'
              }`}
            >
              <div
                className={`size-10 shrink-0 flex items-center justify-center border transition-colors ${
                  isChecked
                    ? 'bg-ink text-volt border-ink'
                    : 'bg-mist text-ink-4 border-line'
                }`}
              >
                <Icon size={18} />
              </div>

              <div className="flex-1 min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="text-sm font-semibold text-ink">{t.label}</span>
                  <span className="text-[10px] font-mono uppercase tracking-wider px-2 py-0.5 bg-mist text-ink-3 border border-line">
                    {t.badge}
                  </span>
                </div>
                <p className="text-xs text-ink-3 mt-1 leading-relaxed">{t.hint}</p>
              </div>

              {/* Styled Switch */}
              <div className="shrink-0 pt-0.5">
                <div
                  className={`w-11 h-6 flex items-center p-1 transition-colors duration-200 ${
                    isChecked ? 'bg-ink' : 'bg-ink/20'
                  }`}
                >
                  <div
                    className={`size-4 bg-paper shadow-md transform transition-transform duration-200 flex items-center justify-center ${
                      isChecked ? 'translate-x-5 bg-volt text-ink' : 'translate-x-0'
                    }`}
                  >
                    {isChecked && <CheckIcon size={10} />}
                  </div>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </ProfileSettingsSection>
  );
}
