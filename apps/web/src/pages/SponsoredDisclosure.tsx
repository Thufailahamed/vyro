import React from 'react';
import { sponsoredApi } from '../lib/sponsoredApi';

export function SponsoredDisclosure() {
  const [data, setData] = React.useState<{ version: string; title: string; body: string; lastUpdated: number } | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  React.useEffect(() => {
    sponsoredApi.fetchDisclosure().then(setData).catch((e: Error) => setError(e.message));
  }, []);

  if (error) return <div className="p-6 text-red-600">{error}</div>;
  if (!data) return <div className="p-6">Loading…</div>;
  return (
    <article className="prose mx-auto max-w-3xl p-6">
      <h1 className="text-2xl font-semibold">{data.title}</h1>
      <p className="text-sm text-gray-500">
        Version {data.version} · Updated {new Date(data.lastUpdated * 1000).toLocaleDateString()}
      </p>
      <div className="mt-4 whitespace-pre-wrap text-base leading-relaxed">{data.body}</div>
    </article>
  );
}