import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { Button, ErrorBanner, Input, Label, SuccessBanner, Textarea } from '@/components/ui';
import { Surface } from '@/components/brand/Surface';
import { ApiError } from '@/lib/api';
import { usePageTitle } from '@/lib/usePageTitle';
import { useToast } from '@vyro/ui';
import { useSupplierId } from './useSupplierId';
import { useSellerKyc, useSubmitKyc } from './useSellerKyc';
import {
  ShieldCheckIcon,
  CheckCircle2Icon,
  AlertTriangleIcon,
  XCircleIcon,
  FileTextIcon,
  Building2Icon,
  BanknoteIcon,
  UserCheckIcon,
  ClockIcon,
  UploadCloudIcon,
  ArrowRightIcon,
  SparklesIcon,
  ChevronRightIcon,
  RefreshCwIcon,
} from '@/components/icons';
import { cn } from '@vyro/ui';

type KycStatus = 'pending' | 'approved' | 'rejected' | 'needs_more_info' | null;

const STATUS_META: Record<
  Exclude<KycStatus, null>,
  {
    label: string;
    short: string;
    hint: string;
    iconBg: string;
    iconColor: string;
    icon: React.ReactNode;
    tone: 'amber' | 'mint' | 'rose' | 'copper';
    nextStep: string;
  }
> = {
  pending: {
    label: 'Under review',
    short: 'Pending',
    hint: 'Our admin team is verifying your registration and bank details. Most reviews complete within 24–48 hours.',
    iconBg: 'bg-amber/15',
    iconColor: 'text-amber',
    icon: <ClockIcon size={20} />,
    tone: 'amber',
    nextStep: 'You can keep managing products while we review. We will email you when the review is complete.',
  },
  approved: {
    label: 'Verified supplier',
    short: 'Verified',
    hint: 'Your facility is verified. Commercial buyers see the verified badge on your listings, and escrow-funded POs are enabled.',
    iconBg: 'bg-mint/15',
    iconColor: 'text-mint',
    icon: <CheckCircle2Icon size={20} />,
    tone: 'mint',
    nextStep: 'No further action needed. Keep your bank details up to date in Facility Settings to avoid payout delays.',
  },
  rejected: {
    label: 'Verification rejected',
    short: 'Rejected',
    hint: 'The admin reviewer flagged an issue with your submission. Update the fields below and resubmit.',
    iconBg: 'bg-rose/15',
    iconColor: 'text-rose',
    icon: <XCircleIcon size={20} />,
    tone: 'rose',
    nextStep: 'Address the reviewer notes and resubmit the form. Your existing draft will be cleared on resubmit.',
  },
  needs_more_info: {
    label: 'More information needed',
    short: 'Action required',
    hint: 'Our admin team requested additional information. Update the requested fields and resubmit.',
    iconBg: 'bg-copper/15',
    iconColor: 'text-copper-deep',
    icon: <AlertTriangleIcon size={20} />,
    tone: 'copper',
    nextStep: 'Update the fields the reviewer flagged below, then resubmit.',
  },
};

const STEPS = [
  { key: 'docs', label: 'Business registration', icon: Building2Icon },
  { key: 'tax', label: 'Tax & compliance', icon: FileTextIcon },
  { key: 'bank', label: 'Settlement bank', icon: BanknoteIcon },
  { key: 'review', label: 'Admin review', icon: UserCheckIcon },
];

