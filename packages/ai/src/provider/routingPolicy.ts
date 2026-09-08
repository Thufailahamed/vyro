/**
 * Routing policy: data-driven decision over which model tier handles a given
 * workload. Pure, no IO. Operators tweak this list when the workload mix
 * shifts — no code changes needed downstream.
 *
 * `complexIntents`: intents whose narration benefits from Gemini-class
 * reasoning. Everything else narrates cheaply on Workers AI.
 *
 * `taskTiers`: pre-classified task kinds — the provider module maps
 * intent → task kind, then the policy maps task kind → tier.
 */

export type IntentTier = 'complex' | 'simple';

export interface RoutingPolicy {
  /** Intents whose narration should escalate to a stronger model. */
  complexIntents: ReadonlyArray<string>;
  /** Task kinds that always run on the strong tier regardless of intent. */
  complexTaskKinds: ReadonlyArray<string>;
}

export const DEFAULT_ROUTING_POLICY: RoutingPolicy = {
  complexIntents: [
    'savings',
    'usual_order',
    'supplier_recommend',
    'price_changes',
    'compare_suppliers',
  ],
  complexTaskKinds: ['narrate_complex', 'reasoning'],
};

export function classifyIntentTier(
  policy: RoutingPolicy,
  intent: string,
): IntentTier {
  return policy.complexIntents.includes(intent) ? 'complex' : 'simple';
}

export function classifyTaskTier(
  policy: RoutingPolicy,
  kind: string,
): IntentTier {
  return policy.complexTaskKinds.includes(kind) ? 'complex' : 'simple';
}

export function defaultPolicy(): RoutingPolicy {
  return DEFAULT_ROUTING_POLICY;
}
