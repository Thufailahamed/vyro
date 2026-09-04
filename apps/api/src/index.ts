import { Hono } from 'hono';
import type { Env } from './env';
import { requestId } from './middleware/requestId';
import { cors } from './middleware/cors';
import { errorEnvelope, HttpError } from './lib/errors';
import authRouter from './modules/auth/routes';
import businessRouter from './modules/businesses/routes';
import supplierRouter from './modules/suppliers/routes';
import categoryRouter from './modules/categories/routes';
import productRouter from './modules/products/routes';
import supplierProductRouter from './modules/supplierProducts/routes';
import searchRouter from './modules/search/routes';
import compareRouter from './modules/search/compare';
import cartRouter from './modules/cart/routes';
import poRouter from './modules/purchaseOrders/routes';
import deliveryRouter from './modules/deliveries/routes';
import paymentRouter from './modules/payments/routes';
import notificationRouter from './modules/notifications/routes';
import adminRouter from './modules/admin/routes';
import userSettingsRouter from './modules/settings/routes';
import supplierSettingsRouter from './modules/settings/supplier';
import adminSettingsRouter from './modules/settings/admin';
import businessTypesRouter from './modules/businessTypes/routes';
import supplierTypesRouter from './modules/supplierTypes/routes';
import supplierAnalyticsRouter from './modules/analytics/supplier/routes';

const app = new Hono<{ Bindings: Env }>();
app.use('*', requestId());
app.use('*', cors());

app.onError((err, c) => {
  const env = errorEnvelope(err);
  return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
});

void HttpError;

app.get('/api/health', (c) => c.json({ ok: true }));
app.route('/api/auth', authRouter);
app.route('/api/businesses', businessRouter);
app.route('/api/suppliers', supplierRouter);
app.route('/api/categories', categoryRouter);
app.route('/api/products', productRouter);
app.route('/api/supplier-products', supplierProductRouter);
app.route('/api/search', searchRouter);
app.route('/api/search', compareRouter);
app.route('/api/cart', cartRouter);
app.route('/api/purchase-orders', poRouter);
app.route('/api/deliveries', deliveryRouter);
app.route('/api/payments', paymentRouter);
app.route('/api/notifications', notificationRouter);
app.route('/api/admin', adminRouter);
app.route('/api/settings', userSettingsRouter);
app.route('/api/suppliers', supplierSettingsRouter);
app.route('/api/admin/settings', adminSettingsRouter);
app.route('/api/businesses/types', businessTypesRouter);
app.route('/api/suppliers/types', supplierTypesRouter);
app.route('/api/analytics/supplier', supplierAnalyticsRouter);

export default app;
