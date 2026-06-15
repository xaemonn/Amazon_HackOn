/**
 * Product seeder — populates MongoDB from Rainforest API, RapidAPI, or
 * curated static fallback data (no API key required).
 *
 * Usage:
 *   npx tsx --env-file=.env src/infrastructure/db/seedProducts.ts
 *
 * Env vars (at least one Amazon scraper key, or leave empty for curated data):
 *   RAINFOREST_API_KEY   — https://rainforestapi.com  (free trial: 100 req)
 *   RAPIDAPI_KEY         — https://rapidapi.com  (Real-Time Amazon Data API)
 *   MONGODB_URI          — Atlas / local connection string
 */

import mongoose from 'mongoose';
import { ProductModel, type IProduct } from './ProductModel.js';
import { CATALOG_PRODUCTS } from '../../presentation/api/catalogRoutes.js';

// ─── ASIN manifest (10-15 per category, 3 categories) ─────────────────────────

interface AsinEntry {
  asin: string;
  category: string;
  emoji: string;
  tags: string[];
}

const ASIN_LIST: AsinEntry[] = [
  // ── Electronics (5) ──
  { asin: 'B09G9BDV9Z', category: 'Electronics',          emoji: '🎧', tags: ['wireless', 'noise-cancellation', 'sony', 'premium'] },
  { asin: 'B09JQMJHXY', category: 'Electronics',          emoji: '🔊', tags: ['jbl', 'portable', 'waterproof', 'ip67'] },
  { asin: 'B0B9QW3JT5', category: 'Electronics',          emoji: '📱', tags: ['samsung', '5g', 'amoled', 'snapdragon'] },
  { asin: 'B0BYYDRG4N', category: 'Electronics',          emoji: '⌚', tags: ['smartwatch', 'fitness', 'amoled', 'gps'] },
  { asin: 'B0BDHX9Z7B', category: 'Electronics',          emoji: '🎵', tags: ['earbuds', 'boat', 'wireless', 'enc'] },
  // ── Food & Grocery (5) ──
  { asin: 'B01M0RTXBH', category: 'Food & Grocery',       emoji: '🍫', tags: ['nutella', 'chocolate', 'hazelnut', 'spread'] },
  { asin: 'B08DKVZ5JC', category: 'Food & Grocery',       emoji: '🥜', tags: ['peanut-butter', 'protein', 'no-sugar', 'crunchy'] },
  { asin: 'B00HUU58QK', category: 'Food & Grocery',       emoji: '🥣', tags: ['oats', 'healthy', 'breakfast', 'quaker'] },
  { asin: 'B07THHG2PR', category: 'Food & Grocery',       emoji: '🫐', tags: ['dry-fruits', 'organic', 'healthy'] },
  { asin: 'B09B5HJXMB', category: 'Food & Grocery',       emoji: '🍵', tags: ['green-tea', 'immunity', 'antioxidant'] },
  // ── Beauty & Personal Care (5) ──
  { asin: 'B07ZZWSGC6', category: 'Beauty & Personal Care', emoji: '🧴', tags: ['shampoo', 'anti-dandruff', 'head-shoulders'] },
  { asin: 'B00CKZUNQA', category: 'Beauty & Personal Care', emoji: '🛁', tags: ['body-wash', 'dove', 'moisturising'] },
  { asin: 'B071NV4ZF2', category: 'Beauty & Personal Care', emoji: '✨', tags: ['vitamin-c', 'serum', 'mamaearth', 'brightening'] },
  { asin: 'B07K2W3N5R', category: 'Beauty & Personal Care', emoji: '💄', tags: ['lipstick', 'matte', 'long-lasting'] },
  { asin: 'B07DPJZMSG', category: 'Beauty & Personal Care', emoji: '🧖', tags: ['apple-cider', 'shampoo', 'wow', 'hair-care'] },
];

// ─── Rainforest API ────────────────────────────────────────────────────────────

interface RainforestProduct {
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
  categories?: Array<{ name: string }>;
}

interface RainforestResponse {
  product?: RainforestProduct;
  request_info?: { success: boolean; message?: string };
}

