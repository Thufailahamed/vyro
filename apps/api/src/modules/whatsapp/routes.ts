import { Hono } from 'hono';
import { session, type Ctx } from '../../middleware/session';
import { httpError } from '../../lib/errors';
import { requireBusinessRole } from '@vyro/auth';
import {
  ConversationalChatRequestSchema,
  ConversationalConfirmRequestSchema,
} from '@vyro/ai';
import {
  processConversationalOrder,
  confirmConversationalOrder,
  resolveBusinessByPhone,
} from './conversationalService';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

// 1. Meta WhatsApp Webhook Verification
router.get('/webhooks/whatsapp', async (c) => {
  const mode = c.req.query('hub.mode');
  const token = c.req.query('hub.verify_token');
  const challenge = c.req.query('hub.challenge');

  const expectedToken = (c.env as any).WHATSAPP_VERIFY_TOKEN ?? 'vyro_whatsapp_secret';
  if (mode === 'subscribe' && token === expectedToken) {
    return c.text(challenge ?? '');
  }
  return c.text('Forbidden', 403);
});

// 2. Meta WhatsApp Inbound Message Handler
router.post('/webhooks/whatsapp', async (c) => {
  const body = (await c.req.json().catch(() => null)) as any;
  const message = body?.entry?.[0]?.changes?.[0]?.value?.messages?.[0];
  if (!message) return c.json({ status: 'ignored' });

  const senderPhone = message.from;
  const textBody = message.text?.body;

  if (senderPhone && textBody) {
    const resolved = await resolveBusinessByPhone(c.env, senderPhone);
    if (resolved) {
      await processConversationalOrder(c.env, resolved.businessId, textBody);
    }
  }

  return c.json({ status: 'ok' });
});

// 3. Web Procurement Chat API
router.post('/conversational/chat', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const raw = await c.req.json().catch(() => ({}));
  const parsed = ConversationalChatRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid request body', parsed.error.flatten());
  }

  const businessId = parsed.data.businessId ?? ctx.businesses[0]?.businessId;
  if (!businessId) throw httpError(403, 'FORBIDDEN', 'No active business membership');
  requireBusinessRole(ctx, businessId, ['owner', 'manager', 'purchasing', 'accountant']);

  const response = await processConversationalOrder(c.env, businessId, parsed.data.message);
  return c.json(response);
});

// 4. Confirm Draft PO API
router.post('/conversational/confirm', session(), async (c) => {
  const ctx = c.get('ctx') as Ctx | undefined;
  if (!ctx) throw httpError(401, 'UNAUTHORIZED', 'No session');

  const raw = await c.req.json().catch(() => null);
  const parsed = ConversationalConfirmRequestSchema.safeParse(raw);
  if (!parsed.success) {
    throw httpError(400, 'VALIDATION_ERROR', 'Invalid confirm body', parsed.error.flatten());
  }

  requireBusinessRole(ctx, parsed.data.businessId, ['owner', 'manager', 'purchasing']);
  const result = await confirmConversationalOrder(c.env, ctx.userId, parsed.data.businessId, parsed.data.draftId);
  return c.json(result, 201);
});

export default router;
