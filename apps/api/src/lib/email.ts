// Back-compat barrel. The full implementation now lives in `./email/`
// (client, templates, rateLimit, webhook, types). All existing imports of
// `./email` continue to work unchanged.
export * from './email/index';
