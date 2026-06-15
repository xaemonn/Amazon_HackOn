const TOKEN_KEY = 'slc_token';

export function getToken(): string | null {
  return localStorage.getItem(TOKEN_KEY);
}

export function setToken(token: string): void {
  localStorage.setItem(TOKEN_KEY, token);
}

export function clearToken(): void {
  localStorage.removeItem(TOKEN_KEY);
}

async function apiFetch<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {}),
    ...(options.headers as Record<string, string> | undefined ?? {}),
  };

  const res = await fetch(`/api${path}`, { ...options, headers });

  if (!res.ok) {
    const body = await res.json().catch(() => ({})) as Record<string, unknown>;
    throw new Error((body.error as string) || `HTTP ${res.status}`);
  }

  return res.json() as Promise<T>;
}

// ─── Auth ─────────────────────────────────────────────────────────────────────

export interface Address {
  street: string;
  city: string;
  state: string;
  pincode: string;
}

export interface SizeProfile {
  shoeSize?: number | null;
  apparelSize?: string | null;
}

export interface AuthCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: Address | null;
  sizeProfile?: SizeProfile | null;
}

export async function apiSignup(name: string, email: string, password: string): Promise<{ token: string; customer: AuthCustomer }> {
  return apiFetch('/auth/signup', {
    method: 'POST',
    body: JSON.stringify({ name, email, password }),
  });
}

export async function apiLogin(email: string, password: string): Promise<{ token: string; customer: AuthCustomer }> {
  return apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ email, password }),
  });
}

export async function apiDemoLogin(): Promise<{ token: string; customer: AuthCustomer }> {
  return apiFetch('/auth/demo', { method: 'POST' });
}

export async function apiMe(): Promise<AuthCustomer> {
  return apiFetch('/auth/me');
}

export async function apiLogout(): Promise<void> {
  await apiFetch('/auth/logout', { method: 'POST' });
}

export async function apiUpdateProfile(updates: {
  name?: string;
  phone?: string;
  address?: Address;
  sizeProfile?: SizeProfile;
}): Promise<AuthCustomer> {
  return apiFetch('/auth/profile', {
    method: 'PATCH',
    body: JSON.stringify(updates),
  });
}

// ─── Catalog ─────────────────────────────────────────────────────────────────

export interface Product {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  emoji: string;
  images: string[];
  description: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
  badge?: string;
  originalPrice?: number;
  imageUrl?: string;
}

export async function apiGetCatalog(params?: {
  search?: string;
  category?: string;
}): Promise<{ products: Product[]; categories: string[]; total: number }> {
  const query = new URLSearchParams();
  if (params?.search) query.set('search', params.search);
  if (params?.category) query.set('category', params.category);
  const qs = query.toString();
  return apiFetch(`/catalog${qs ? `?${qs}` : ''}`);
}

export async function apiGetProduct(id: string): Promise<Product> {
  return apiFetch(`/catalog/${id}`);
}

// ─── Orders ──────────────────────────────────────────────────────────────────

export interface OrderItemData {
  id: string;
  orderId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  deliveryDate: string;
  deliveryStatus: string;
  refundStatus: {
    code: string;
    amount: number | null;
    currency: string | null;
  };
}

export interface OrderData {
  id: string;
  customerId: string;
  placedDate: string;
  status: string;
  paymentType: string;
  items: OrderItemData[];
}

export async function apiGetOrders(): Promise<{ orders: OrderData[] }> {
  return apiFetch('/orders');
}

export async function apiGetOrder(id: string): Promise<OrderData> {
  return apiFetch(`/orders/${id}`);
}

export async function apiCheckout(
  items: Array<{ productId: string; quantity: number }>,
  paymentType: 'prepaid' | 'cod' = 'prepaid',
): Promise<OrderData> {
  return apiFetch('/orders/checkout', {
    method: 'POST',
    body: JSON.stringify({ items, paymentType }),
  });
}

// ─── Resale Marketplace ──────────────────────────────────────────────────────

