import { insertCustomsDoc } from './repository';
import type { Db } from '@vyro/db';
import type { Env } from '../../env';

const BUCKET_PREFIX = 'cross-border-docs';

export type DocKind = 'invoice' | 'packing-list' | 'coo' | 'awb' | 'bl';

export async function uploadCustomsDoc(args: {
  db: Db;
  env: Env;
  orderId: string;
  kind: DocKind;
  bytes: ArrayBuffer;
  uploadedBy: string;
}): Promise<{ id: string; r2Path: string }> {
  const docId = crypto.randomUUID();
  const r2Path = `${BUCKET_PREFIX}/${args.orderId}/${args.kind}-${docId}.pdf`;
  await args.env.CROSS_BORDER_DOCS.put(r2Path, args.bytes, {
    httpMetadata: { contentType: 'application/pdf' },
  });
  const row = await insertCustomsDoc(args.db, {
    orderId: args.orderId,
    kind: args.kind,
    r2Path,
    uploadedBy: args.uploadedBy,
  });
  return { id: row.id, r2Path };
}

export async function getSignedDocUrl(env: Env, r2Path: string): Promise<string> {
  // Workers R2 lacks a native signed-URL API. Prefer the R2_PUBLIC_BASE env
  // var (set in wrangler.toml) so the subdomain isn't hardcoded (api-011 audit).
  // Falls back to the historical subdomain for local dev and prior deploys.
  const base =
    (env as { R2_PUBLIC_BASE?: string }).R2_PUBLIC_BASE ??
    (env as { CROSS_BORDER_DOCS_BASE?: string }).CROSS_BORDER_DOCS_BASE ??
    'https://cross-border-docs.vyro.lk';
  void env.CROSS_BORDER_DOCS as unknown as { toString(): string };
  return `${base.replace(/\/$/, '')}/${r2Path.replace(/^\//, '')}`;
}