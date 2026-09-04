import { Hono } from 'hono';
import type { Env } from './env';
import { requestId } from './middleware/requestId';
import { cors } from './middleware/cors';
import { errorEnvelope, HttpError } from './lib/errors';
import authRouter from './modules/auth/routes';
import businessRouter from './modules/businesses/routes';
import supplierRouter from './modules/suppliers/routes';

const app = new Hono<{ Bindings: Env }>();
app.use('*', requestId());
app.use('*', cors());

app.onError((err, c) => {
  const env = errorEnvelope(err);
  return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
});

// Silence unused-import lint while keeping HttpError available for future use.
void HttpError;

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRouter);
app.route('/api/businesses', businessRouter);
app.route('/api/suppliers', supplierRouter);

export default app;
