import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';
import { MemoryRouter } from 'react-router-dom';

vi.mock('../../src/admin/learning/hooks/useAdminLearning', () => ({
  useAdminLessons: () => ({ data: { lessons: [] }, isLoading: false }),
  useAdminDeleteLesson: () => ({ mutate: vi.fn() }),
}));

import { LessonsAdmin } from '../../src/admin/learning/LessonsAdmin';

describe('LessonsAdmin', () => {
  it('renders empty state when no lessons', () => {
    const html = renderToStaticMarkup(
      createElement(MemoryRouter, null, createElement(LessonsAdmin)),
    );
    expect(html).toMatch(/Training center — Lessons/);
    expect(html).toMatch(/No lessons yet/);
    expect(html).toMatch(/\+ New lesson/);
  });
});
