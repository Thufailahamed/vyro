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
import { priceWatchHandler } from './priceWatch';
import { priceAnomalyHandler } from './priceAnomaly';
import { supplierIntelHandler } from './supplierIntel';
import { procurementHealthHandler } from './procurementHealth';
import { spendForecastHandler } from './spendForecast';
import { categoryIntelHandler } from './categoryIntel';
import { insightsFeedHandler } from './insightsFeed';
import { clarifyHandler } from './clarify';
import { procurementPlanHandler } from './procurementPlan';
import { budgetOptimizeHandler } from './budgetOptimize';
import { simulateSupplierSwitchHandler } from './simulateSupplierSwitch';
import { categorizeExpensesHandler } from './categorizeExpenses';

export interface IntentContext {
  env: Env;
  businessId: string;
  userId: string;
  classify: ClassifyResult;
  /** Raw user prompt (post prompt-guard). Available to handlers for NL parsing. */
  prompt?: string;
}

export interface HandlerResult {
  components: ComponentEnvelope[];
  actions: Action[];
  rawSummary: Record<string, unknown>;
}

export type Handler = (ctx: IntentContext, repos: AiRepos) => Promise<HandlerResult>;

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
  price_watch: priceWatchHandler,
  price_anomaly: priceAnomalyHandler,
  supplier_intel: supplierIntelHandler,
  procurement_health: procurementHealthHandler,
  spend_forecast: spendForecastHandler,
  category_intel: categoryIntelHandler,
  insights_feed: insightsFeedHandler,
  clarify: clarifyHandler,
  procurement_plan: procurementPlanHandler,
  budget_optimize: budgetOptimizeHandler,
  simulate_supplier_switch: simulateSupplierSwitchHandler,
  categorize_expenses: categorizeExpensesHandler,
};
