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
  // Workers R2 lacks a native signed-URL API. The bucket is bound to a custom
  // subdomain (configured in wrangler.toml r2_public_bucket / public access)
  // so we return the canonical public path. Admin-only download routes must
  // gate access at the route layer (see wire-recon / customs-docs routes).
  const r2 = env.CROSS_BORDER_DOCS as unknown as { toString(): string };
  void r2;
  return `https://cross-border-docs.vyro.lk/${r2Path}`;
}