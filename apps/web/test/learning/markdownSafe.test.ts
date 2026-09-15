import { describe, expect, it } from 'vitest';
import { renderLessonMarkdown } from '../../src/supplier/learning/markdownSafe';

describe('renderLessonMarkdown', () => {
  it('escapes HTML special characters', () => {
    const html = renderLessonMarkdown('<script>alert("x")</script>');
    expect(html).not.toMatch(/<script>/);
    expect(html).toMatch(/&lt;script&gt;/);
  });

  it('splits double-newline into paragraphs', () => {
    const html = renderLessonMarkdown('one\n\ntwo');
    expect(html).toMatch(/<p>one<\/p>/);
    expect(html).toMatch(/<p>two<\/p>/);
  });

  it('returns single paragraph for one block', () => {
    const html = renderLessonMarkdown('only one');
    expect(html).toBe('<p>only one</p>');
  });

  it('escapes ampersands and quotes', () => {
    const html = renderLessonMarkdown('Tom & Jerry "best"');
    expect(html).toMatch(/&amp;/);
    expect(html).toMatch(/&quot;/);
  });
});
