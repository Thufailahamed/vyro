/** Map catalog product id → this supplier's existing offer id. */
export function listedOfferByProductId<T extends { id: string; productId: string }>(
  offers: T[],
): Map<string, string> {
  const map = new Map<string, string>();
  for (const offer of offers) {
    map.set(offer.productId, offer.id);
  }
  return map;
}

export function existingOfferForProduct<T extends { id: string; productId: string }>(
  offers: T[],
  productId: string,
): T | undefined {
  return offers.find((offer) => offer.productId === productId);
}
