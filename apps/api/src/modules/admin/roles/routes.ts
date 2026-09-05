import { Hono } from 'hono';
// placeholder — full implementation in T1.8
const router = new Hono();
router.get('/_stub', (c) => c.json({ ok: true, stub: true }));
export default router;
