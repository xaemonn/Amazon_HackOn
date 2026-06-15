/**
 * Product seeder — populates MongoDB from Rainforest API, RapidAPI, or
 * curated static fallback data (no API key required).
 *
 * Usage:
 *   npm run seed
 *
 * Strategy (Rainforest API):
 *   1. type=search  per keyword → finds real ASINs automatically
 *   2. type=product per ASIN   → fetches full details + all images
 *   Uses ~2 credits per product (30 total for 15 products).
 */

import mongoose from 'mongoose';
import { ProductModel, type IProduct } from './ProductModel.js';
import { CATALOG_PRODUCTS } from '../../presentation/api/catalogRoutes.js';

// ─── Search query manifest ─────────────────────────────────────────────────────

interface SearchEntry {
  query: string;
  category: string;
  emoji: string;
  tags: string[];
  badge?: string;
}

const SEARCH_QUERIES: SearchEntry[] = [
  // ── Electronics (5) ──
  { query: 'Sony WH-1000XM5 wireless noise cancelling headphones', category: 'Electronics', emoji: '🎧', tags: ['wireless', 'noise-cancellation', 'sony', 'premium'], badge: 'Best Seller' },
  { query: 'JBL Flip 6 portable bluetooth speaker waterproof',      category: 'Electronics', emoji: '🔊', tags: ['jbl', 'portable', 'waterproof', 'ip67'], badge: 'Amazon Choice' },
  { query: 'Samsung Galaxy S24 5G smartphone',                      category: 'Electronics', emoji: '📱', tags: ['samsung', '5g', 'amoled', 'snapdragon'], badge: 'New Launch' },
  { query: 'fitness smartwatch heart rate GPS',                     category: 'Electronics', emoji: '⌚', tags: ['smartwatch', 'fitness', 'gps', 'health-tracking'] },
  { query: 'true wireless earbuds active noise cancellation',       category: 'Electronics', emoji: '🎵', tags: ['earbuds', 'wireless', 'enc', 'tws'] },
  // ── Food & Grocery (5) ──
  { query: 'Nutella hazelnut chocolate spread',                     category: 'Food & Grocery', emoji: '🍫', tags: ['nutella', 'chocolate', 'hazelnut', 'spread'], badge: 'Best Seller' },
  { query: 'natural peanut butter no sugar added',                  category: 'Food & Grocery', emoji: '🥜', tags: ['peanut-butter', 'protein', 'no-sugar', 'healthy'], badge: 'Amazon Choice' },
  { query: 'Quaker instant oats breakfast',                         category: 'Food & Grocery', emoji: '🥣', tags: ['oats', 'healthy', 'breakfast', 'quaker'] },
  { query: 'organic green tea bags immunity',                       category: 'Food & Grocery', emoji: '🍵', tags: ['green-tea', 'immunity', 'antioxidant', 'organic'] },
  { query: 'mixed nuts dry fruits healthy snack',                   category: 'Food & Grocery', emoji: '🫘', tags: ['dry-fruits', 'nuts', 'healthy', 'snack'] },
  // ── Beauty & Personal Care (5) ──
  { query: 'Head and Shoulders anti dandruff shampoo',              category: 'Beauty & Personal Care', emoji: '🧴', tags: ['shampoo', 'anti-dandruff', 'hair-care'] },
  { query: 'Dove deep moisture body wash',                          category: 'Beauty & Personal Care', emoji: '🛁', tags: ['body-wash', 'dove', 'moisturising', 'skin-care'] },
  { query: 'Vitamin C face serum brightening skin',                 category: 'Beauty & Personal Care', emoji: '✨', tags: ['vitamin-c', 'serum', 'brightening', 'anti-dark-spot'] },
  { query: 'whey protein powder chocolate muscle building',         category: 'Health & Sports',       emoji: '💪', tags: ['whey-protein', 'bcaa', 'gym', 'chocolate'], badge: 'Best Seller' },
  { query: 'Instant Pot electric pressure cooker 6 quart',         category: 'Home & Kitchen',        emoji: '🍲', tags: ['pressure-cooker', 'instant-pot', '7-in-1', 'kitchen'] },
];

// ─── Rainforest API types ─────────────────────────────────────────────────────

interface RFSearchResult {
  asin: string;
  title?: string;
  image?: string;
  price?: { value: number; currency: string };
  rating?: number;
  ratings_total?: number;
}

interface RFSearchResponse {
  request_info?: { success: boolean; message?: string };
  search_results?: RFSearchResult[];
}

interface RFProduct {
  asin: string;
  title?: string;
  main_image?: { link: string };
  images?: Array<{ link: string }>;
  price?: { value: number; currency: string };
  rrp?: { value: number };
  rating?: number;
  ratings_total?: number;
  feature_bullets?: string[];
  description?: string;
  in_stock?: boolean;
}

interface RFProductResponse {
  request_info?: { success: boolean; message?: string };
  product?: RFProduct;
}

async function rfFetch<T>(params: Record<string, string>, apiKey: string): Promise<T> {
  const url = new URL('https://api.rainforestapi.com/request');
  url.searchParams.set('api_key', apiKey);
  for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(20_000) });
  if (!res.ok) throw new Error(`Rainforest HTTP ${res.status}`);
  return res.json() as Promise<T>;
}

