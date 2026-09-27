import { Hono } from 'hono';
import type { Env } from '../../env';
import paymentsLkRouter from './paymentslk';
import resendRouter from './resend';

const router = new Hono<{ Bindings: Env }>();

router.route('/', paymentsLkRouter);
router.route('/', resendRouter);

export default router;
