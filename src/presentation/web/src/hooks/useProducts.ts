import { useCallback, useEffect, useState } from 'react';
import { API_BASE } from '../api/client';
import type { Product } from '../api/client';

async function fetchProducts(params?: { search?: string; category?: string }) {
  const query = new URLSearchParams();
  if (params?.search)   query.set('search',   params.search);
  if (params?.category) query.set('category', params.category);
  const qs = query.toString();
  const res = await fetch(`${API_BASE}/api/products${qs ? `?${qs}` : ''}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.json() as Promise<{ products: Product[]; categories: string[]; total: number }>;
}

async function fetchProduct(id: string) {
  const res = await fetch(`${API_BASE}/api/products/${encodeURIComponent(id)}`, {
    headers: { 'Content-Type': 'application/json' },
  });
  if (!res.ok) throw new Error(res.status === 404 ? 'Product not found.' : `HTTP ${res.status}`);
  return res.json() as Promise<Product>;
}

export function useProducts(params?: { search?: string; category?: string }) {
  const [products, setProducts]     = useState<Product[]>([]);
  const [categories, setCategories] = useState<string[]>([]);
  const [isLoading, setIsLoading]   = useState(true);
  const [error, setError]           = useState<string | null>(null);

  const load = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchProducts(params);
      setProducts(data.products);
      setCategories(['All', ...data.categories]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load products.');
    } finally {
      setIsLoading(false);
    }
  }, [params?.search, params?.category]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => { void load(); }, [load]);

  return { products, categories, isLoading, error, reload: load };
}

export function useProduct(id: string | undefined) {
  const [product, setProduct]     = useState<Product | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError]         = useState<string | null>(null);

  useEffect(() => {
    if (!id) { setIsLoading(false); return; }
    setIsLoading(true);
    setError(null);
    setProduct(null);
    fetchProduct(id)
      .then(setProduct)
      .catch((err) => setError(err instanceof Error ? err.message : 'Failed to load product.'))
      .finally(() => setIsLoading(false));
  }, [id]);

  return { product, isLoading, error };
}
