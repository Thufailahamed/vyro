import type { ClassifyResult, ComponentEnvelope, Action } from '@vyro/ai';
import type { Env } from '../../../env';
import type { AiRepos } from './repos';
import { searchProductsHandler } from './searchProducts';
import { findCheapestHandler } from './findCheapest';
import { compareSuppliersHandler } from './compareSuppliers';
import { supplierRecommendHandler } from './supplierRecommend';
import { spendSummaryHandler } from './spendSummary';
import { productSpendHandler } from './productSpend';
import { supplierSpendHandler } from './supplierSpend';
import { savingsHandler } from './savings';
import { usualOrderHandler } from './usualOrder';
import { reorderHandler } from './reorder';
import { priceChangesHandler } from './priceChanges';
import { deliveryEstimateHandler } from './deliveryEstimate';

export interface IntentContext {
  env: Env;
  businessId: string;
  userId: string;
  classify: ClassifyResult;
}

export interface HandlerResult {
  components: ComponentEnvelope[];
  actions: Action[];
  rawSummary: Record<string, unknown>;
}

export type Handler = (ctx: IntentContext, repos: AiRepos) => Promise<HandlerResult>;

const stub: Handler = async () => ({ components: [], actions: [], rawSummary: {} });

export const HANDLERS: Record<ClassifyResult['intent'], Handler> = {
  search_products: searchProductsHandler,
  find_cheapest: findCheapestHandler,
  compare_suppliers: compareSuppliersHandler,
  supplier_recommend: supplierRecommendHandler,
  spend_summary: spendSummaryHandler,
  product_spend: productSpendHandler,
  supplier_spend: supplierSpendHandler,
  savings: savingsHandler,
  usual_order: usualOrderHandler,
  reorder: reorderHandler,
  price_changes: priceChangesHandler,
  delivery_estimate: deliveryEstimateHandler,
  clarify: stub,
};
