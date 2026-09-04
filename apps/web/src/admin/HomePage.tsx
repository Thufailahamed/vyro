import { Link } from 'react-router-dom';
import {
  StoreIcon,
  Building2Icon,
  AlertCircleIcon,
  FileTextIcon,
  ShieldCheckIcon,
} from './icons';

function ArrowRightIcon({ size = 14, className = '' }: { size?: number; className?: string }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden>
      <path d="M5 12h14" />
      <path d="m12 5 7 7-7 7" />
    </svg>
  );
}

const TILES = [
  {
    to: '/admin/suppliers',
    icon: StoreIcon,
    iconBg: 'bg-cyan/15 text-cyan-deep',
    label: 'Suppliers',
    desc: 'Verified wholesale vendors and distributors on the platform.',
    metric: 'Onboarding & KYC',
  },
  {
    to: '/admin/businesses',
    icon: Building2Icon,
    iconBg: 'bg-violet/15 text-violet',
    label: 'Businesses',
    desc: 'Verified procurement buyers and commercial accounts.',
    metric: 'Accounts & access',
  },
  {
    to: '/admin/disputed',
    icon: AlertCircleIcon,
    iconBg: 'bg-rose/15 text-rose',
    label: 'Disputed orders',
    desc: 'Active escalations awaiting platform arbitration.',
    metric: 'Resolution inbox',
  },
  {
    to: '/admin/audit',
    icon: FileTextIcon,
    iconBg: 'bg-violet/15 text-violet',
    label: 'Audit log',
    desc: 'Immutable trail of every privileged state transition.',
    metric: 'Compliance ledger',
  },
];

export function AdminHomePage() {
  return (
    <div className="space-y-8">
      <header className="pb-5 border-b border-slate-200">
        <div className="flex items-center gap-3">
          <span className="size-10 rounded-lg bg-slate-950 text-cyan inline-flex items-center justify-center">
            <ShieldCheckIcon size={18} />
          </span>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight text-slate-950">Operations console</h1>
            <p className="text-sm text-slate-500">
              Platform administration for suppliers, buyers, disputes, and audit.
            </p>
          </div>
        </div>
      </header>

      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-[10px] font-semibold uppercase tracking-wider text-slate-500">
            Operational surfaces
          </h2>
          <span className="text-[11px] text-slate-400 font-mono num-tabular">
            {TILES.length} workspaces
          </span>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {TILES.map((t) => {
            const Icon = t.icon;
            return (
              <Link
                key={t.to}
                to={t.to}
                className="group bg-paper border border-slate-200 rounded-lg p-4 hover:border-slate-950 hover:-translate-y-0.5 transition-all duration-200 shadow-soft-sm hover:shadow-soft-md"
              >
                <div className="flex items-center justify-between mb-3">
                  <span className={`size-9 rounded-md inline-flex items-center justify-center ${t.iconBg}`}>
                    <Icon size={16} />
                  </span>
                  <ArrowRightIcon
                    size={14}
                    className="text-slate-300 group-hover:text-slate-950 group-hover:translate-x-0.5 transition-all"
                  />
                </div>
                <div className="space-y-1">
                  <div className="font-semibold text-slate-950 text-sm">{t.label}</div>
                  <div className="text-xs text-slate-500 leading-relaxed line-clamp-2">{t.desc}</div>
                  <div className="pt-2 mt-2 border-t border-slate-100">
                    <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-400">
                      {t.metric}
                    </span>
                  </div>
                </div>
              </Link>
            );
          })}
        </div>
      </section>
    </div>
  );
}
