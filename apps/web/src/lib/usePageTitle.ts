import { useEffect } from 'react';

const BASE_TITLE = 'VYRO';

/**
 * Sets `document.title` for the lifetime of a route and restores the previous
 * value on unmount. The SPA ships a single `index.html`, so without this every
 * route shares the landing-page title — bad for tab switching, browser history
 * and anything that reads the title (screen readers, bookmarks, analytics).
 */
export function usePageTitle(title: string | null | undefined) {
  useEffect(() => {
    if (typeof document === 'undefined') return;
    const previous = document.title;
    document.title = title ? `${title} · ${BASE_TITLE}` : BASE_TITLE;
    return () => {
      document.title = previous;
    };
  }, [title]);
}
