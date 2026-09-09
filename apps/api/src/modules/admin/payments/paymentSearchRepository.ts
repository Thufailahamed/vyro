import {
  and,
  desc,
  asc,
  eq,
  gte,
  inArray,
  like,
  lt,
  lte,
  or,
  type SQL,
} from 'drizzle-orm';
import {
  payments,
  purchaseOrders,
  businesses,
  suppliers,
  refunds,
  chargebacks,
  ledgerEntries,
} from '@vyro/db/schema';

export type PaymentStatus = 'pending' | 'confirmed' | 'failed' | 'refunded';
export type PaymentMethod = 'cash' | 'bank_transfer' | 'online';
export type PaymentRow = {
  id: string;
  purchaseOrderId: string;
  poNumber: string;
  businessId: string;
  businessName: string;
  supplierId: string;
  supplierName: string;
  amountCents: number;
  feeCents: number;
  netCents: number;
  currency: string;
  status: PaymentStatus;
  method: PaymentMethod;
  transactionReference: string | null;
  gatewayRef: string | null;
  paidAt: number | null;
  confirmedAt: number | null;
  createdAt: number;
};

export type PaymentSearchFilters = {
  q?: string;
  status?: PaymentStatus[];
  method?: PaymentMethod;
  businessId?: string;
  supplierId?: string;
  minCents?: number;
  maxCents?: number;
  from?: number;
  to?: number;
  cursor?: string;
  limit?: number;
  sort?: 'createdAt-desc' | 'createdAt-asc' | 'amount-desc' | 'amount-asc';
};

function decodeCursor(cursor: string): { createdAt: number; id: string } | null {
  try {
    const raw = Buffer.from(cursor, 'base64url').toString('utf8');
    const [tsStr, id] = raw.split(':');
    const ts = Number(tsStr);
    if (!Number.isFinite(ts) || !id) return null;
    return { createdAt: ts, id };
  } catch {
    return null;
  }
}

function encodeCursor(createdAt: number, id: string): string {
  return Buffer.from(`${createdAt}:${id}`, 'utf8').toString('base64url');
}

const SELECT_COLS = {
  id: payments.id,
  purchaseOrderId: payments.purchaseOrderId,
  poNumber: purchaseOrders.poNumber,
  businessId: purchaseOrders.businessId,
  businessName: businesses.name,
  supplierId: purchaseOrders.supplierId,
  supplierName: suppliers.name,
  amountCents: payments.amountCents,
  feeCents: payments.feeCents,
  netCents: payments.netCents,
  currency: payments.currency,
  status: payments.status,
  method: payments.method,
  transactionReference: payments.transactionReference,
  gatewayRef: payments.gatewayRef,
  paidAt: payments.paidAt,
  confirmedAt: payments.confirmedAt,
  createdAt: payments.createdAt,
} as const;