export function SupplierVerificationPage() {
  usePageTitle('Supplier Verification');
  const { supplierId, supplierName } = useSupplierId();
  const { data, isLoading } = useSellerKyc();
  const submit = useSubmitKyc();
  const toast = useToast();

  const [form, setForm] = useState({
    registrationNo: '',
    taxId: '',
    bankName: '',
    bankAccountNo: '',
    bankBranch: '',
    bankAccountHolder: '',
    notes: '',
  });
  const [err, setErr] = useState('');
  const [showSuccess, setShowSuccess] = useState(false);

  const kyc = data?.kyc ?? null;
  const status: KycStatus = (kyc?.status as KycStatus) ?? null;
  const canSubmit = status === null || status === 'rejected' || status === 'needs_more_info';
  const meta = status ? STATUS_META[status] : null;

  // Compute step completion (visual only — drives the stepper)
  const stepState = useMemo(() => {
    const hasReg = form.registrationNo.trim().length >= 4;
    const hasBank = !!form.bankName.trim() && !!form.bankAccountNo.trim() && !!form.bankAccountHolder.trim();
    return {
      docs: hasReg,
      tax: true, // tax is optional, but treat as "ok" if either doc fields are filled
      bank: hasBank,
      review: status === 'approved',
    };
  }, [form, status]);

  // When kyc is loaded and rejected/needs_more_info, prefill from server if available
  useEffect(() => {
    if (!kyc?.documentsJson) return;
    try {
      const parsed = JSON.parse(kyc.documentsJson);
      setForm((f) => ({
        ...f,
        registrationNo: parsed.registrationNo ?? f.registrationNo,
        taxId: parsed.taxId ?? f.taxId,
        bankName: parsed.bankName ?? f.bankName,
        bankAccountNo: parsed.bankAccountNo ?? f.bankAccountNo,
        bankBranch: parsed.bankBranch ?? f.bankBranch,
        bankAccountHolder: parsed.bankAccountHolder ?? f.bankAccountHolder,
      }));
    } catch {
      // documentsJson shape is unknown — leave as-is
    }
  }, [kyc?.documentsJson]);

  // If success was just shown, auto-hide after a moment
  useEffect(() => {
    if (!showSuccess) return;
    const t = setTimeout(() => setShowSuccess(false), 6000);
    return () => clearTimeout(t);
  }, [showSuccess]);

  async function onSubmit() {
    setErr('');
    try {
      await submit.mutateAsync({ supplierId, ...form });
      setShowSuccess(true);
      toast.show(
        toast.success(
          status === 'rejected' || status === 'needs_more_info'
            ? 'Verification resubmitted for review'
            : 'Verification submitted for review',
        ),
      );
    } catch (e) {
      setErr(e instanceof ApiError ? e.message : 'Submission failed. Please try again.');
    }
  }

  const field = (
    key: keyof typeof form,
    label: string,
    placeholder: string,
    options?: { optional?: boolean; mono?: boolean; icon?: React.ReactNode; helper?: string },
  ) => (
    <div className="space-y-1.5">
      <Label htmlFor={`kyc-${key}`} className="flex items-center gap-1.5">
        {options?.icon}
        <span>{label}</span>
        {options?.optional && (
          <span className="ml-1 font-mono text-[10px] uppercase tracking-wider text-ink-4 font-normal">
            optional
          </span>
        )}
      </Label>
      <Input
        id={`kyc-${key}`}
        value={form[key]}
        onChange={(e) => setForm({ ...form, [key]: e.target.value })}
        placeholder={placeholder}
        className={cn('bg-paper', options?.mono && 'font-mono')}
        autoComplete="off"
        spellCheck={false}
      />
      {options?.helper && <p className="text-[11px] text-ink-4">{options.helper}</p>}
    </div>
  );

  return (
    <div className="max-w-6xl mx-auto space-y-8 pb-12">
      {/* Top breadcrumb / stepper */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-ink/10 pb-4">
        <Link
          to="/supplier"
          className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1 transition-colors"
        >
          ← Back to Dashboard
        </Link>
        <div className="w-full sm:w-[28rem]">
          <Stepper steps={STEPS} stateMap={stepState} status={status} />
        </div>
      </div>

      {/* Header banner */}
      <div className="flex flex-col md:flex-row md:items-end justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 mb-2">
            {meta ? (
              <span
                className={cn(
                  'inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider border',
                  meta.tone === 'amber' && 'bg-amber/15 text-amber border-amber/30',
                  meta.tone === 'mint' && 'bg-mint/15 text-mint border-mint/30',
                  meta.tone === 'rose' && 'bg-rose/15 text-rose border-rose/30',
                  meta.tone === 'copper' && 'bg-copper/15 text-copper-deep border-copper/30',
                )}
              >
                <span
                  className={cn(
                    'size-1.5 rounded-full animate-pulse',
                    meta.tone === 'amber' && 'bg-amber',
                    meta.tone === 'mint' && 'bg-mint',
                    meta.tone === 'rose' && 'bg-rose',
                    meta.tone === 'copper' && 'bg-copper',
                  )}
                />
                {meta.label}
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-bold uppercase tracking-wider bg-copper/15 text-copper-deep border border-copper/30">
                <span className="size-1.5 rounded-full bg-copper animate-pulse" />
                Verification required
              </span>
            )}
            <span className="vyro-kicker text-copper">Supplier Verification</span>
          </div>
          <h1 className="vyro-display text-4xl sm:text-5xl text-balance text-ink">
            {supplierName || 'Wholesale Supplier Facility'}
          </h1>
          <p className="mt-3 text-body-lg text-ink-3 max-w-2xl">
            Submit your business registration and payout details once. Admin approval verifies your
            supplier account and unlocks escrow-funded purchase orders.
          </p>
        </div>
      </div>

      {/* Two-column layout: form on left, status/help on right */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
        {/* LEFT — Form sections */}
        <div className="lg:col-span-8 space-y-5">
          {/* Status banner (when there's a status) */}
          {isLoading ? (
            <Surface className="p-5 animate-pulse">
              <div className="h-5 w-40 bg-mist rounded" />
              <div className="mt-2 h-4 w-72 bg-mist/80 rounded" />
            </Surface>
          ) : (
            meta && (
              <StatusBanner
                meta={meta}
                status={status!}
                notes={kyc?.notes}
                createdAt={kyc?.createdAt}
                reviewedAt={kyc?.reviewedAt}
              />
            )
          )}

          {showSuccess && (
            <SuccessBanner message="Your verification has been submitted. Our admin team will respond within 24–48 hours." />
          )}

          <ErrorBanner message={err} />

          {/* SECTION 1 — Business registration */}
          <SectionCard
            step={1}
            eyebrow="Business"
            title="Business registration"
            sub="Official entity registration as filed with your local company registrar."
            complete={stepState.docs}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('registrationNo', 'Business registration no.', 'e.g. PV-00123456', {
                mono: true,
                icon: <Building2Icon size={13} className="text-copper" />,
                helper: 'Must match the name on file with the Registrar of Companies.',
              })}
              {field('taxId', 'Tax ID', 'e.g. 123456789-VAT', {
                optional: true,
                mono: true,
                icon: <FileTextIcon size={13} className="text-copper" />,
                helper: 'IRD VAT / SVAT registration, or equivalent.',
              })}
            </div>
          </SectionCard>

          {/* SECTION 2 — Settlement bank */}
          <SectionCard
            step={2}
            eyebrow="Settlement"
            title="Payout bank account"
            sub="Commercial bank account for automated escrow payouts. VYRO uses licensed payment gateways."
            complete={stepState.bank}
          >
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              {field('bankName', 'Bank name', 'e.g. Commercial Bank', {
                icon: <BanknoteIcon size={13} className="text-copper" />,
                helper: 'Must be a licensed commercial bank operating in Sri Lanka.',
              })}
              {field('bankAccountNo', 'Bank account no.', 'e.g. 8001234567', {
                mono: true,
                helper: 'Used for automated payouts — no manual transfers.',
              })}
              {field('bankBranch', 'Bank branch', 'e.g. Dambulla', {
                helper: 'Branch where the account was opened.',
              })}
              {field('bankAccountHolder', 'Account holder', 'e.g. Lanka Agro Mills (Pvt) Ltd', {
                helper: 'Must match the business registration name exactly.',
              })}
            </div>
          </SectionCard>

          {/* SECTION 3 — Reviewer notes (only when action required) */}
          {(status === 'rejected' || status === 'needs_more_info') && (
            <SectionCard
              step={3}
              eyebrow="Reviewer"
              title="Address admin feedback"
              sub="Add a short note for the reviewer explaining the changes you made."
            >
              <Textarea
                id="kyc-notes"
                rows={3}
                value={form.notes}
                onChange={(e) => setForm({ ...form, notes: e.target.value })}
                placeholder="e.g. Updated tax ID with the latest SVAT certificate attached in Facility Settings…"
                className="bg-paper"
              />
            </SectionCard>
          )}

          {/* Sticky-ish action bar */}
          <div className="sticky bottom-4 z-20 -mx-4 sm:mx-0">
            <div className="bg-paper border border-ink/15 shadow-float rounded-2xl px-5 py-3 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div className="flex items-center gap-3 text-xs">
                <div
                  className={cn(
                    'w-8 h-8 rounded-lg flex items-center justify-center shrink-0',
                    canSubmit
                      ? 'bg-ink text-volt'
                      : meta?.tone === 'amber'
                      ? 'bg-amber/15 text-amber'
                      : 'bg-mint/15 text-mint',
                  )}
                >
                  {canSubmit ? (
                    <UploadCloudIcon size={14} />
                  ) : meta?.tone === 'amber' ? (
                    <ClockIcon size={14} />
                  ) : (
                    <CheckCircle2Icon size={14} />
                  )}
                </div>
                <div>
                  <div className="text-[10px] font-mono uppercase tracking-wider text-ink-4">
                    {canSubmit ? 'Ready to submit' : meta?.label ?? 'Current status'}
                  </div>
                  <div className="font-semibold text-ink-1">
                    {canSubmit
                      ? status === 'rejected' || status === 'needs_more_info'
                        ? 'Resubmit updated details'
                        : 'Submit business & bank details'
                      : meta?.short ?? 'Verification'}
                  </div>
                </div>
              </div>

              <div className="flex items-center gap-2 sm:shrink-0">
                {status === 'pending' && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      void submit.reset();
                      toast.show(toast.info('Form reset — current submission remains under review.'));
                    }}
                    className="text-[11px]"
                  >
                    <RefreshCwIcon size={12} /> Reset
                  </Button>
                )}
                <Button
                  loading={submit.isPending}
                  disabled={!canSubmit || submit.isPending}
                  onClick={onSubmit}
                  size="md"
                  className="font-bold uppercase tracking-wider"
                >
                  {status === null
                    ? 'Submit for verification'
                    : status === 'approved'
                      ? 'Verified ✓'
                      : status === 'pending'
                        ? 'Submitted — pending review'
                        : 'Resubmit for verification'}
                  <ArrowRightIcon size={14} />
                </Button>
              </div>
            </div>
          </div>
        </div>

        {/* RIGHT — Live status / help */}
        <div className="lg:col-span-4 space-y-4 lg:sticky lg:top-6">
          {/* Live status card */}
          <div className="vyro-kicker text-copper">Current Status</div>
          <Surface className="p-6 space-y-5">
            <div className="flex items-start gap-3">
              <div
                className={cn(
                  'w-12 h-12 rounded-xl flex items-center justify-center shrink-0',
                  meta?.iconBg ?? 'bg-ink/10',
                  meta?.iconColor ?? 'text-ink-3',
                )}
              >
                {meta?.icon ?? <ShieldCheckIcon size={22} className="text-ink-3" />}
              </div>
              <div className="min-w-0">
                <div className="text-[10px] font-mono text-ink-4 uppercase tracking-wider">
                  Verification status
                </div>
                <div className="mt-0.5 font-display text-xl text-ink-1 leading-tight">
                  {meta?.label ?? 'Not yet submitted'}
                </div>
                <p className="mt-1 text-xs text-ink-3 leading-relaxed">
                  {meta?.hint ??
                    'Once you submit, our admin team will verify your business and bank details within 24–48 hours.'}
                </p>
              </div>
            </div>

            {/* Timeline */}
            <div className="pt-3 border-t border-ink/10 space-y-2.5">
              <TimelineRow
                label="Submission created"
                ts={kyc?.createdAt ?? null}
                done={!!kyc?.createdAt}
              />
              <TimelineRow
                label="Admin review complete"
                ts={kyc?.reviewedAt ?? null}
                done={!!kyc?.reviewedAt}
              />
              {kyc?.reviewedAt && (
                <div className="text-[11px] text-ink-3 leading-relaxed pl-5">
                  Reviewed by{' '}
                  <span className="font-mono text-ink-1">
                    {kyc.reviewedBy ? kyc.reviewedBy.slice(0, 12) : 'platform admin'}
                  </span>
                </div>
              )}
            </div>

            {meta && (
              <div className="pt-3 border-t border-ink/10">
                <div className="text-[10px] font-mono text-ink-4 uppercase tracking-wider mb-1.5">
                  Next step
                </div>
                <p className="text-xs text-ink-2 leading-relaxed">{meta.nextStep}</p>
              </div>
            )}
          </Surface>

          {/* What we verify card */}
          <div className="p-4 bg-paper border border-ink/10 space-y-2.5">
            <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
              What we verify
            </div>
            <ul className="space-y-2 text-xs text-ink-3">
              <CheckItem icon={<Building2Icon size={12} />} text="Business registration with the Registrar of Companies" />
              <CheckItem icon={<FileTextIcon size={12} />} text="Tax / VAT / SVAT compliance (if provided)" />
              <CheckItem icon={<BanknoteIcon size={12} />} text="Active commercial bank account for escrow payouts" />
              <CheckItem icon={<ShieldCheckIcon size={12} />} text="Cross-checked business name & account holder match" />
            </ul>
          </div>

          {/* Help card */}
          <div className="p-4 bg-paper border border-ink/10 flex items-start gap-3">
            <div className="size-8 rounded-md bg-copper/10 text-copper flex items-center justify-center shrink-0">
              <SparklesIcon size={15} />
            </div>
            <div className="min-w-0">
              <div className="text-[10px] font-mono text-copper uppercase tracking-wider font-bold">
                Need help?
              </div>
              <p className="text-xs text-ink-3 leading-relaxed mt-0.5">
                Most rejections are due to a mismatched business name or a typo in the account number. Double-check both before resubmitting.
              </p>
              <Link
                to="/supplier/settings"
                className="mt-2 text-[11px] font-semibold text-copper hover:underline inline-flex items-center gap-1"
              >
                Facility settings
                <ChevronRightIcon size={10} />
              </Link>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

