import { sqliteTable, text, integer } from 'drizzle-orm/sqlite-core';

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  email: text('email').notNull().unique(),
  emailVerifiedAt: integer('email_verified_at'),
  passwordHash: text('password_hash').notNull(),
  name: text('name').notNull(),
  phone: text('phone'),
  avatarUrl: text('avatar_url'),
  isPlatformAdmin: integer('is_platform_admin', { mode: 'boolean' }).notNull().default(false),
  status: text('status', { enum: ['active', 'suspended'] }).notNull().default('active'),
  createdAt: integer('created_at').notNull(),
  updatedAt: integer('updated_at').notNull(),
  deletedAt: integer('deleted_at'),
});

export type User = typeof users.$inferSelect;
export type NewUser = typeof users.$inferInsert;
