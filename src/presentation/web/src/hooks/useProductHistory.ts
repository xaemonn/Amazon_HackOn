/**
 * Tracks which product IDs the user has recently viewed.
 * Used to surface relevant marketplace listings at the top ("For You" picks).
 * Max 50 entries stored in localStorage; oldest entries dropped first.
 */

const KEY = 'slc_viewed_products';
const MAX = 50;

export function recordProductView(productId: string): void {
  try {
    const raw = localStorage.getItem(KEY);
    const list: string[] = raw ? (JSON.parse(raw) as string[]) : [];
    // Remove any existing entry for this product then prepend (most-recent first)
    const updated = [productId, ...list.filter((id) => id !== productId)].slice(0, MAX);
    localStorage.setItem(KEY, JSON.stringify(updated));
  } catch { /* ignore storage errors */ }
}

export function getViewedProductIds(): string[] {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Return a relevance score for a listing: lower = shown first. */
export function listingRelevanceScore(productId: string): number {
  const viewed = getViewedProductIds();
  const idx = viewed.indexOf(productId);
  return idx === -1 ? 9999 : idx; // 0 = most recently viewed
}
