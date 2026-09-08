import type { ClassifyResult, ComponentEnvelope, Action } from '@vyro/ai';
import type { Env } from '../../../env';

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

export type Handler = (ctx: IntentContext) => Promise<HandlerResult>;

export const HANDLERS: Record<ClassifyResult['intent'], Handler> = {} as Record<
  ClassifyResult['intent'],
  Handler
>;
