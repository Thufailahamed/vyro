import { useStatus } from '../lib/useStatus';

const COMPONENTS = ['api', 'payments', 'queues', 'cron', 'web'];

export function StatusPage() {
  const data = useStatus();
  if (!data) {
    return (
      <main className="p-8">
        <h1 className="text-2xl font-bold">Vyro Status</h1>
        <p>Loading…</p>
      </main>
    );
  }
  const stale = Date.now() - data.updatedAt > 15 * 60_000;
  return (
    <main className="p-8 max-w-3xl mx-auto">
      <h1 className="text-2xl font-bold">Vyro Status</h1>
      <p className="text-sm text-gray-600">
        Version: {data.version}
      </p>
      {stale && (
        <div className="my-4 p-3 bg-yellow-100 border border-yellow-300">
          Data may be stale.
        </div>
      )}
      <section className="mt-6">
        <h2 className="text-lg font-semibold">Components</h2>
        <ul className="mt-2 space-y-2">
          {COMPONENTS.map((c) => {
            const entry = data.components[c];
            const cls =
              entry?.status === 'operational'
                ? 'text-green-700'
                : entry?.status === 'degraded'
                  ? 'text-yellow-700'
                  : entry?.status === 'down'
                    ? 'text-red-700'
                    : 'text-gray-500';
            return (
              <li
                key={c}
                className="flex justify-between border-b py-2"
              >
                <span>{c}</span>
                <span className={`font-medium ${cls}`}>
                  {entry?.status ?? 'unknown'}
                </span>
              </li>
            );
          })}
        </ul>
      </section>
      {data.incidents.length > 0 && (
        <section className="mt-8">
          <h2 className="text-lg font-semibold">Active Incidents</h2>
          <ul className="mt-2 space-y-3">
            {data.incidents.map((inc) => (
              <li key={inc.id} className="border p-3">
                <div className="font-medium">{inc.title}</div>
                <div className="text-sm text-gray-600">
                  severity={inc.severity}, started=
                  {new Date(inc.startedAt).toISOString()}
                </div>
              </li>
            ))}
          </ul>
        </section>
      )}
    </main>
  );
}