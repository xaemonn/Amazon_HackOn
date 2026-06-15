import { Router, type Request, type Response } from 'express';
import { CATALOG_PRODUCTS } from './catalogRoutes.js';

// ─── DTO mapper: static CatalogProduct → frontend Product shape ────────────────

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

  // GET /products — always serves from static CATALOG_PRODUCTS (no MongoDB)
  router.get('/', (req: Request, res: Response) => {
    const search   = (req.query['search']   as string | undefined)?.toLowerCase().trim();
    const category = (req.query['category'] as string | undefined)?.trim();

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

  // GET /products/:id — single static product lookup
  router.get('/:id', (req: Request, res: Response) => {
    const id = req.params['id'] as string;
    const p = CATALOG_PRODUCTS.find((x) => x.id === id);
    if (!p) { res.status(404).json({ error: 'Product not found.' }); return; }
    res.json(staticToDTO(p));
  });

  return router;
}
