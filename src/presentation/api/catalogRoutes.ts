import { Router, type Request, type Response } from 'express';

// ─── Catalog Data ────────────────────────────────────────────────────────────

export interface CatalogProduct {
  id: string;
  name: string;
  category: string;
  price: number;
  currency: string;
  emoji: string;
  description: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
}

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    id: 'item-grade-a',
    name: 'Premium Wireless Headphones',
    category: 'Electronics',
    price: 1299,
    currency: 'INR',
    emoji: '🎧',
    description: 'Immersive sound with active noise cancellation, 30-hour battery life, and premium comfort for all-day wear.',
    rating: 4.5,
    reviewCount: 128,
    inStock: true,
    tags: ['audio', 'wireless', 'noise-cancellation'],
  },
  {
    id: 'item-grade-b',
    name: 'Bluetooth Speaker',
    category: 'Electronics',
    price: 799,
    currency: 'INR',
    emoji: '🔊',
    description: '360° surround sound, IPX5 waterproof rating, and 12-hour playtime in a compact portable design.',
    rating: 4.2,
    reviewCount: 94,
    inStock: true,
    tags: ['audio', 'portable', 'waterproof'],
  },
  {
    id: 'item-grade-c',
    name: 'Phone Case',
    category: 'Accessories',
    price: 499,
    currency: 'INR',
    emoji: '📱',
    description: 'Military-grade drop protection with a slim profile. Compatible with wireless charging.',
    rating: 4.0,
    reviewCount: 56,
    inStock: true,
    tags: ['protection', 'slim', 'wireless-charging'],
  },
  {
    id: 'item-grade-d',
    name: 'USB-C Cable (3-Pack)',
    category: 'Accessories',
    price: 199,
    currency: 'INR',
    emoji: '🔌',
    description: 'Braided nylon cable with 100W fast charging and 10Gbps data transfer. 1.5m length.',
    rating: 4.1,
    reviewCount: 210,
    inStock: true,
    tags: ['charging', 'fast-charge', 'data'],
  },
  {
    id: 'smart-watch-pro',
    name: 'Smart Watch Pro',
    category: 'Electronics',
    price: 4999,
    currency: 'INR',
    emoji: '⌚',
    description: 'Health tracking, GPS, SpO2 monitor, AMOLED display, and 7-day battery. Works with Android & iOS.',
    rating: 4.6,
    reviewCount: 312,
    inStock: true,
    tags: ['health', 'gps', 'fitness'],
  },
  {
    id: 'laptop-stand-adj',
    name: 'Adjustable Laptop Stand',
    category: 'Accessories',
    price: 899,
    currency: 'INR',
    emoji: '💻',
    description: 'Ergonomic aluminium stand with 6 height levels and foldable design for portability.',
    rating: 4.4,
    reviewCount: 67,
    inStock: true,
    tags: ['ergonomic', 'aluminium', 'portable'],
  },
  {
    id: 'mech-keyboard-tkl',
    name: 'Mechanical Keyboard TKL',
    category: 'Electronics',
    price: 2499,
    currency: 'INR',
    emoji: '⌨️',
    description: 'Tenkeyless layout with Cherry MX switches, RGB backlight, and USB-C detachable cable.',
    rating: 4.7,
    reviewCount: 189,
    inStock: true,
    tags: ['mechanical', 'rgb', 'tkl'],
  },
  {
    id: 'webcam-2k',
    name: '2K HD Webcam',
    category: 'Electronics',
    price: 1999,
    currency: 'INR',
    emoji: '📷',
    description: '2K resolution with autofocus, built-in noise-cancelling mic, and privacy shutter.',
    rating: 4.3,
    reviewCount: 77,
    inStock: true,
    tags: ['video-call', '2k', 'autofocus'],
  },
  {
    id: 'running-shoes-xt',
    name: 'Running Shoes XT',
    category: 'Footwear',
    price: 3499,
    currency: 'INR',
    emoji: '👟',
    description: 'Lightweight cushioned sole with breathable mesh upper. Designed for road and trail running.',
    rating: 4.5,
    reviewCount: 144,
    inStock: true,
    tags: ['running', 'lightweight', 'breathable'],
  },
  {
    id: 'travel-backpack-40l',
    name: 'Travel Backpack 40L',
    category: 'Bags',
    price: 1999,
    currency: 'INR',
    emoji: '🎒',
    description: 'TSA-friendly 40L capacity with padded laptop compartment, USB pass-through, and rain cover.',
    rating: 4.4,
    reviewCount: 98,
    inStock: true,
    tags: ['travel', 'laptop', 'waterproof'],
  },
  {
    id: 'xl-mouse-pad',
    name: 'XL Gaming Mouse Pad',
    category: 'Accessories',
    price: 399,
    currency: 'INR',
    emoji: '🖱️',
    description: 'Extra-large 900×400mm desk mat with stitched edges and non-slip rubber base.',
    rating: 4.6,
    reviewCount: 230,
    inStock: true,
    tags: ['gaming', 'xl', 'desk-mat'],
  },
  {
    id: 'power-bank-20k',
    name: 'Power Bank 20000mAh',
    category: 'Electronics',
    price: 1499,
    currency: 'INR',
    emoji: '🔋',
    description: '20000mAh capacity with 65W PD fast charging, dual USB-A ports, and LCD display.',
    rating: 4.3,
    reviewCount: 165,
    inStock: false,
    tags: ['battery', 'fast-charge', 'pd65w'],
  },
];

export const CATEGORIES = [...new Set(CATALOG_PRODUCTS.map((p) => p.category))].sort();

// ─── Route Factory ────────────────────────────────────────────────────────────

export function createCatalogRouter(): Router {
  const router = Router();

  // GET /catalog  — list products with optional search & category filter
  router.get('/', (req: Request, res: Response) => {
    const search = (req.query['search'] as string | undefined)?.toLowerCase().trim();
    const category = req.query['category'] as string | undefined;

    let results = CATALOG_PRODUCTS;

    if (category && category !== 'All') {
      results = results.filter((p) => p.category === category);
    }

    if (search) {
      results = results.filter(
        (p) =>
          p.name.toLowerCase().includes(search) ||
          p.description.toLowerCase().includes(search) ||
          p.tags.some((t) => t.includes(search)),
      );
    }

    res.json({ products: results, categories: CATEGORIES, total: results.length });
  });

  // GET /catalog/:id  — single product
  router.get('/:id', (req: Request, res: Response) => {
    const product = CATALOG_PRODUCTS.find((p) => p.id === req.params['id']);
    if (!product) {
      res.status(404).json({ error: 'Product not found.' });
      return;
    }
    res.json(product);
  });

  return router;
}
