import { Hono } from 'hono';
import { sql } from 'drizzle-orm';
import { getDb } from '@vyro/db';
import { suppliers, products } from '@vyro/db/schema';
import type { Env } from '../../env';

const router = new Hono<{ Bindings: Env }>();

router.get('/feed', async (c) => {
  const db = getDb(c.env.DB);
  const featured = await db
    .select()
    .from(products)
    .orderBy(sql`${products.createdAt} desc`)
    .limit(8)
    .all();
  const verified = await db
    .select()
    .from(suppliers)
    .where(sql`${suppliers.status} = 'active'`)
    .limit(8)
    .all();
  return c.json({
    featuredProducts: featured,
    verifiedSuppliers: verified,
    trustStats: {
      districtsCovered: 25,
      lifetimeGmvCents: 10_000_000_00,
      activeBusinesses: 0,
      activeSuppliers: verified.length,
    },
    journeySteps: [
      { title: 'Sign up', body: 'Create your free VYRO account in under a minute.' },
      { title: 'Browse', body: 'Discover verified suppliers across Sri Lanka.' },
      { title: 'Order', body: 'Compare offers, place POs, track in real-time.' },
    ],
    faq: [
      {
        q: 'How does VYRO verify suppliers?',
        a: 'We check business registration and trade references before activation.',
      },
      {
        q: 'What payment methods are supported?',
        a: 'Cash on delivery and bank transfer today; gateway integrations rolling out.',
      },
    ],
  });
});

export default router;
