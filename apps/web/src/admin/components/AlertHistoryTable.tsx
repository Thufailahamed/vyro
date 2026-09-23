import { ClockIcon } from '@/components/icons';
import { EmptyBlock, Pill, type PillTone } from '../ui';

function severityTone(severity: unknown): PillTone {
  const s = String(severity ?? '').toLowerCase();
  if (/(crit|high|page|p0|p1|error)/.test(s)) return 'danger';
  if (/(warn|medium|p2)/.test(s)) return 'warning';
  if (/(info|low)/.test(s)) return 'info';
  return 'neutral';
}

export function AlertHistoryTable({ rows }: { rows: any[] }) {
  if (rows.length === 0) {
    return (
      <EmptyBlock
        icon={<ClockIcon size={20} />}
        title="No alerts fired yet"
        description="Alerts raised by these rules will be listed here."
      />
    );
  }
  return (
    <table className="admin-table">
      <thead>
        <tr>
          <th>Time</th>
          <th>Rule</th>
          <th>Severity</th>
          <th>Title</th>
        </tr>
      </thead>
      <tbody>
        {rows.map((r) => (
          <tr key={r.id}>
            <td className="whitespace-nowrap font-mono text-xs text-ink-3">{new Date(r.createdAt).toISOString()}</td>
            <td className="font-mono text-xs">{r.sourceRef}</td>
            <td>
              <Pill tone={severityTone(r.severity)}>{r.severity}</Pill>
            </td>
            <td>{r.title}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}
