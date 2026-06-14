import express, { Router, type Request, type Response } from 'express';
import * as fs from 'fs/promises';
import * as path from 'path';
import { existsSync } from 'fs';

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

  // ── Catalog Image Management ────────────────────────────────────────────────
  //
  // Catalog images live in  uploads/catalog/<productId>.jpg  (or .png).
  // These are the "as-new" reference images Bedrock uses for identity check +
  // condition grading.  Drop images via the PUT endpoint before grading.

  const CATALOG_DIR = path.resolve('./uploads/catalog');

  // GET /catalog/images — list which products have a catalog image uploaded
  router.get('/images/list', async (_req: Request, res: Response) => {
    try {
      await fs.mkdir(CATALOG_DIR, { recursive: true });
      const files = await fs.readdir(CATALOG_DIR);
      const images = files
        .filter((f) => /\.(jpe?g|png)$/i.test(f))
        .map((f) => ({
          productId: f.replace(/\.(jpe?g|png)$/i, ''),
          filename: f,
          path: `catalog/${f}`,
        }));

      const productsWithImages = new Set(images.map((i) => i.productId));
      const missing = CATALOG_PRODUCTS
        .filter((p) => p.id.startsWith('item-grade-'))
        .filter((p) => !productsWithImages.has(p.id))
        .map((p) => p.id);

      res.json({ images, missing, catalogDir: CATALOG_DIR });
    } catch (err) {
      res.status(500).json({ error: 'Could not list catalog images.' });
    }
  });

  // PUT /catalog/images/:productId — upload a catalog reference image
  // Send the raw JPEG or PNG bytes as the request body.
  // Content-Type must be image/jpeg or image/png.
  // Example:
  //   curl -X PUT -H "Content-Type: image/jpeg" --data-binary @headphones.jpg \
  //        http://localhost:3001/api/catalog/images/item-grade-a
  router.put(
    '/images/:productId',
    express.raw({ type: 'image/*', limit: '20mb' }),
    async (req: Request, res: Response) => {
      const productId = req.params['productId'] as string;
      if (!productId || !/^[\w-]+$/.test(productId)) {
        res.status(400).json({ error: 'Invalid productId.' });
        return;
      }

      const ct = req.headers['content-type'] ?? 'image/jpeg';
      const ext = ct.includes('png') ? 'png' : 'jpg';
      const filename = `${productId}.${ext}`;
      const dest = path.join(CATALOG_DIR, filename);

      try {
        await fs.mkdir(CATALOG_DIR, { recursive: true });

        const body = req.body as Buffer | string;
        if (!body || (Buffer.isBuffer(body) && body.length === 0)) {
          res.status(400).json({ error: 'Request body is empty. Send raw image bytes.' });
          return;
        }

        const imageBytes = Buffer.isBuffer(body) ? body : Buffer.from(body as string, 'base64');
        await fs.writeFile(dest, imageBytes);

        res.status(200).json({
          message: `Catalog image saved for product '${productId}'.`,
          catalogImageRef: `catalog/${filename}`,
          path: dest,
          sizeBytes: imageBytes.length,
        });
      } catch (err) {
        res.status(500).json({ error: `Failed to save catalog image: ${err instanceof Error ? err.message : err}` });
      }
    }
  );

  // GET /catalog/images/:productId — check if a catalog image exists and serve it
  router.get('/images/:productId', async (req: Request, res: Response) => {
    const productId = req.params['productId'] as string;
    if (!productId || !/^[\w-]+$/.test(productId)) {
      res.status(400).json({ error: 'Invalid productId.' });
      return;
    }

    // Try both .jpg and .png
    for (const ext of ['jpg', 'jpeg', 'png']) {
      const filePath = path.join(CATALOG_DIR, `${productId}.${ext}`);
      if (existsSync(filePath)) {
        const mime = ext === 'png' ? 'image/png' : 'image/jpeg';
        res.setHeader('Content-Type', mime);
        res.sendFile(filePath);
        return;
      }
    }

    res.status(404).json({
      error: `No catalog image found for product '${productId}'.`,
      hint: `Upload one via: PUT /api/catalog/images/${productId} with Content-Type: image/jpeg`,
    });
  });

  return router;
}
