import { describe, it, expect } from 'vitest';
import {
  ConversationalChatRequestSchema,
  ConversationalConfirmRequestSchema,
} from '@vyro/ai';

describe('conversational routes schema validation', () => {
  it('accepts valid message body', () => {
    const res = ConversationalChatRequestSchema.safeParse({
      message: 'order 5 bags rice',
      businessId: 'biz-1',
    });
    expect(res.success).toBe(true);
  });

  it('rejects empty message body', () => {
    const res = ConversationalChatRequestSchema.safeParse({
      message: '',
    });
    expect(res.success).toBe(false);
  });

  it('validates confirm order payload', () => {
    const res = ConversationalConfirmRequestSchema.safeParse({
      draftId: 'd-1',
      businessId: 'b-1',
    });
    expect(res.success).toBe(true);
  });
});
