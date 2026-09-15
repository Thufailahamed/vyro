-- 0041_learning_seed_renum_down.sql
-- Reverse 0041: bump order_index back to 1-based.

UPDATE learning_lessons SET order_index = order_index + 1
  WHERE id IN (
    'lc-lesson-1','lc-lesson-2','lc-lesson-3','lc-lesson-4',
    'lc-lesson-5','lc-lesson-6','lc-lesson-7','lc-lesson-8'
  );
