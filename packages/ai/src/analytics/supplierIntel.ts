/** Supplier intelligence scoring. Pure, no IO. PO-lifecycle signals only. */
export interface SupplierScoreInput {
  supplierId: string;
  supplierName: string;
  total: number;
  accepted: number;
  rejected: number;
  cancelled: number;
  delivered: number;
  minPrice: number;
  minLead: number;
}

export interface SupplierScore {
  supplierId: string;
  supplierName: string;
  acceptRate: number;
  fulfilRate: number;
  badges: string[];
  overall: number;
}

export function scoreSuppliers(rows: SupplierScoreInput[]): SupplierScore[] {
  if (!rows.length) return [];
  const minPrice = Math.min(...rows.map((r) => r.minPrice));
  const minLead = Math.min(...rows.map((r) => r.minLead));
  const scored = rows.map((r) => {
    const acceptRate = r.total ? r.accepted / r.total : 0;
    const fulfilRate = r.total ? r.delivered / r.total : 0;
    const priceScore = minPrice > 0 ? minPrice / Math.max(1, r.minPrice) : 0;
    const overall = Math.round((0.4 * priceScore + 0.4 * acceptRate + 0.2 * fulfilRate) * 100) / 100;
    const badges: string[] = [];
    if (r.total >= 5 && acceptRate >= Math.max(...rows.map((x) => (x.total ? x.accepted / x.total : 0)))) {
      badges.push('most_reliable');
    }
    if (r.minPrice === minPrice) badges.push('best_price');
    if (r.minLead === minLead) badges.push('fastest');
    return { supplierId: r.supplierId, supplierName: r.supplierName, acceptRate, fulfilRate, badges, overall };
  });
  const best = [...scored].sort((a, b) => b.overall - a.overall)[0];
  if (best && !best.badges.includes('best_overall')) best.badges.push('best_overall');
  return scored.sort((a, b) => b.overall - a.overall);
}
