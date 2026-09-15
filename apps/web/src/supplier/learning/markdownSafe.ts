/**
 * Minimal markdown rendering: HTML-escape then split paragraphs on blank lines.
 * No HTML tags are ever emitted by the renderer; this is the safe floor for
 * admin-authored lesson bodies. If we adopt a richer markdown later (links,
 * lists), this is the single seam to swap implementations.
 */
export function renderLessonMarkdown(src: string): string {
  const escaped = src
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
  const paragraphs = escaped.split(/\n{2,}/).map((p) => `<p>${p.replace(/\n/g, '<br/>')}</p>`);
  return paragraphs.join('\n');
}