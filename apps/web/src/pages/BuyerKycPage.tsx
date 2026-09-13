import { useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { useQuery, useMutation } from '@tanstack/react-query';
import { usePageTitle } from '@/lib/usePageTitle';
import { api, ApiError } from '@/lib/api';
import { Button, ErrorBanner, Label } from '@/components/ui';
import { ShieldCheckIcon, ArrowLeftIcon, CheckCircleIcon } from '@/components/icons';

interface BusinessDetail {
  id: string;
  name: string;
  countryCode?: string | null;
  kycLevel?: 'none' | 'basic' | 'enhanced' | null;
  kycVerifiedAt?: number | null;
}

export function BuyerKycPage() {
  usePageTitle('Buyer KYC Verification');
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [level, setLevel] = useState<'basic' | 'enhanced'>('basic');
  const [docs, setDocs] = useState('');
  const [submitErr, setSubmitErr] = useState('');

  const business = useQuery({
    queryKey: ['business-kyc', id],
    queryFn: () => api.get<{ business: BusinessDetail }>(`/businesses/${id}`),
    enabled: !!id,
  });

  const submit = useMutation({
    mutationFn: () =>
      api.post(`/admin/cross-border-kyc/${id}/submit`, {
        level,
        documentUrls: docs.split('\n').map((s) => s.trim()).filter(Boolean),
      }),
    onSuccess: () => {
      navigate('/checkout');
    },
    onError: (e) => {
      setSubmitErr(e instanceof ApiError ? e.message : 'Submission failed');
    },
  });

  if (!id) {
    return <div className="p-8 text-center text-ink-3">No business ID.</div>;
  }

  const kycLevel = business.data?.business?.kycLevel ?? 'none';
  const verifiedAt = business.data?.business?.kycVerifiedAt;
  const country = business.data?.business?.countryCode ?? 'LK';
  const isForeign = country !== 'LK';

  return (
    <div className="max-w-3xl mx-auto py-10 space-y-6">
      <Link
        to="/checkout"
        className="inline-flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-ink-3 hover:text-ink-1"
      >
        <ArrowLeftIcon className="w-3.5 h-3.5" /> Back to Checkout
      </Link>

      <header className="space-y-1">
        <span className="text-[11px] font-mono font-bold tracking-widest text-emerald-800 uppercase px-2.5 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20 inline-block">
          Cross-Border Verification
        </span>
        <h1 className="text-3xl font-bold text-ink-1 tracking-tight">Buyer KYC</h1>
        <p className="text-sm text-ink-3 max-w-2xl">
          Required once before checkout for businesses domiciled outside Sri Lanka.
          Submitted documents are reviewed manually within 1 business day.
        </p>
      </header>

      <section className="border border-ink/10 bg-paper p-5 space-y-4">
        <div className="flex items-start justify-between gap-3">
          <div>
            <div className="text-xs font-mono uppercase tracking-wider text-ink-4">Business</div>
            <div className="text-base font-bold text-ink-1 mt-0.5">
              {business.data?.business?.name ?? '—'}
            </div>
            <div className="text-[11px] font-mono text-ink-4 mt-1">
              Country: <span className="font-bold">{country}</span>
              {!isForeign && (
                <span className="ml-2 text-emerald-700">(domestic — KYC not required)</span>
              )}
            </div>
          </div>
          <KycBadge level={kycLevel} verifiedAt={verifiedAt} />
        </div>
      </section>

      {isForeign && kycLevel === 'none' && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            setSubmitErr('');
            submit.mutate();
          }}
          className="border border-ink/10 bg-paper p-5 space-y-4"
        >
          <h2 className="text-base font-bold text-ink-1">Submit verification documents</h2>

          {submitErr && <ErrorBanner message={submitErr} />}

          <div>
            <Label className="mb-1.5">Verification level</Label>
            <div className="grid grid-cols-2 gap-2">
              <button
                type="button"
                onClick={() => setLevel('basic')}
                className={`p-3 border text-left text-xs ${
                  level === 'basic'
                    ? 'border-ink bg-ink/5'
                    : 'border-ink/15 hover:border-ink/30'
                }`}
              >
                <div className="font-bold text-ink-1">Basic</div>
                <div className="text-ink-3 mt-1">Trade registration certificate + director ID</div>
              </button>
              <button
                type="button"
                onClick={() => setLevel('enhanced')}
                className={`p-3 border text-left text-xs ${
                  level === 'enhanced'
                    ? 'border-ink bg-ink/5'
                    : 'border-ink/15 hover:border-ink/30'
                }`}
              >
                <div className="font-bold text-ink-1">Enhanced</div>
                <div className="text-ink-3 mt-1">+ bank reference letter + audited financials</div>
              </button>
            </div>
          </div>

          <div>
            <Label htmlFor="docs" className="mb-1.5">
              Document URLs (one per line)
            </Label>
            <textarea
              id="docs"
              value={docs}
              onChange={(e) => setDocs(e.target.value)}
              rows={4}
              required
              placeholder="https://docs.example.com/registration.pdf&#10;https://docs.example.com/director-id.pdf"
              className="w-full px-3 py-2 text-xs font-mono bg-sand/30 border border-ink/15 focus:outline-none focus:border-ink"
            />
            <p className="text-[11px] text-ink-4 mt-1">
              Upload to your cloud storage first, then paste signed/short-lived URLs here.
            </p>
          </div>

          <Button type="submit" variant="primary" disabled={submit.isPending}>
            <ShieldCheckIcon className="w-4 h-4 mr-1.5" />
            {submit.isPending ? 'Submitting…' : 'Submit for review'}
          </Button>
        </form>
      )}
    </div>
  );
}

function KycBadge({ level, verifiedAt }: { level: string; verifiedAt?: number | null | undefined }) {
  if (level !== 'none' && verifiedAt) {
    return (
      <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-semibold bg-emerald-500/15 text-emerald-700 border border-emerald-500/30">
        <CheckCircleIcon className="w-3.5 h-3.5" />
        VERIFIED · {level.toUpperCase()}
      </div>
    );
  }
  return (
    <div className="inline-flex items-center gap-1.5 px-2.5 py-1 text-[10px] font-mono font-semibold bg-amber/15 text-amber border border-amber/30">
      UNVERIFIED
    </div>
  );
}
