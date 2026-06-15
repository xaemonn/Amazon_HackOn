import { Router, type Request, type Response } from 'express';
import mongoose from 'mongoose';
import { ProductModel, type IProduct } from '../../infrastructure/db/ProductModel.js';
import { CATALOG_PRODUCTS } from './catalogRoutes.js';

// ─── DTO mapper: IProduct → frontend Product shape ─────────────────────────────

type LeanProduct = Pick<IProduct,
  'asin' | 'title' | 'category' | 'price' | 'originalPrice' | 'currency' |
  'rating' | 'ratingsTotal' | 'images' | 'description' | 'inStock' | 'badge' | 'tags' | 'emoji'
>;

function toDTO(doc: LeanProduct) {
  return {
    id:            doc.asin,
    name:          doc.title,
    category:      doc.category,
    price:         doc.price,
    originalPrice: doc.originalPrice,
    currency:      doc.currency,
    rating:        doc.rating,
    reviewCount:   doc.ratingsTotal,
    images:        doc.images,
    description:   doc.description,
    inStock:       doc.inStock,
    badge:         doc.badge,
    tags:          doc.tags,
    emoji:         doc.emoji,
  };
}

function staticToDTO(p: (typeof CATALOG_PRODUCTS)[number]) {
  return {
    id:            p.id,
    name:          p.name,
    category:      p.category,
    price:         p.price,
    originalPrice: p.originalPrice,
    currency:      p.currency,
    rating:        p.rating,
    reviewCount:   p.reviewCount,
    images:        p.images,
    description:   p.description,
    inStock:       p.inStock,
    badge:         p.badge,
    tags:          p.tags,
    emoji:         p.emoji,
  };
}

// ─── Route factory ─────────────────────────────────────────────────────────────

export function createProductsRouter(): Router {
  const router = Router();

  // GET /products — list with optional ?search=&category= filters
  router.get('/', async (req: Request, res: Response) => {
    const search   = (req.query['search']   as string | undefined)?.toLowerCase().trim();
    const category = (req.query['category'] as string | undefined)?.trim();

    try {
      const mongoReady = mongoose.connection.readyState === 1;

      if (mongoReady) {
        const filter: Record<string, unknown> = {};
        if (category && category !== 'All') filter['category'] = category;
        if (search) {
          filter['$or'] = [
            { title:       { $regex: search, $options: 'i' } },
            { description: { $regex: search, $options: 'i' } },
            { tags:        { $elemMatch: { $regex: search, $options: 'i' } } },
          ];
        }

        const docs = await ProductModel.find(filter).sort({ ratingsTotal: -1 }).lean<LeanProduct[]>();

        if (docs.length > 0) {
          const categories = [...new Set(
            (await ProductModel.distinct('category') as string[])
          )].sort();
          res.json({ products: docs.map(toDTO), categories, total: docs.length });
          return;
        }
        // MongoDB empty — fall through to static fallback
      }
    } catch (err) {
      console.error('[ProductsRoute] MongoDB query failed, using static fallback:', err);
    }

    // ── Static fallback ──
    let results = CATALOG_PRODUCTS;
    if (category && category !== 'All') results = results.filter((p) => p.category === category);
    if (search) results = results.filter(
      (p) =>
        p.name.toLowerCase().includes(search) ||
        p.description.toLowerCase().includes(search) ||
        p.tags.some((t) => t.includes(search)),
    );
    const categories = [...new Set(CATALOG_PRODUCTS.map((p) => p.category))].sort();
    res.json({ products: results.map(staticToDTO), categories, total: results.length });
  });

  // GET /products/:id — single product
  router.get('/:id', async (req: Request, res: Response) => {
    const id = req.params['id'] as string;

    try {
      const mongoReady = mongoose.connection.readyState === 1;
      if (mongoReady) {
        const doc = await ProductModel.findOne({ asin: id }).lean<LeanProduct>();
        if (doc) { res.json(toDTO(doc)); return; }
      }
    } catch (err) {
      console.error('[ProductsRoute] MongoDB lookup failed:', err);
    }

    // Static fallback
    const p = CATALOG_PRODUCTS.find((x) => x.id === id);
    if (!p) { res.status(404).json({ error: 'Product not found.' }); return; }
    res.json(staticToDTO(p));
  });

  return router;
}
