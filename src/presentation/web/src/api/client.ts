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

export interface AuthCustomer {
  id: string;
  name: string;
  email: string;
  phone?: string | null;
  address?: Address | null;
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
