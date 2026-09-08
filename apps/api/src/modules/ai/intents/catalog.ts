import type { ClassifyResult, ComponentEnvelope, Action } from '@vyro/ai';
import type { Env } from '../../../env';
import type { AiRepos } from './repos';
import { searchProductsHandler } from './searchProducts';
import { findCheapestHandler } from './findCheapest';

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
  compare_suppliers: stub,
  supplier_recommend: stub,
  spend_summary: stub,
  product_spend: stub,
  supplier_spend: stub,
  savings: stub,
  usual_order: stub,
  reorder: stub,
  price_changes: stub,
  delivery_estimate: stub,
  clarify: stub,
};
