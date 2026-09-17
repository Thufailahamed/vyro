import { describe, expect, it, vi } from 'vitest';
import { renderToStaticMarkup } from 'react-dom/server';
import { createElement } from 'react';

// Mock the hook to avoid QueryClient/provider setup
vi.mock('../../src/supplier/learning/hooks/useLearning', () => ({
  useSubmitQuiz: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));

import { QuizForm } from '../../src/supplier/learning/QuizForm';

describe('QuizForm', () => {
  const questions = [
    {
      id: 'q1',
      prompt: 'What is 2 + 2?',
      options: [
        { id: 'a', label: '3' },
        { id: 'b', label: '4' },
        { id: 'c', label: '5' },
      ],
    },
    {
      id: 'q2',
      prompt: 'Capital of LK?',
      options: [
        { id: 'x', label: 'Colombo' },
        { id: 'y', label: 'Kandy' },
      ],
    },
  ];

  it('renders prompt + option labels', () => {
    const html = renderToStaticMarkup(
      createElement(QuizForm, { supplierId: 's1', slug: 'test', questions }),
    );
    expect(html).toMatch(/What is 2 \+ 2\?/);
    expect(html).toMatch(/Capital of LK\?/);
    expect(html).toMatch(/>3<\/span>/);
    expect(html).toMatch(/>4<\/span>/);
    expect(html).toMatch(/>Colombo<\/span>/);
    expect(html).toMatch(/>Kandy<\/span>/);
  });

  it('renders Submit button', () => {
    const html = renderToStaticMarkup(
      createElement(QuizForm, { supplierId: 's1', slug: 'test', questions }),
    );
    expect(html).toMatch(/Submit quiz/);
  });

  it('emits radio inputs per question-option pair', () => {
    const html = renderToStaticMarkup(
      createElement(QuizForm, { supplierId: 's1', slug: 'test', questions }),
    );
    const radioCount = (html.match(/type="radio"/g) ?? []).length;
    expect(radioCount).toBe(5); // 3 + 2
  });
});
