export interface MembershipLike {
  businessId: string;
}

export function firstBusinessId(
  user: { memberships?: MembershipLike[] } | null | undefined,
): string | undefined {
  return user?.memberships?.[0]?.businessId;
}
