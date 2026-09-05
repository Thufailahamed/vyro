import { Hono } from 'hono';
import type { Env } from './env';
import { requestId } from './middleware/requestId';
import { cors } from './middleware/cors';
import { securityHeaders } from './middleware/securityHeaders';
import { rateLimit } from './middleware/rateLimit';
import { verifyCsrf } from './middleware/verifyCsrf';
import { accessLog } from './middleware/accessLog';
import { cacheControl } from './middleware/cacheControl';
import { errorEnvelope, HttpError } from './lib/errors';
import { logger } from './lib/logger';
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
import refundsRouter from './modules/refunds/routes';
import payoutsRouter, { payoutsAdminRouter } from './modules/payouts';
import invoicesRouter from './modules/invoices';
import webhooksRouter from './modules/webhooks';
import accountsRouter from './modules/accounts';
import notificationRouter from './modules/notifications/routes';
import adminRouter from './modules/admin/routes';
import userSettingsRouter from './modules/settings/routes';
import supplierSettingsRouter from './modules/settings/supplier';
import supplierCustomersRouter from './modules/suppliers/customers';
import adminSettingsRouter from './modules/settings/admin';
import businessTypesRouter from './modules/businessTypes/routes';
import supplierTypesRouter from './modules/supplierTypes/routes';
import supplierAnalyticsRouter from './modules/analytics/supplier/routes';
import adminAnalyticsRouter from './modules/analytics/admin/routes';
import adminUsersRouter from './modules/admin/users';
import adminSupplierDetailRouter from './modules/admin/supplierDetail';
import adminBusinessDetailRouter from './modules/admin/businessDetail';
import disputeRouter from './modules/admin/disputes';
import adminInvitesRouter from './modules/admin/invites/routes';
import adminAuditRouter from './modules/admin/audit/routes';
import businessAnalyticsRouter from './modules/analytics/business/routes';
import homeRouter from './modules/home/routes';
import cspReportRouter from './modules/cspReport/routes';

const app = new Hono<{ Bindings: Env }>();
app.use('*', requestId());
app.use('*', accessLog());
app.use('*', securityHeaders());
app.use('*', cors());
app.use('*', rateLimit({ key: 'global', limit: 60, window: 60 }));
app.use('/api/auth/*', rateLimit({ key: 'auth', limit: 20, window: 60 }));
app.use('/api/auth/login', rateLimit({ key: 'auth-login', limit: 5, window: 60 }));
app.use('/api/auth/forgot-password', rateLimit({ key: 'auth-forgot', limit: 5, window: 60 }));
app.use('/api/auth/2fa/*', rateLimit({ key: 'auth-2fa', limit: 10, window: 60 }));
app.use('/api/categories/*', cacheControl({ public: true, maxAge: 3600 }));
app.use('/api/products/*', cacheControl({ public: true, maxAge: 300 }));
app.use('/api/*', verifyCsrf());

app.onError((err, c) => {
  const env = errorEnvelope(err);
  const ctx = c.get('ctx') as { userId?: string } | undefined;
  const path = (() => { try { return new URL(c.req.url).pathname; } catch { return '?'; } })();
  logger.error('http.error', {
    method: c.req.method,
    path,
    status: env.status,
    requestId: c.get('requestId'),
    ...(ctx?.userId ? { userId: ctx.userId } : {}),
    err: err instanceof Error ? { name: err.name, message: err.message, stack: err.stack } : String(err),
  });
  return c.json(env.body, env.status as 400 | 401 | 403 | 404 | 409 | 429 | 500);
});

void HttpError;

import healthRouter from './modules/health/routes';
app.route('/api/health', healthRouter);
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
app.route('/api/payments', refundsRouter);
app.route('/api/payouts', payoutsRouter);
app.route('/api/admin/payouts', payoutsAdminRouter);
app.route('/api/invoices', invoicesRouter);
app.route('/api/webhooks', webhooksRouter);
app.route('/api/accounts', accountsRouter);
app.route('/api/notifications', notificationRouter);
app.route('/api/admin', adminRouter);
app.route('/api/settings', userSettingsRouter);
app.route('/api/suppliers', supplierSettingsRouter);
app.route('/api/suppliers', supplierCustomersRouter);
app.route('/api/admin/settings', adminSettingsRouter);
app.route('/api/businesses/types', businessTypesRouter);
app.route('/api/suppliers/types', supplierTypesRouter);
app.route('/api/analytics/supplier', supplierAnalyticsRouter);
app.route('/api/analytics/admin', adminAnalyticsRouter);
app.route('/api/admin/users', adminUsersRouter);
app.route('/api/admin', adminSupplierDetailRouter);
app.route('/api/admin', adminBusinessDetailRouter);
app.route('/api/admin', disputeRouter);
app.route('/api/admin', adminInvitesRouter);
app.route('/api/admin', adminAuditRouter);
app.route('/api/analytics/business', businessAnalyticsRouter);
app.route('/api/home', homeRouter);
app.route('/api/csp-report', cspReportRouter);

export default app;
