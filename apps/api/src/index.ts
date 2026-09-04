import { Hono } from 'hono';
import type { Env } from './env';
import { requestId } from './middleware/requestId';
import { cors } from './middleware/cors';
import { errorHandler } from './middleware/errorHandler';
import authRouter from './modules/auth/routes';

const app = new Hono<{ Bindings: Env }>();
app.use('*', requestId());
app.use('*', cors());
app.use('*', errorHandler());
app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRouter);

export default app;
