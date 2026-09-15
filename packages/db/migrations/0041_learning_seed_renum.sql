-- 0041_learning_seed_renum.sql
-- Renumber learning_lessons.order_index from 1-based (initial seed bug) to 0-based
-- so the UI's `Lesson {orderIndex + 1}` renders 1..N correctly.

UPDATE learning_lessons SET order_index = order_index - 1
  WHERE id IN (
    'lc-lesson-1','lc-lesson-2','lc-lesson-3','lc-lesson-4',
    'lc-lesson-5','lc-lesson-6','lc-lesson-7','lc-lesson-8'
  );
