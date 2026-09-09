import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { Button, ErrorBanner, Input } from '@/components/ui';
import { AdminRoleSelect } from './AdminRoleSelect';
import { INVITABLE_ROLES, type AdminRole } from '@vyro/auth';
import { useAdminRole } from './lib/permissions';
import { api } from '@/lib/api';
import { CheckCircleIcon, CopyIcon, CheckCheckIcon, ShieldCheckIcon } from '@/components/icons';
import { ROLE_META } from './lib/roles';

export function InviteAdminDialog({ onClose }: { onClose: () => void }) {
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<AdminRole>('ops');
  const [createdInvite, setCreatedInvite] = useState<{
    id: string;
    acceptUrl?: string;
    expiresAt: number;
    emailFailed?: boolean;
  } | null>(null);
  const [copied, setCopied] = useState(false);

  const actor = useAdminRole();
  const qc = useQueryClient();
  const allowed = actor ? (INVITABLE_ROLES[actor] as readonly AdminRole[]) : [];

  const mut = useMutation({
    mutationFn: async () => {
      const res = await api.post<{
        id: string;
        acceptUrl?: string;
        expiresAt: number;
        emailFailed?: boolean;
      }>('/admin/invites', { email, role });
      return res;
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['admin-invites'] });
      qc.invalidateQueries({ queryKey: ['admin-users'] });
      if (data?.acceptUrl) {
        setCreatedInvite(data);
      } else {
        onClose();
      }
    },
  });

  const errMsg = mut.error instanceof Error ? mut.error.message : null;

  const handleCopyLink = () => {
    if (!createdInvite?.acceptUrl) return;
    const fullUrl = createdInvite.acceptUrl.startsWith('http')
      ? createdInvite.acceptUrl
      : `${window.location.origin}${createdInvite.acceptUrl}`;
    navigator.clipboard.writeText(fullUrl);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (createdInvite) {
    const fullUrl = createdInvite.acceptUrl?.startsWith('http')
      ? createdInvite.acceptUrl
      : `${window.location.origin}${createdInvite.acceptUrl ?? ''}`;

    return (
      <div className="space-y-4">
        <div className="p-4 bg-mint/10 border border-mint/20 rounded-lg text-center space-y-2">
          <div className="w-10 h-10 rounded-full bg-mint/20 text-mint flex items-center justify-center mx-auto">
            <CheckCircleIcon size={22} />
          </div>
          <h3 className="font-bold text-ink text-base">Administrator Invited!</h3>
          <p className="text-xs text-ink-500">
            An invitation has been generated for <strong className="text-ink font-mono">{email}</strong> as <strong className="text-ink uppercase">{role}</strong>.
          </p>
        </div>

        {fullUrl && (
          <div className="space-y-1.5">
            <label className="block text-xs font-semibold text-ink">
              Direct Acceptance URL
            </label>
            <div className="flex gap-2">
              <input
                type="text"
                readOnly
                value={fullUrl}
                className="w-full px-2.5 py-1.5 text-xs font-mono bg-sand/20 border border-ink/20 rounded text-ink select-all"
              />
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={handleCopyLink}
                className="shrink-0 text-xs h-8 px-2.5 gap-1"
              >
                {copied ? <CheckCheckIcon size={14} className="text-mint" /> : <CopyIcon size={14} />}
                <span>{copied ? 'Copied' : 'Copy'}</span>
              </Button>
            </div>
            <p className="text-[11px] text-ink-4">
              Link is single-use and expires in 7 days.
            </p>
          </div>
        )}

        <div className="flex justify-end pt-2">
          <Button variant="primary" size="sm" onClick={onClose}>
            Done
          </Button>
        </div>
      </div>
    );
  }

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault();
        if (email && !mut.isPending) mut.mutate();
      }}
      className="space-y-4"
    >
      {errMsg ? <ErrorBanner message={errMsg} /> : null}

      <div className="space-y-1">
        <label className="block text-xs font-semibold text-ink">
          Administrator Email <span className="text-rose">*</span>
        </label>
        <Input
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          type="email"
          placeholder="colleague@company.com"
          required
          autoFocus
          disabled={mut.isPending}
        />
        <p className="text-[11px] text-ink-4">
          A secure verification invitation will be generated for this address.
        </p>
      </div>

      <div className="space-y-1">
        <label className="block text-xs font-semibold text-ink">
          Administrative Role <span className="text-rose">*</span>
        </label>
        <AdminRoleSelect
          value={role}
          onChange={setRole}
          allowedRoles={[...allowed]}
          className="w-full text-sm py-1.5"
          disabled={mut.isPending}
        />
        {ROLE_META[role] && (
          <div className="p-2.5 bg-sand/20 rounded border border-ink/10 text-xs text-ink-500 flex items-start gap-2 mt-1">
            <ShieldCheckIcon size={15} className="text-copper shrink-0 mt-0.5" />
            <div>
              <strong className="text-ink font-semibold">{ROLE_META[role].label}:</strong>{' '}
              {ROLE_META[role].description}
            </div>
          </div>
        )}
      </div>

      <div className="flex justify-end gap-2 pt-2 border-t border-ink/10">
        <Button variant="ghost" size="sm" onClick={onClose} disabled={mut.isPending}>
          Cancel
        </Button>
        <Button
          type="submit"
          variant="primary"
          size="sm"
          loading={mut.isPending}
          disabled={!email || mut.isPending}
        >
          Send Invite
        </Button>
      </div>
    </form>
  );
}