async function fetchFromRainforest(asin: string, apiKey: string): Promise<RainforestProduct | null> {
  const url = new URL('https://api.rainforestapi.com/request');
  url.searchParams.set('api_key', apiKey);
  url.searchParams.set('type', 'product');
  url.searchParams.set('asin', asin);
  url.searchParams.set('amazon_domain', 'amazon.in');

  const res = await fetch(url.toString(), { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Rainforest HTTP ${res.status}`);
  const body = await res.json() as RainforestResponse;
  if (!body.request_info?.success) throw new Error(body.request_info?.message ?? 'Rainforest error');
  return body.product ?? null;
}

// ─── RapidAPI Real-Time Amazon Data ───────────────────────────────────────────

interface RapidProductData {
  product_title?: string;
  product_price?: string;
  product_original_price?: string;
  product_star_rating?: string;
  product_num_ratings?: number;
  product_photos?: string[];
  product_description?: string;
  is_available?: boolean;
}

interface RapidResponse {
  status?: string;
  data?: RapidProductData;
}

async function fetchFromRapidApi(asin: string, apiKey: string): Promise<RapidProductData | null> {
  const url = new URL('https://real-time-amazon-data.p.rapidapi.com/product-details');
  url.searchParams.set('asin', asin);
  url.searchParams.set('country', 'IN');

  const res = await fetch(url.toString(), {
    headers: {
      'X-RapidAPI-Key': apiKey,
      'X-RapidAPI-Host': 'real-time-amazon-data.p.rapidapi.com',
    },
    signal: AbortSignal.timeout(15_000),
  });
  if (!res.ok) throw new Error(`RapidAPI HTTP ${res.status}`);
  const body = await res.json() as RapidResponse;
  if (body.status !== 'OK') throw new Error('RapidAPI returned non-OK status');
  return body.data ?? null;
}

// ─── Price parser ──────────────────────────────────────────────────────────────

function parsePrice(raw: string | undefined): number {
  if (!raw) return 0;
  return parseFloat(raw.replace(/[^0-9.]/g, '')) || 0;
}

// ─── Map API responses → IProduct shape ───────────────────────────────────────

function fromRainforest(meta: AsinEntry, p: RainforestProduct): Omit<IProduct, keyof mongoose.Document> {
  const allImages = (p.images ?? []).map((i) => i.link).filter(Boolean);
  if (p.main_image?.link && !allImages.includes(p.main_image.link)) {
    allImages.unshift(p.main_image.link);
  }
  return {
    asin:          p.asin,
    title:         p.title ?? meta.asin,
    category:      meta.category,
    price:         p.price?.value ?? 0,
    originalPrice: p.rrp?.value,
    currency:      p.price?.currency ?? 'INR',
    rating:        p.rating ?? 0,
    ratingsTotal:  p.ratings_total ?? 0,
    images:        allImages.slice(0, 5),
    description:   p.description ?? (p.feature_bullets ?? []).join(' '),
    featureBullets:p.feature_bullets ?? [],
    inStock:       p.in_stock ?? true,
    tags:          meta.tags,
    emoji:         meta.emoji,
    source:        'rainforest',
  };
}

function fromRapidApi(meta: AsinEntry, p: RapidProductData): Omit<IProduct, keyof mongoose.Document> {
  return {
    asin:          meta.asin,
    title:         p.product_title ?? meta.asin,
    category:      meta.category,
    price:         parsePrice(p.product_price),
    originalPrice: parsePrice(p.product_original_price) || undefined,
    currency:      'INR',
    rating:        parseFloat(p.product_star_rating ?? '0') || 0,
    ratingsTotal:  p.product_num_ratings ?? 0,
    images:        (p.product_photos ?? []).slice(0, 5),
    description:   p.product_description ?? '',
    featureBullets:[],
    inStock:       p.is_available ?? true,
    tags:          meta.tags,
    emoji:         meta.emoji,
    source:        'rapidapi',
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
  const mongoUri = process.env['MONGODB_URI'] ?? 'mongodb://localhost:27017/amazon2';
  const rainforestKey = process.env['RAINFOREST_API_KEY'];
  const rapidApiKey   = process.env['RAPIDAPI_KEY'];

  console.log('[Seed] Connecting to MongoDB…');
  await mongoose.connect(mongoUri);
  console.log('[Seed] Connected.');

  let docs: Array<Omit<IProduct, keyof mongoose.Document>> = [];

  if (rainforestKey) {
    console.log('[Seed] Using Rainforest API…');
    for (const meta of ASIN_LIST) {
      try {
        const data = await fetchFromRainforest(meta.asin, rainforestKey);
        if (data) {
          docs.push(fromRainforest(meta, data));
          console.log(`  ✓ ${meta.asin} – ${data.title?.slice(0, 50)}`);
        }
      } catch (err) {
        console.warn(`  ✗ ${meta.asin}: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 800)); // respect rate limit
    }
  } else if (rapidApiKey) {
    console.log('[Seed] Using RapidAPI Real-Time Amazon Data…');
    for (const meta of ASIN_LIST) {
      try {
        const data = await fetchFromRapidApi(meta.asin, rapidApiKey);
        if (data) {
          docs.push(fromRapidApi(meta, data));
          console.log(`  ✓ ${meta.asin} – ${data.product_title?.slice(0, 50)}`);
        }
      } catch (err) {
        console.warn(`  ✗ ${meta.asin}: ${(err as Error).message}`);
      }
      await new Promise((r) => setTimeout(r, 800));
    }
  } else {
    console.log('[Seed] No API key found — using curated static catalog data.');
    docs = buildCuratedDocs();
  }

  if (docs.length === 0) {
    console.log('[Seed] No documents to insert. Exiting.');
    await mongoose.disconnect();
    return;
  }

  // Upsert by asin so re-running is safe
  const ops = docs.map((doc) => ({
    updateOne: {
      filter: { asin: doc.asin },
      update: { $set: doc },
      upsert: true,
    },
  }));

  const result = await ProductModel.bulkWrite(ops);
  console.log(`[Seed] Done. upserted=${result.upsertedCount} modified=${result.modifiedCount} total=${docs.length}`);

  await mongoose.disconnect();
}

seed().catch((err) => {
  console.error('[Seed] Fatal error:', err);
  process.exit(1);
});
