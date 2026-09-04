import { useMemo } from 'react';
import { cn } from '../lib/cn';

interface SparklineProps {
  values: number[];
  width?: number;
  height?: number;
  tone?: 'cyan' | 'mint' | 'amber' | 'rose' | 'violet';
  fill?: boolean;
  className?: string;
}

const TONE_MAP: Record<NonNullable<SparklineProps['tone']>, { stroke: string; fill: string }> = {
  cyan: { stroke: '#06B6D4', fill: 'rgba(6, 182, 212, 0.12)' },
  mint: { stroke: '#10B981', fill: 'rgba(16, 185, 129, 0.12)' },
  amber: { stroke: '#F59E0B', fill: 'rgba(245, 158, 11, 0.12)' },
  rose: { stroke: '#F43F5E', fill: 'rgba(244, 63, 94, 0.12)' },
  violet: { stroke: '#8B5CF6', fill: 'rgba(139, 92, 246, 0.12)' },
};

export function Sparkline({
  values,
  width = 120,
  height = 32,
  tone = 'cyan',
  fill = true,
  className,
}: SparklineProps) {
  const { path, fillPath, dots } = useMemo(() => {
    if (values.length < 2) {
      return { path: '', fillPath: '', dots: [] as Array<{ x: number; y: number }> };
    }
    const min = Math.min(...values);
    const max = Math.max(...values);
    const range = max - min || 1;
    const stepX = width / (values.length - 1);
    const points = values.map((v, i) => ({
      x: i * stepX,
      y: height - ((v - min) / range) * (height - 2) - 1,
    }));
    const path = points
      .map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`))
      .join(' ');
    const fillPath = `${path} L ${width} ${height} L 0 ${height} Z`;
    return { path, fillPath, dots: points };
  }, [values, width, height]);

  const colors = TONE_MAP[tone];

  return (
    <svg
      width={width}
      height={height}
      viewBox={`0 0 ${width} ${height}`}
      className={cn('overflow-visible', className)}
      aria-hidden
    >
      {fill && fillPath && (
        <path d={fillPath} fill={colors.fill} stroke="none" />
      )}
      {path && (
        <path
          d={path}
          stroke={colors.stroke}
          strokeWidth={1.5}
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      )}
      {dots.length > 0 && (
        <circle
          cx={dots[dots.length - 1]!.x}
          cy={dots[dots.length - 1]!.y}
          r={2}
          fill={colors.stroke}
        />
      )}
    </svg>
  );
}

interface BarGroup {
  label: string;
  value: number;
}

interface BarChartProps {
  data: BarGroup[];
  tone?: 'cyan' | 'mint' | 'amber' | 'rose' | 'violet';
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}

export function BarChart({
  data,
  tone = 'cyan',
  height = 160,
  formatValue,
  className,
}: BarChartProps) {
  const max = Math.max(...data.map((d) => d.value), 1);
  const colors = TONE_MAP[tone];

  return (
    <div className={cn('w-full', className)}>
      <div className="flex items-end gap-2" style={{ height }}>
        {data.map((d) => {
          const h = (d.value / max) * (height - 24);
          return (
            <div key={d.label} className="flex-1 flex flex-col items-center gap-1.5 group">
              <div className="text-[10px] font-mono font-semibold text-slate-700 num-tabular opacity-0 group-hover:opacity-100 transition-opacity">
                {formatValue ? formatValue(d.value) : d.value}
              </div>
              <div
                className="w-full rounded-t-sm transition-all duration-300 group-hover:opacity-100"
                style={{
                  height: Math.max(h, 2),
                  backgroundColor: colors.stroke,
                  opacity: 0.85,
                }}
              />
            </div>
          );
        })}
      </div>
      <div className="flex items-center gap-2 mt-2">
        {data.map((d) => (
          <div key={d.label} className="flex-1 text-center text-[10px] font-medium text-slate-500 uppercase tracking-wider truncate">
            {d.label}
          </div>
        ))}
      </div>
    </div>
  );
}

interface ProgressRingProps {
  value: number; // 0-100
  size?: number;
  strokeWidth?: number;
  tone?: 'cyan' | 'mint' | 'amber' | 'rose' | 'violet';
  label?: string;
  className?: string;
}

export function ProgressRing({
  value,
  size = 96,
  strokeWidth = 8,
  tone = 'cyan',
  label,
  className,
}: ProgressRingProps) {
  const radius = (size - strokeWidth) / 2;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, Math.max(0, value)) / 100) * circumference;
  const colors = TONE_MAP[tone];

  return (
    <div className={cn('relative inline-flex items-center justify-center', className)}>
      <svg width={size} height={size} className="-rotate-90">
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke="#E2E8F0"
          strokeWidth={strokeWidth}
        />
        <circle
          cx={size / 2}
          cy={size / 2}
          r={radius}
          fill="none"
          stroke={colors.stroke}
          strokeWidth={strokeWidth}
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
          style={{ transition: 'stroke-dashoffset 600ms cubic-bezier(0.4, 0, 0.2, 1)' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-lg font-semibold font-mono text-slate-950 num-tabular">
          {Math.round(value)}%
        </span>
        {label && (
          <span className="text-[10px] font-semibold uppercase tracking-wider text-slate-500 mt-0.5">
            {label}
          </span>
        )}
      </div>
    </div>
  );
}

interface StatTileProps {
  label: string;
  value: string | number;
  change?: string;
  trend?: 'up' | 'down' | 'flat';
  Icon?: React.ComponentType<{ size?: number; className?: string }>;
  spark?: number[];
  tone?: 'cyan' | 'mint' | 'amber' | 'rose' | 'violet';
  onClick?: () => void;
}

export function StatTile({
  label,
  value,
  change,
  trend = 'flat',
  Icon,
  spark,
  tone = 'cyan',
  onClick,
}: StatTileProps) {
  const colors = TONE_MAP[tone];
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        'w-full text-left bg-paper border border-slate-200 rounded-xl p-4 shadow-soft-sm transition-all',
        onClick && 'hover:border-slate-300 hover:-translate-y-0.5 hover:shadow-soft-md cursor-pointer',
      )}
    >
      <div className="flex items-start justify-between mb-3">
        <span
          className="size-9 rounded-md inline-flex items-center justify-center"
          style={{ backgroundColor: colors.fill, color: colors.stroke }}
        >
          {Icon && <Icon size={15} />}
        </span>
        {change && (
          <span
            className={cn(
              'text-[10px] font-semibold uppercase tracking-wider num-tabular px-1.5 py-0.5 rounded',
              trend === 'up' && 'bg-mint/15 text-mint',
              trend === 'down' && 'bg-rose/15 text-rose',
              trend === 'flat' && 'bg-ink-7 text-ink-3',
            )}
          >
            {change}
          </span>
        )}
      </div>
      <div className="text-2xl font-semibold font-mono text-slate-950 num-tabular tracking-tight leading-none">
        {value}
      </div>
      <div className="mt-1 text-[11px] font-medium uppercase tracking-wider text-slate-500">
        {label}
      </div>
      {spark && spark.length > 1 && (
        <div className="mt-3 -mb-1 -mx-1">
          <Sparkline values={spark} tone={tone} width={200} height={28} />
        </div>
      )}
    </button>
  );
}

interface TimeSeriesProps {
  values: number[];
  labels?: string[];
  tone?: 'cyan' | 'mint' | 'amber' | 'rose' | 'violet';
  height?: number;
  formatValue?: (v: number) => string;
  className?: string;
}

export function TimeSeries({
  values,
  labels,
  tone = 'cyan',
  height = 180,
  formatValue,
  className,
}: TimeSeriesProps) {
  const colors = TONE_MAP[tone];
  const padY = 20;
  const padX = 8;

  return (
    <div className={cn('w-full', className)}>
      <svg viewBox={`0 0 400 ${height}`} preserveAspectRatio="none" className="w-full" style={{ height }}>
        {/* grid lines */}
        {[0.25, 0.5, 0.75].map((y) => (
          <line
            key={y}
            x1={padX}
            x2={400 - padX}
            y1={padY + (height - padY * 2) * y}
            y2={padY + (height - padY * 2) * y}
            stroke="#E2E8F0"
            strokeDasharray="2 3"
            strokeWidth={0.5}
          />
        ))}

        {(() => {
          if (values.length < 2) return null;
          const min = Math.min(...values);
          const max = Math.max(...values);
          const range = max - min || 1;
          const stepX = (400 - padX * 2) / (values.length - 1);
          const pts = values.map((v, i) => ({
            x: padX + i * stepX,
            y: padY + (height - padY * 2) * (1 - (v - min) / range),
          }));
          const line = pts.map((p, i) => (i === 0 ? `M ${p.x} ${p.y}` : `L ${p.x} ${p.y}`)).join(' ');
          const area = `${line} L ${pts[pts.length - 1]!.x} ${height - padY} L ${pts[0]!.x} ${height - padY} Z`;

          return (
            <g>
              <path d={area} fill={colors.fill} stroke="none" />
              <path d={line} stroke={colors.stroke} strokeWidth={2} strokeLinecap="round" fill="none" />
              {pts.map((p, i) => {
                const isLast = i === pts.length - 1;
                return (
                  <g key={i}>
                    {isLast && (
                      <circle cx={p.x} cy={p.y} r={4} fill={colors.stroke} opacity={0.25} />
                    )}
                    <circle cx={p.x} cy={p.y} r={isLast ? 3 : 1.5} fill={colors.stroke} />
                  </g>
                );
              })}
            </g>
          );
        })()}
      </svg>
      {labels && (
        <div className="flex justify-between mt-2 px-2 text-[10px] uppercase tracking-wider text-slate-400 font-medium">
          {labels.map((l, i) => (
            <span key={i}>{l}</span>
          ))}
        </div>
      )}
      {formatValue && values.length > 0 && (
        <div className="text-[10px] text-slate-400 font-mono num-tabular mt-1.5">
          max {formatValue(Math.max(...values))} · min {formatValue(Math.min(...values))}
        </div>
      )}
    </div>
  );
}