export async function searchPayments(
  db: any,
  filters: PaymentSearchFilters,
): Promise<{ rows: PaymentRow[]; nextCursor: string | null }> {
  const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
  const sort = filters.sort ?? 'createdAt-desc';

  const conds: SQL[] = [];

  if (filters.status && filters.status.length) {
    conds.push(inArray(payments.status, filters.status));
  }
  if (filters.method) {
    conds.push(eq(payments.method, filters.method));
  }
  if (filters.businessId) {
    conds.push(eq(purchaseOrders.businessId, filters.businessId));
  }
  if (filters.supplierId) {
    conds.push(eq(purchaseOrders.supplierId, filters.supplierId));
  }
  if (typeof filters.minCents === 'number') {
    conds.push(gte(payments.amountCents, filters.minCents));
  }
  if (typeof filters.maxCents === 'number') {
    conds.push(lte(payments.amountCents, filters.maxCents));
  }
  if (typeof filters.from === 'number') {
    conds.push(gte(payments.createdAt, filters.from));
  }
  if (typeof filters.to === 'number') {
    conds.push(lte(payments.createdAt, filters.to));
  }

  if (filters.q && filters.q.length > 0) {
    const q = filters.q.slice(0, 200);
    const ors: SQL[] = [like(payments.id, `${q}%`)];
    if (q.length <= 64) {
      ors.push(eq(payments.transactionReference, q));
      ors.push(eq(payments.gatewayRef, q));
    }
    conds.push(or(...ors)!);
  }

  if (filters.cursor) {
    const decoded = decodeCursor(filters.cursor);
    if (decoded) {
      conds.push(
        or(
          lt(payments.createdAt, decoded.createdAt),
          and(eq(payments.createdAt, decoded.createdAt), lt(payments.id, decoded.id)),
        )!,
      );
    }
  }

  const base = db
    .select(SELECT_COLS)
    .from(payments)
    .innerJoin(purchaseOrders, eq(payments.purchaseOrderId, purchaseOrders.id))
    .innerJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id));

  const ordered = (() => {
    switch (sort) {
      case 'createdAt-asc':
        return base.orderBy(asc(payments.createdAt), asc(payments.id));
      case 'amount-desc':
        return base.orderBy(desc(payments.amountCents), desc(payments.createdAt), desc(payments.id));
      case 'amount-asc':
        return base.orderBy(asc(payments.amountCents), asc(payments.createdAt), asc(payments.id));
      case 'createdAt-desc':
      default:
        return base.orderBy(desc(payments.createdAt), desc(payments.id));
    }
  })();

  const rows = (await (conds.length
    ? ordered.where(and(...conds))
    : ordered
  ).limit(limit + 1).all()) as PaymentRow[];

  const hasMore = rows.length > limit;
  const page = hasMore ? rows.slice(0, limit) : rows;
  const last = page[page.length - 1];
  return {
    rows: page,
    nextCursor: hasMore && last ? encodeCursor(last.createdAt, last.id) : null,
  };
}

export type DetailBundle = {
  payment: PaymentRow & {
    statusReason: string | null;
    idempotencyKey: string | null;
    gatewayPayload: string | null;
    confirmedByUserId: string | null;
    notes: string | null;
    updatedAt: number;
  };
  purchaseOrder: {
    id: string;
    poNumber: string;
    status: string;
    totalCents: number;
    createdAt: number;
    deliveryAt: number | null;
  } | null;
  business: { id: string; name: string; email: string | null } | null;
  supplier: { id: string; name: string; email: string | null } | null;
  refunds: Array<{
    id: string;
    paymentId: string;
    amountCents: number;
    reason: string | null;
    status: string;
    requestedByUserId: string;
    processedAt: number | null;
    failureReason: string | null;
    createdAt: number;
  }>;
  chargebacks: Array<{
    id: string;
    paymentId: string;
    reason: string;
    status: 'open' | 'resolved' | 'cancelled';
    resolvedBy: string | null;
    resolvedAt: number | null;
    notes: string | null;
    createdAt: number;
  }>;
  ledger: Array<{
    id: string;
    accountType: string;
    accountId: string;
    direction: 'debit' | 'credit';
    amountCents: number;
    currency: string;
    refType: string;
    refId: string;
    description: string;
    createdAt: number;
  }>;
};

