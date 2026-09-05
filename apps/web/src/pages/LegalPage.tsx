import type { ReactElement } from 'react';
import { Card } from '@vyro/ui';
import termsMd from '../content/legal/terms.md?raw';
import privacyMd from '../content/legal/privacy.md?raw';
import cookiesMd from '../content/legal/cookies.md?raw';

type Kind = 'terms' | 'privacy' | 'cookies';

const DOCS: Record<Kind, string> = { terms: termsMd, privacy: privacyMd, cookies: cookiesMd };

const TITLES: Record<Kind, string> = {
  terms: 'Terms of Service',
  privacy: 'Privacy Policy',
  cookies: 'Cookie Policy',
};

function renderMd(md: string): ReactElement[] {
  const blocks = md.split(/\n\n+/);
  return blocks.map((block, i) => {
    if (block.startsWith('# ')) return <h1 key={i} className="text-2xl font-semibold mb-4 text-ink-1">{block.slice(2)}</h1>;
    if (block.startsWith('## ')) return <h2 key={i} className="text-lg font-semibold mt-6 mb-2 text-ink-1">{block.slice(3)}</h2>;
    if (block.startsWith('> ')) {
      return (
        <blockquote key={i} className="border-l-4 border-amber-400 bg-amber-50 text-amber-900 px-3 py-2 mb-3 text-sm">
          {block.slice(2)}
        </blockquote>
      );
    }
    if (block.startsWith('- ')) {
      const items = block.split('\n').map((l) => l.replace(/^- /, ''));
      return (
        <ul key={i} className="list-disc pl-6 mb-3 space-y-1 text-sm text-ink-1">
          {items.map((it, j) => (
            <li key={j}>{it}</li>
          ))}
        </ul>
      );
    }
    return <p key={i} className="mb-3 leading-relaxed text-sm text-ink-1">{block}</p>;
  });
}

export function LegalPage({ kind }: { kind: Kind }) {
  return (
    <div className="max-w-2xl mx-auto p-4">
      <Card>
        <h1 className="text-2xl font-semibold mb-2 text-ink-1">{TITLES[kind]}</h1>
        <div className="bg-amber-100 border border-amber-300 text-amber-900 px-3 py-2 mb-4 rounded text-sm">
          Draft — pending lawyer review. Not legal advice.
        </div>
        <article>{renderMd(DOCS[kind])}</article>
      </Card>
    </div>
  );
}