/* ---------- Local helpers ---------- */

function Stepper({
  steps,
  stateMap,
  status,
}: {
  steps: { key: string; label: string; icon: React.ComponentType<{ size?: number; className?: string }> }[];
  stateMap: Record<string, boolean>;
  status: KycStatus;
}) {
  return (
    <ol className="flex items-start w-full">
      {steps.map((s, i) => {
        const done = stateMap[s.key];
        const active = !done && (i === steps.findIndex((x) => !stateMap[x.key]) || status === 'pending');
        const tone = done
          ? 'text-mint'
          : active
          ? 'text-copper'
          : 'text-ink-4';
        return (
          <li key={s.key} className="flex-1 min-w-0 flex items-start">
            <div className="flex flex-col items-start gap-1.5 min-w-0 w-full">
              <div className="flex items-center w-full">
                <span
                  className={cn(
                    'relative z-[1] size-2.5 rotate-45 shrink-0',
                    done ? 'bg-mint' : active ? 'bg-copper' : 'bg-mist',
                    active && 'animate-mark-pulse',
                  )}
                />
                {i < steps.length - 1 && (
                  <span className="relative mx-2 h-px flex-1 overflow-hidden bg-ink/15">
                    <span
                      className={cn(
                        'absolute inset-y-0 left-0 w-1/2 bg-volt',
                        done && 'w-full',
                      )}
                    />
                  </span>
                )}
              </div>
              <div className="min-w-0 pr-3">
                <div
                  className={cn(
                    'text-[10px] font-semibold tracking-wide uppercase',
                    done ? 'text-mint' : active ? 'text-ink' : 'text-ink-4',
                  )}
                >
                  0{i + 1} · {s.label}
                </div>
              </div>
            </div>
          </li>
        );
      })}
    </ol>
  );
}

