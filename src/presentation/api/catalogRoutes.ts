/**
 * Express API Routes — Catalog Module
 *
 * Placeholder router for the catalog module.
 * Returns 501 Not Implemented for all routes until the full catalog API is built.
 *
 * Future endpoints:
 *  - GET /catalog/products          — list/search products
 *  - GET /catalog/products/:id      — product detail with variants
 *  - GET /catalog/categories        — list categories
 *  - GET /catalog/categories/:id    — category products
 *
 * Requirements: 5.3
 */

import { Router, type Request, type Response } from 'express';
import type { CatalogService } from '../../application/catalog/CatalogService.js';

/**
 * Create the catalog router. Currently a placeholder returning 501
 * for unimplemented endpoints.
 */
export function createCatalogRouter(catalogService: CatalogService): Router {
  const router = Router();

  router.get('/products', async (req: Request, res: Response) => {
    try {
      const keyword = req.query['q'] as string | undefined;
      if (keyword) {
        const results = await catalogService.searchProducts(keyword);
        res.status(200).json(results);
      } else {
        // Without search, return categories as the browsing entry point
        const categories = await catalogService.getCategories();
        res.status(200).json({ categories });
      }
    } catch {
      res.status(500).json({ error: 'Catalog product listing failed.' });
    }
  });

  router.get('/products/:id', async (req: Request, res: Response) => {
    try {
      const productId = req.params['id'] as string;
      const product = await catalogService.getProductById(productId);
      if (!product) {
        res.status(404).json({ error: 'Product not found.' });
        return;
      }
      const variants = await catalogService.getVariantsByProductId(productId);
      res.status(200).json({ product, variants });
    } catch {
      res.status(500).json({ error: 'Catalog product detail failed.' });
    }
  });

  router.get('/categories', async (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Catalog categories listing not yet implemented.' });
  });

  router.get('/categories/:id', async (_req: Request, res: Response) => {
    res.status(501).json({ error: 'Catalog category detail not yet implemented.' });
  });

  return router;
}
