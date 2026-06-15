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
  images: string[];
  description: string;
  rating: number;
  reviewCount: number;
  inStock: boolean;
  tags: string[];
  badge?: string;
  originalPrice?: number;
}

const U = (id: string) => `https://images.unsplash.com/photo-${id}?auto=format&fit=crop&w=600&q=80`;

export const CATALOG_PRODUCTS: CatalogProduct[] = [
  {
    id: 'item-grade-a',
    name: 'Sony WH-1000XM5 Wireless Headphones',
    category: 'Electronics',
    price: 24990,
    originalPrice: 29990,
    currency: 'INR',
    emoji: '🎧',
    images: [
      U('1505740420928-5e560c06d30e'),
      U('1484704849700-f032a568e944'),
      U('1546435770-a3e426bf472b'),
      U('1583394838336-acd977736f90'),
    ],
    description: 'Industry-leading noise cancellation with 30-hour battery life. LDAC support, multipoint Bluetooth connection, and speak-to-chat technology. Premium leather cushions fold flat for travel.',
    rating: 4.5,
    reviewCount: 2847,
    inStock: true,
    badge: 'Best Seller',
    tags: ['wireless', 'noise-cancellation', 'ldac', 'premium', 'sony'],
  },
  {
    id: 'item-grade-b',
    name: 'JBL Flip 6 Portable Bluetooth Speaker',
    category: 'Electronics',
    price: 7999,
    originalPrice: 9999,
    currency: 'INR',
    emoji: '🔊',
    images: [
      U('1608043152269-423dbba4e7e1'),
      U('1545454675-3531b543be5d'),
      U('1558618047-3c8c76ca7d13'),
    ],
    description: 'Powerful sound with bold bass. IP67 waterproof and dustproof, 12-hour playtime, and PartyBoost for linking multiple speakers. Perfect for outdoor adventures.',
    rating: 4.4,
    reviewCount: 1593,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['jbl', 'portable', 'waterproof', 'ip67', 'bass'],
  },
  {
    id: 'item-grade-c',
    name: 'Samsung Galaxy S24 5G',
    category: 'Electronics',
    price: 74999,
    originalPrice: 79999,
    currency: 'INR',
    emoji: '📱',
    images: [
      U('1511707171634-5f897ff02aa9'),
      U('1592899677977-9c10ca588bbd'),
      U('1580910051074-3eb694886505'),
      U('1601784551446-20c9e07cdbdb'),
    ],
    description: '6.2-inch Dynamic AMOLED display, Snapdragon 8 Gen 3 processor, 50MP triple camera system with 30x Space Zoom. 25W fast charging, IP68 water resistance, and 7 years of OS updates.',
    rating: 4.6,
    reviewCount: 4210,
    inStock: true,
    badge: 'New Launch',
    tags: ['5g', 'amoled', 'snapdragon', 'samsung', '50mp'],
  },
  {
    id: 'item-grade-d',
    name: 'boAt Bassheads 900 Wired Earphones',
    category: 'Electronics',
    price: 699,
    originalPrice: 1299,
    currency: 'INR',
    emoji: '🎵',
    images: [
      U('1484704849700-f032a568e944'),
      U('1631176093557-5ee45a5a7073'),
      U('1505740420928-5e560c06d30e'),
    ],
    description: 'HD sound with 10mm drivers, tangle-free braided cable, and in-line mic for calls. Ergonomic ear tips for all-day comfort. Compatible with all 3.5mm devices.',
    rating: 4.1,
    reviewCount: 8932,
    inStock: true,
    tags: ['wired', 'earphones', 'boat', 'bass', 'mic'],
  },
  {
    id: 'nutella-750g',
    name: 'Nutella Hazelnut Chocolate Spread 750g',
    category: 'Food & Grocery',
    price: 499,
    originalPrice: 560,
    currency: 'INR',
    emoji: '🍫',
    images: [
      U('1571771894821-ce9b6c11b08e'),
      U('1558618666-fcd25c85cd64'),
      U('1576618148400-f54bed99fcfd'),
    ],
    description: 'The original Ferrero Nutella — a unique recipe with over 50 hazelnuts per jar. No artificial colours or preservatives. Perfect on toast, pancakes, waffles, or straight from the spoon!',
    rating: 4.8,
    reviewCount: 12400,
    inStock: true,
    badge: 'Best Seller',
    tags: ['nutella', 'chocolate', 'hazelnut', 'spread', 'ferrero'],
  },
  {
    id: 'myfitness-pb-1kg',
    name: 'MyFitness Original Peanut Butter Crunchy 1kg',
    category: 'Food & Grocery',
    price: 469,
    originalPrice: 599,
    currency: 'INR',
    emoji: '🥜',
    images: [
      U('1600271886742-f049cd451bba'),
      U('1559181567-c3190ca9d5c5'),
      U('1543591080-0c3eb61d4f41'),
    ],
    description: 'Made from 100% roasted peanuts with no added sugar, palm oil, or preservatives. High protein (25g per serving), naturally gluten-free. Crunchy texture for that perfect bite.',
    rating: 4.5,
    reviewCount: 6730,
    inStock: true,
    badge: 'Amazon Choice',
    tags: ['peanut-butter', 'protein', 'no-sugar', 'crunchy', 'healthy'],
  },
  {
    id: 'headshoulders-650ml',
    name: "Head & Shoulders Smooth & Silky Shampoo 650ml",
    category: 'Beauty & Personal Care',
    price: 449,
    originalPrice: 549,
    currency: 'INR',
    emoji: '🧴',
    images: [
      U('1556228720-195a672e8a03'),
      U('1571781926291-c477ebfd024b'),
      U('1585232354509-e6e6844a43c7'),
    ],
    description: 'Clinically proven anti-dandruff protection with up to 100% dandruff-free hair. Pyrithione Zinc formula strengthens hair from root to tip. Leaves hair smooth, silky, and beautifully fragrant.',
    rating: 4.3,
    reviewCount: 9812,
    inStock: true,
    tags: ['shampoo', 'anti-dandruff', 'head-shoulders', 'hair-care'],
  },
  {
    id: 'dove-bodywash-500ml',
    name: 'Dove Deep Moisture Body Wash 500ml',
    category: 'Beauty & Personal Care',
    price: 329,
    originalPrice: 399,
    currency: 'INR',
    emoji: '🛁',
    images: [
      U('1607006344380-f6e9d4d17e14'),
      U('1556228453-efd6c1ff04f6'),
      U('1584467541268-b040f83be3fd'),
    ],
    description: 'Dove NutriumMoisture technology nourishes skin with essential nutrients. Softer, smoother skin after just one shower. Dermatologist recommended, pH-balanced, and hypoallergenic.',
    rating: 4.4,
    reviewCount: 5241,
    inStock: true,
    tags: ['body-wash', 'dove', 'moisturising', 'skin-care'],
  },
  {
    id: 'smart-watch-pro',
    name: 'Noise ColorFit Pro 5 Smart Watch',
    category: 'Electronics',
    price: 4999,
    originalPrice: 8999,
    currency: 'INR',
    emoji: '⌚',
    images: [
      U('1523275335684-37898b6baf30'),
      U('1508685096489-7aacd43bd3b1'),
      U('1546868871-0f936769f3ad'),
      U('1559825481-12a05cc00344'),
    ],
    description: '1.85-inch AMOLED display, 100+ sports modes, 24/7 heart rate & SpO2 monitoring, sleep tracking, and GPS. 7-day battery life. Compatible with Android and iOS. IP68 water resistant.',
    rating: 4.3,
    reviewCount: 3187,
    inStock: true,
    badge: 'Best Seller',
    tags: ['smartwatch', 'amoled', 'fitness', 'gps', 'health-tracking'],
  },
  {
    id: 'running-shoes-xt',
    name: 'Nike Air Max 270 Running Shoes',
    category: 'Footwear',
    price: 8495,
    originalPrice: 10995,
    currency: 'INR',
    emoji: '👟',
    images: [
      U('1542291026-7eec264c27ff'),
      U('1608231387042-66d1773d3028'),
      U('1491553895911-0055eca6402d'),
      U('1600185365926-3a2ce3cdb9eb'),
    ],
    description: "Nike's largest Air unit yet delivers all-day comfort. Lightweight mesh upper for breathability, foam midsole for cushioning, and rubber outsole for durability. Available in multiple colourways.",
    rating: 4.5,
    reviewCount: 2934,
    inStock: true,
    tags: ['nike', 'air-max', 'running', 'cushioned', 'breathable'],
  },
  {
    id: 'travel-backpack-40l',
    name: 'American Tourister Travel Backpack 40L',
    category: 'Bags',
    price: 3499,
    originalPrice: 4999,
    currency: 'INR',
    emoji: '🎒',
    images: [
      U('1553062407-98eeb64c6a62'),
      U('1622260614153-03223fb72052'),
      U('1473188537798-3e69f7d8b671'),
      U('1502810365585-56ffa361fdde'),
    ],
    description: 'TSA-approved 40L expandable backpack with dedicated 17-inch padded laptop sleeve. Integrated USB-A charging port, hidden anti-theft pocket, and water-resistant coating.',
    rating: 4.4,
    reviewCount: 1876,
    inStock: true,
    tags: ['backpack', 'travel', 'laptop', 'tsa', 'usb-charging'],
  },
  {
    id: 'mech-keyboard-tkl',
    name: 'Keychron K8 Wireless Mechanical Keyboard',
    category: 'Electronics',
    price: 6999,
    originalPrice: 7999,
    currency: 'INR',
    emoji: '⌨️',
    images: [
      U('1587829741301-dc798b83add3'),
      U('1541140032-f0076a9d7fe3'),
      U('1614436163996-25cee5f54290'),
    ],
    description: 'Tenkeyless layout with Bluetooth 5.1 + USB-C wired mode. Gateron G Pro switches (Red/Brown/Blue options), 3-level white backlight, aluminium frame, and Mac/Windows compatibility.',
    rating: 4.7,
    reviewCount: 1254,
    inStock: true,
    badge: 'Top Rated',
    tags: ['mechanical', 'wireless', 'keychron', 'tkl', 'bluetooth'],
  },
  {
    id: 'mamaearth-vitamin-c',
    name: 'Mamaearth Vitamin C Face Serum 30ml',
    category: 'Beauty & Personal Care',
    price: 449,
    originalPrice: 599,
    currency: 'INR',
    emoji: '✨',
    images: [
      U('1621576015534-28b10b00b2a1'),
      U('1556228453-efd6c1ff04f6'),
      U('1571781926291-c477ebfd024b'),
    ],
    description: 'Powered by Vitamin C & Turmeric, this serum fades dark spots, brightens skin tone, and boosts collagen production. Dermatologist tested, toxin-free, made safe certified. Suitable for all skin types.',
    rating: 4.2,
    reviewCount: 7342,
    inStock: true,
    tags: ['vitamin-c', 'serum', 'mamaearth', 'brightening', 'anti-dark-spot'],
  },
  {
    id: 'whey-protein-1kg',
    name: 'MuscleBlaze Whey Protein 1kg (Chocolate)',
    category: 'Health & Sports',
    price: 1699,
    originalPrice: 2299,
    currency: 'INR',
    emoji: '💪',
    images: [
      U('1571019614242-c5c5dee9f50b'),
      U('1534438327276-14e5300c3a48'),
      U('1544367567-0f2fcb009e0b'),
    ],
    description: '25g protein per serving with 5.5g BCAA. Cold-processed whey protein concentrate for superior taste and mixability. Available in Chocolate, Vanilla, and Strawberry. 30 servings per pack.',
    rating: 4.4,
    reviewCount: 11200,
    inStock: true,
    badge: 'Best Seller',
    tags: ['whey-protein', 'bcaa', 'muscleblaze', 'chocolate', 'gym'],
  },
  {
    id: 'instant-pot-6qt',
    name: 'Instant Pot Duo 7-in-1 Electric Pressure Cooker 6Qt',
    category: 'Home & Kitchen',
    price: 7499,
    originalPrice: 10999,
    currency: 'INR',
    emoji: '🍲',
    images: [
      U('1585515320310-259814833e62'),
      U('1556909114-f6e7ad7d3136'),
      U('1567620905732-2d1ec7ab7445'),
    ],
    description: 'Pressure cooker, slow cooker, rice cooker, yogurt maker, steamer, sauté pan, and food warmer — 7 appliances in one. 13 one-touch programs, delay start, and keep-warm functions. Dishwasher-safe inner pot.',
    rating: 4.7,
    reviewCount: 3890,
    inStock: true,
    tags: ['pressure-cooker', 'instant-pot', 'kitchen', '7-in-1', 'slow-cooker'],
  },
];

export const CATEGORIES = [...new Set(CATALOG_PRODUCTS.map((p) => p.category))].sort();

// Also expose badge and originalPrice in responses (already part of interface)

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
