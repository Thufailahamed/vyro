import { useEffect } from 'react';

export interface SeoHeadProps {
  title: string;
  description?: string | undefined;
  image?: string | undefined;
}

function upsertMeta(name: string, content: string, attr: 'name' | 'property' = 'name'): void {
  if (typeof document === 'undefined') return;
  let el = document.head.querySelector<HTMLMetaElement>(`meta[${attr}="${name}"]`);
  if (!el) {
    el = document.createElement('meta');
    el.setAttribute(attr, name);
    document.head.appendChild(el);
  }
  el.setAttribute('content', content);
}

export function SeoHead({ title, description, image }: SeoHeadProps): null {
  useEffect(() => {
    document.title = title;
    upsertMeta('description', description ?? title);
    upsertMeta('og:title', title, 'property');
    upsertMeta('og:description', description ?? title, 'property');
    if (image) upsertMeta('og:image', image, 'property');
    return () => {
      document.title = 'Vyro';
      upsertMeta('description', 'Vyro wholesale marketplace');
    };
  }, [title, description, image]);
  return null;
}