async function searchAndFetch(
  entry: SearchEntry,
  apiKey: string,
): Promise<Omit<IProduct, keyof mongoose.Document> | null> {
  // Step 1: search to find a real ASIN
  const searchRes = await rfFetch<RFSearchResponse>({
    type: 'search',
    search_term: entry.query,
    amazon_domain: 'amazon.com',
    sort_by: 'featured',
  }, apiKey);

  if (!searchRes.request_info?.success) {
    throw new Error(searchRes.request_info?.message ?? 'Search failed');
  }

  const results = (searchRes.search_results ?? []).filter(
    (r) => r.asin && r.price?.value && r.price.value > 0,
  );

  if (results.length === 0) throw new Error('No priced results found');
  const topResult = results[0]!;

  await new Promise((r) => setTimeout(r, 1_000)); // rate-limit pause

  // Step 2: fetch full product details for images + feature bullets
  const prodRes = await rfFetch<RFProductResponse>({
    type: 'product',
    asin: topResult.asin,
    amazon_domain: 'amazon.com',
  }, apiKey);

  const p = prodRes.product;
  if (!p) {
    // Fall back to search-result data (fewer images but still works)
    return {
      asin:          topResult.asin,
      title:         topResult.title ?? entry.query,
      category:      entry.category,
      price:         topResult.price?.value ?? 0,
      currency:      topResult.price?.currency ?? 'USD',
      rating:        topResult.rating ?? 0,
      ratingsTotal:  topResult.ratings_total ?? 0,
      images:        topResult.image ? [topResult.image] : [],
      description:   '',
      featureBullets:[],
      inStock:       true,
      badge:         entry.badge,
      tags:          entry.tags,
      emoji:         entry.emoji,
      source:        'rainforest',
    };
  }

  const allImages = (p.images ?? []).map((i) => i.link).filter(Boolean);
  if (p.main_image?.link && !allImages.includes(p.main_image.link)) {
    allImages.unshift(p.main_image.link);
  }

  return {
    asin:          p.asin,
    title:         p.title ?? entry.query,
    category:      entry.category,
    price:         p.price?.value ?? topResult.price?.value ?? 0,
    originalPrice: p.rrp?.value,
    currency:      p.price?.currency ?? 'USD',
    rating:        p.rating ?? topResult.rating ?? 0,
    ratingsTotal:  p.ratings_total ?? topResult.ratings_total ?? 0,
    images:        allImages.slice(0, 6),
    description:   p.description ?? (p.feature_bullets ?? []).slice(0, 2).join(' '),
    featureBullets:p.feature_bullets ?? [],
    inStock:       p.in_stock ?? true,
    badge:         entry.badge,
    tags:          entry.tags,
    emoji:         entry.emoji,
    source:        'rainforest',
  };
}

// ─── Curated fallback (no API key needed) ─────────────────────────────────────

function buildCuratedDocs(): Array<Omit<IProduct, keyof mongoose.Document>> {
  return CATALOG_PRODUCTS.map((p) => ({
    asin:          p.id,
    title:         p.name,
    category:      p.category,
    price:         p.price,
    originalPrice: p.originalPrice,
    currency:      p.currency,
    rating:        p.rating,
    ratingsTotal:  p.reviewCount,
    images:        p.images ?? [],
    description:   p.description,
    featureBullets:[],
    inStock:       p.inStock,
    badge:         p.badge,
    tags:          p.tags,
    emoji:         p.emoji,
    source:        'curated' as const,
  }));
}

// ─── Main seeder ──────────────────────────────────────────────────────────────

async function seed() {
  const mongoUri      = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/amazon2';
  const rainforestKey = process.env['RAINFOREST_API_KEY'];

  console.log('[Seed] Connecting to MongoDB…');
  await mongoose.connect(mongoUri);
  console.log('[Seed] Connected.');

  // Skip if already seeded with API data
  const existing = await ProductModel.countDocuments({ source: { $in: ['rainforest', 'rapidapi'] } });
  if (existing > 0 && rainforestKey) {
    console.log(`[Seed] ${existing} API-sourced products already in MongoDB. Run with FORCE_RESEED=true to overwrite.`);
    if (process.env['FORCE_RESEED'] !== 'true') { await mongoose.disconnect(); return; }
  }

  let docs: Array<Omit<IProduct, keyof mongoose.Document>> = [];

  if (rainforestKey) {
    console.log(`[Seed] Using Rainforest API (search+product, ~2 credits each)…`);
    for (const entry of SEARCH_QUERIES) {
      try {
        const doc = await searchAndFetch(entry, rainforestKey);
        if (doc) {
          docs.push(doc);
          console.log(`  ✓ [${entry.category}] ${doc.title?.slice(0, 55)}`);
        }
      } catch (err) {
        console.warn(`  ✗ "${entry.query}": ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 1_200));
    }
  } else {
    console.log('[Seed] No RAINFOREST_API_KEY — using curated static catalog.');
    docs = buildCuratedDocs();
  }

  if (docs.length === 0) {
    console.log('[Seed] Nothing to insert. Check your API key or network.');
    await mongoose.disconnect();
    return;
  }

  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { asin: doc.asin },
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await ProductModel.bulkWrite(ops);
  console.log(`\n[Seed] Done ✓  upserted=${result.upsertedCount}  modified=${result.modifiedCount}  total=${docs.length}`);
  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[Seed] Fatal:', err);
  process.exit(1);
});
