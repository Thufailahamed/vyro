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

export async function getSignedDocUrl(env: Env, r2Path: string, ttlSeconds = 600): Promise<string> {
  // Workers R2 signed URL API
  return env.CROSS_BORDER_DOCS.getSignedUrl(r2Path, { expiresIn: ttlSeconds });
}