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
    <Surface kind="elevated" className="p-6 space-y-4">
      <header className="flex items-end justify-between gap-4">
        <div>
          <h2 className="vyro-display text-lg">{title}</h2>
          {sub && <p className="text-xs text-ink-4 mt-1">{sub}</p>}
        </div>
        <Button variant="primary" onClick={onSave} disabled={!dirty || saving}>
          {saving ? 'Saving…' : 'Save'}
        </Button>
      </header>
      <div className="space-y-4">{children}</div>
    </Surface>
  );
}