function SectionCard({
  step,
  eyebrow,
  title,
  sub,
  complete,
  children,
}: {
  step: number;
  eyebrow: string;
  title: string;
  sub?: string;
  complete?: boolean;
  children: React.ReactNode;
}) {
  return (
    <Surface className="p-6 space-y-5 animate-fade-in">
      <div className="flex items-start justify-between gap-3 pb-3 border-b border-ink/10">
        <div className="flex items-start gap-3 min-w-0">
          <div
            className={cn(
              'w-8 h-8 rounded-full font-mono font-bold text-xs flex items-center justify-center shrink-0 shadow-xs',
              complete ? 'bg-mint text-paper' : 'bg-ink text-volt',
            )}
          >
            {complete ? <CheckCircle2Icon size={14} /> : step}
          </div>
          <div className="min-w-0">
            <div className="vyro-kicker text-copper">{eyebrow}</div>
            <h2 className="mt-1 text-lg font-bold text-ink-1">{title}</h2>
            {sub && <p className="text-xs text-ink-3 mt-0.5 max-w-xl">{sub}</p>}
          </div>
        </div>
        {complete && (
          <span className="hidden sm:inline-flex items-center gap-1.5 px-2 py-0.5 text-[10px] font-mono font-bold uppercase tracking-wider bg-mint/15 text-mint border border-mint/30 shrink-0">
            <CheckCircle2Icon size={10} /> Complete
          </span>
        )}
      </div>
      {children}
    </Surface>
  );
}