export async function getPaymentDetailBundle(db: any, paymentId: string): Promise<DetailBundle | null> {
  const head = await db
    .select({
      ...SELECT_COLS,
      statusReason: payments.statusReason,
      idempotencyKey: payments.idempotencyKey,
      gatewayPayload: payments.gatewayPayload,
      confirmedByUserId: payments.confirmedByUserId,
      notes: payments.notes,
      updatedAt: payments.updatedAt,
    })
    .from(payments)
    .innerJoin(purchaseOrders, eq(payments.purchaseOrderId, purchaseOrders.id))
    .innerJoin(businesses, eq(purchaseOrders.businessId, businesses.id))
    .innerJoin(suppliers, eq(purchaseOrders.supplierId, suppliers.id))
    .where(eq(payments.id, paymentId))
    .get();

  if (!head) return null;

  const refundIdsRows = await db
    .select({ id: refunds.id })
    .from(refunds)
    .where(eq(refunds.paymentId, paymentId))
    .all();
  const refundIds = refundIdsRows.map((r: { id: string }) => r.id);

  const ledgerQuery = refundIds.length
    ? db
        .select({
          id: ledgerEntries.id,
          accountType: ledgerEntries.accountType,
          accountId: ledgerEntries.accountId,
          direction: ledgerEntries.direction,
          amountCents: ledgerEntries.amountCents,
          currency: ledgerEntries.currency,
          refType: ledgerEntries.refType,
          refId: ledgerEntries.refId,
          description: ledgerEntries.description,
          createdAt: ledgerEntries.createdAt,
        })
        .from(ledgerEntries)
        .where(
          or(
            and(eq(ledgerEntries.refType, 'payment'), eq(ledgerEntries.refId, paymentId)),
            and(eq(ledgerEntries.refType, 'refund'), inArray(ledgerEntries.refId, refundIds)),
          )!,
        )
        .orderBy(desc(ledgerEntries.createdAt))
    : db
        .select({
          id: ledgerEntries.id,
          accountType: ledgerEntries.accountType,
          accountId: ledgerEntries.accountId,
          direction: ledgerEntries.direction,
          amountCents: ledgerEntries.amountCents,
          currency: ledgerEntries.currency,
          refType: ledgerEntries.refType,
          refId: ledgerEntries.refId,
          description: ledgerEntries.description,
          createdAt: ledgerEntries.createdAt,
        })
        .from(ledgerEntries)
        .where(and(eq(ledgerEntries.refType, 'payment'), eq(ledgerEntries.refId, paymentId)))
        .orderBy(desc(ledgerEntries.createdAt));

  const [poRow, bizRow, supRow, refundRows, cbRows, ledgerRows] = await Promise.all([
    db
      .select({
        id: purchaseOrders.id,
        poNumber: purchaseOrders.poNumber,
        status: purchaseOrders.status,
        totalCents: purchaseOrders.totalCents,
        createdAt: purchaseOrders.createdAt,
        deliveryAt: purchaseOrders.deliveredAt,
      })
      .from(purchaseOrders)
      .where(eq(purchaseOrders.id, head.purchaseOrderId))
      .get(),
    db
      .select({ id: businesses.id, name: businesses.name, email: businesses.email })
      .from(businesses)
      .where(eq(businesses.id, head.businessId))
      .get(),
    db
      .select({ id: suppliers.id, name: suppliers.name, email: suppliers.email })
      .from(suppliers)
      .where(eq(suppliers.id, head.supplierId))
      .get(),
    db
      .select({
        id: refunds.id,
        paymentId: refunds.paymentId,
        amountCents: refunds.amountCents,
        reason: refunds.reason,
        status: refunds.status,
        requestedByUserId: refunds.requestedByUserId,
        processedAt: refunds.processedAt,
        failureReason: refunds.failureReason,
        createdAt: refunds.createdAt,
      })
      .from(refunds)
      .where(eq(refunds.paymentId, paymentId))
      .orderBy(desc(refunds.createdAt))
      .all(),
    db
      .select({
        id: chargebacks.id,
        paymentId: chargebacks.paymentId,
        reason: chargebacks.reason,
        status: chargebacks.status,
        resolvedBy: chargebacks.resolvedBy,
        resolvedAt: chargebacks.resolvedAt,
        notes: chargebacks.notes,
        createdAt: chargebacks.createdAt,
      })
      .from(chargebacks)
      .where(eq(chargebacks.paymentId, paymentId))
      .orderBy(desc(chargebacks.createdAt))
      .all(),
    ledgerQuery.all(),
  ]);

  return {
    payment: head,
    purchaseOrder: poRow ?? null,
    business: bizRow ?? null,
    supplier: supRow ?? null,
    refunds: refundRows ?? [],
    chargebacks: cbRows ?? [],
    ledger: ledgerRows ?? [],
  };
}

export async function listPaymentOptions(db: any): Promise<{
  businesses: Array<{ id: string; name: string }>;
  suppliers: Array<{ id: string; name: string }>;
}> {
  const [biz, sup] = await Promise.all([
    db
      .select({ id: businesses.id, name: businesses.name })
      .from(businesses)
      .orderBy(asc(businesses.name))
      .all(),
    db
      .select({ id: suppliers.id, name: suppliers.name })
      .from(suppliers)
      .orderBy(asc(suppliers.name))
      .all(),
  ]);
  return { businesses: biz ?? [], suppliers: sup ?? [] };
}