export type ResaleGrade = 'A' | 'B' | 'C';
export type ResaleListingType =
  | 'direct_transfer'
  | 'returned_discounted'
  | 'refurbished_discounted';
export type ResaleListingStatus =
  | 'active'
  | 'sold'
  | 'returned_to_warehouse'
  | 'keep_offer_extended'
  | 'kept_by_customer'
  | 'cancelled';

export interface ResaleListing {
  id: string;
  returnRequestId: string;
  productId: string;
  productName: string;
  imageUrl: string | null;
  returnPhotoUrls: string[];
  conditionReasoning: string | null;
  defects: Array<{ location: string; severity: string; description: string }>;
  grade: ResaleGrade;
  conditionLabel: string;
  listingType: ResaleListingType;
  originalPrice: number;
  listedPrice: number;
  currency: string;
  sellerCustomerId: string;
  sellerCity: string;
  status: ResaleListingStatus;
  listedAt: string;
  expiresAt: string | null;
  buyerCustomerId: string | null;
  buyerCity: string | null;
  soldAt: string | null;
  fulfilment: {
    deliveryPartner: string;
    mode: 'direct_transfer' | 'warehouse_ship';
    etaHours: number;
    fromCustomerId: string;
    toCustomerId: string;
  } | null;
  keepOffer: {
    giftCardAmount: number;
    currency: string;
    status: 'pending' | 'accepted';
    extendedAt: string;
    acceptedAt: string | null;
  } | null;
}

export interface PurchaseResult {
  listing: ResaleListing;
  fulfilment: ResaleListing['fulfilment'];
  directTransfer: boolean;
}

export async function apiGetResaleListings(city?: string): Promise<{ listings: ResaleListing[]; total: number }> {
  const qs = city ? `?city=${encodeURIComponent(city)}` : '';
  return apiFetch(`/resale/listings${qs}`);
}

export async function apiGetResaleListing(id: string): Promise<ResaleListing> {
  return apiFetch(`/resale/listings/${id}`);
}

export async function apiPurchaseResale(
  id: string,
  buyerCustomerId: string,
  buyerCity: string,
): Promise<PurchaseResult> {
  return apiFetch(`/resale/listings/${id}/purchase`, {
    method: 'POST',
    body: JSON.stringify({ buyerCustomerId, buyerCity }),
  });
}

export async function apiForceExpireResale(id: string): Promise<ResaleListing> {
  return apiFetch(`/resale/listings/${id}/force-expire`, { method: 'POST' });
}

export async function apiAcceptKeepOffer(id: string): Promise<ResaleListing> {
  return apiFetch(`/resale/listings/${id}/accept-keep-offer`, { method: 'POST' });
}

// ─── Return policy (abuse guard) ─────────────────────────────────────────────

export interface ReturnPolicyDecision {
  returnsAllowed: boolean;
  riskLevel: 'none' | 'elevated' | 'high';
  warning: string | null;
  recentReturnCount: number;
}

export async function apiGetReturnPolicy(
  customerId: string,
  productValue: number,
): Promise<ReturnPolicyDecision> {
  return apiFetch(`/returns/policy?customerId=${encodeURIComponent(customerId)}&productValue=${productValue}`);
}

// ─── Reviews ──────────────────────────────────────────────────────────────────

export interface ProductReview {
  id: string;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  returnRequestId: string | null;
  photoUrls: string[];
  createdAt: string;
}

export async function apiSubmitReview(review: {
  productId: string;
  rating: number;
  title: string;
  body: string;
  returnRequestId?: string | null;
  photoUrls?: string[];
  customerName?: string;
}): Promise<{ review: ProductReview }> {
  return apiFetch('/reviews', {
    method: 'POST',
    body: JSON.stringify(review),
  });
}

export async function apiGetReviews(productId: string): Promise<{
  reviews: ProductReview[];
  total: number;
  avgRating: number | null;
}> {
  return apiFetch(`/reviews?productId=${encodeURIComponent(productId)}`);
}