function StatusBanner({
  meta,
  status,
  notes,
  createdAt,
  reviewedAt,
}: {
  meta: typeof STATUS_META[keyof typeof STATUS_META];
  status: Exclude<KycStatus, null>;
  notes: string | null | undefined;
  createdAt: number | null | undefined;
  reviewedAt: number | null | undefined;
}) {
  const tone = meta.tone;
  return (
    <div
      className={cn(
        'p-5 border-l-4 flex flex-col sm:flex-row sm:items-start gap-4',
        tone === 'amber' && 'bg-amber/10 border-l-amber border border-amber/30',
        tone === 'mint' && 'bg-mint/10 border-l-mint border border-mint/30',
        tone === 'rose' && 'bg-rose/10 border-l-rose border border-rose/30',
        tone === 'copper' && 'bg-copper/10 border-l-copper border border-copper/30',
      )}
    >
      <div
        className={cn(
          'size-12 rounded-xl flex items-center justify-center shrink-0',
          meta.iconBg,
          meta.iconColor,
        )}
      >
        {meta.icon}
      </div>
      <div className="flex-1 min-w-0">
        <div
          className={cn(
            'text-[10px] font-mono uppercase tracking-wider font-bold',
            tone === 'amber' && 'text-amber',
            tone === 'mint' && 'text-mint',
            tone === 'rose' && 'text-rose',
            tone === 'copper' && 'text-copper-deep',
          )}
        >
          {meta.label}
        </div>
        <p className="text-sm text-ink-1 mt-1 font-semibold">{meta.hint}</p>
        {notes && (
          <div className="mt-3 p-3 bg-paper/60 border border-ink/10">
            <div className="text-[10px] font-mono text-ink-4 uppercase tracking-wider font-bold mb-1">
              Reviewer note
            </div>
            <p className="text-xs text-ink-2 leading-relaxed">{notes}</p>
          </div>
        )}
        <div className="mt-3 flex flex-wrap items-center gap-3 text-[11px] text-ink-3 font-mono">
          {createdAt && (
            <span className="inline-flex items-center gap-1.5">
              <ClockIcon size={11} /> Submitted {new Date(createdAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {reviewedAt && (
            <span className="inline-flex items-center gap-1.5">
              <CheckCircle2Icon size={11} /> Reviewed {new Date(reviewedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}
            </span>
          )}
          {status === 'pending' && createdAt && (
            <span className="inline-flex items-center gap-1.5 text-amber">
              · Estimated review within 24–48h
            </span>
          )}
        </div>
      </div>
    </div>
  );
}

function TimelineRow({ label, ts, done }: { label: string; ts?: number | null; done: boolean }) {
  return (
    <div className="flex items-center gap-2.5 text-[11px]">
      <span
        className={cn(
          'size-2 rounded-full shrink-0',
          done ? 'bg-mint' : 'bg-mist',
        )}
        aria-hidden
      />
      <span className={cn('flex-1', done ? 'text-ink-2' : 'text-ink-4')}>{label}</span>
      {ts && (
        <span className="font-mono text-ink-3">
          {new Date(ts).toLocaleDateString('en-GB', { day: '2-digit', month: 'short' })}
        </span>
      )}
    </div>
  );
}

function CheckItem({ icon, text }: { icon: React.ReactNode; text: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className="text-copper shrink-0 mt-0.5">{icon}</span>
      <span className="leading-relaxed">{text}</span>
    </li>
  );
}
