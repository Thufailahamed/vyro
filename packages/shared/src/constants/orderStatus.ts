export const OrderStatus = {
  PENDING: 'pending',
  ACCEPTED: 'accepted',
  REJECTED: 'rejected',
  PREPARING: 'preparing',
  READY_FOR_PICKUP: 'ready_for_pickup',
  OUT_FOR_DELIVERY: 'out_for_delivery',
  DELIVERED: 'delivered',
  COMPLETED: 'completed',
  CANCELLED: 'cancelled',
  DISPUTED: 'disputed',
} as const;
export type OrderStatus = (typeof OrderStatus)[keyof typeof OrderStatus];

export const ORDER_TRANSITIONS: Record<OrderStatus, readonly OrderStatus[]> = {
  pending: ['accepted', 'rejected', 'cancelled'],
  accepted: ['preparing', 'cancelled'],
  preparing: ['ready_for_pickup', 'cancelled'],
  ready_for_pickup: ['out_for_delivery'],
  out_for_delivery: ['delivered'],
  delivered: ['completed', 'disputed'],
  completed: ['disputed'],
  rejected: [],
  cancelled: [],
  disputed: [],
};

export type ActorRole = 'business' | 'supplier' | 'admin' | 'system';

export interface TransitionRule {
  from: OrderStatus;
  to: OrderStatus;
  actors: readonly ActorRole[];
}

export const TRANSITION_RULES: readonly TransitionRule[] = [
  { from: 'pending', to: 'accepted', actors: ['supplier'] },
  { from: 'pending', to: 'rejected', actors: ['supplier'] },
  { from: 'pending', to: 'cancelled', actors: ['business'] },
  { from: 'accepted', to: 'preparing', actors: ['supplier'] },
  { from: 'accepted', to: 'cancelled', actors: ['business'] },
  { from: 'preparing', to: 'ready_for_pickup', actors: ['supplier'] },
  { from: 'preparing', to: 'cancelled', actors: ['business'] },
  { from: 'ready_for_pickup', to: 'out_for_delivery', actors: ['supplier'] },
  { from: 'out_for_delivery', to: 'delivered', actors: ['supplier'] },
  { from: 'delivered', to: 'completed', actors: ['business'] },
  { from: 'delivered', to: 'disputed', actors: ['admin', 'business'] },
  { from: 'completed', to: 'disputed', actors: ['admin', 'business'] },
];

export function canTransition(from: OrderStatus, to: OrderStatus, actor: ActorRole): boolean {
  return TRANSITION_RULES.some((r) => r.from === from && r.to === to && r.actors.includes(actor));
}
