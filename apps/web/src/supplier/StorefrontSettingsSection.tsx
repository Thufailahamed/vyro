import { useEffect, useState, type JSX } from 'react';

export interface StorefrontSettingsSectionProps {
  currentSlug: string | null;
}

export function StorefrontSettingsSection({ currentSlug }: StorefrontSettingsSectionProps): JSX.Element {
  const [slug, setSlug] = useState(currentSlug ?? '');
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  useEffect(() => {
    setSlug(currentSlug ?? '');
  }, [currentSlug]);

  async function save() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await fetch('/api/suppliers/me/slug', {
        method: 'PATCH',
        headers: { 'content-type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ slug }),
      });
      if (!res.ok) {
        const j = (await res.json().catch(() => ({}))) as { error?: { message?: string } };
        setMsg(j?.error?.message ?? `Failed (${res.status})`);
        return;
      }
      setMsg('Saved.');
    } finally {
      setBusy(false);
    }
  }

  const valid = /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug) && slug.length <= 60 && slug.length > 0;

  return (
    <div className="border border-ink/10 bg-paper p-4 space-y-3">
      <div className="vyro-kicker text-copper">Storefront</div>
      <p className="text-sm text-ink-3">
        Public page URL: <code className="text-xs">/suppliers/{currentSlug ?? '<unset>'}</code>
      </p>
      <div className="flex flex-col sm:flex-row gap-2">
        <input
          type="text"
          value={slug}
          onChange={(e) => setSlug(e.target.value.toLowerCase())}
          placeholder="colombo-fresh-dairy"
          maxLength={60}
          className="flex-1 border border-ink/20 rounded px-3 py-2 text-sm"
        />
        <button
          onClick={save}
          disabled={!valid || busy}
          className="px-4 py-2 bg-ink text-paper text-sm font-semibold rounded disabled:opacity-40"
        >
          {busy ? 'Saving…' : 'Save slug'}
        </button>
      </div>
      {!valid && slug.length > 0 && (
        <p className="text-xs text-rose-600">Slug must be lowercase kebab-case, 1–60 chars.</p>
      )}
      {msg && <p className="text-xs text-ink-3">{msg}</p>}
    </div>
  );
}
