import type { ReactNode } from 'react';
import { Button } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';

export interface ProfileSettingsSectionProps {
  title: string;
  sub?: string;
  saving: boolean;
  dirty: boolean;
  onSave: () => void;
  children: ReactNode;
}

export function ProfileSettingsSection({
  title,
  sub,
  saving,
  dirty,
  onSave,
  children,
}: ProfileSettingsSectionProps) {
  return (
    <Surface kind="elevated" className="p-6 sm:p-8 space-y-6">
      <header className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-5 border-b border-ink/10">
        <div>
          <div className="flex items-center gap-3">
            <h2 className="font-display text-2xl text-ink font-semibold">{title}</h2>
            {dirty && (
              <span className="px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-volt text-ink border border-ink/20">
                Unsaved Changes
              </span>
            )}
          </div>
          {sub && <p className="text-sm text-ink-3 mt-1">{sub}</p>}
        </div>
        <div className="flex items-center gap-3 self-end sm:self-auto">
          {!dirty && !saving && (
            <span className="text-xs text-ink-4 hidden sm:inline-block">No unsaved changes</span>
          )}
          <Button
            variant="primary"
            size="sm"
            onClick={onSave}
            disabled={!dirty || saving}
            className="font-bold uppercase tracking-wider text-xs px-5"
          >
            {saving ? 'Saving…' : 'Save Changes'}
          </Button>
        </div>
      </header>
      <div className="space-y-6">{children}</div>
    </Surface>
  );
}
