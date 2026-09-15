export type LearningErrorCode =
  | 'lesson_not_found'
  | 'quiz_not_found'
  | 'quiz_invalid_answer'
  | 'supplier_not_found';

export class LearningError extends Error {
  constructor(public code: LearningErrorCode, message?: string) {
    super(message ?? code);
  }
}

export class TrainingRequiredError extends Error {
  constructor(public missing: Array<{ slug: string; title: string }>) {
    super('TRAINING_REQUIRED');
  }
}