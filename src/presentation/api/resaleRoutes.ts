/**
 * Express API Routes — Resale Marketplace
 *
 *  GET    /resale/listings?city=&scope=        — browse active (or all) listings
 *  GET    /resale/listings/:id                 — single listing
 *  POST   /resale/listings/:id/purchase        — buy (direct transfer vs ship)
 *  POST   /resale/listings/:id/accept-keep-offer — owner accepts gift-card offer
 *  POST   /resale/listings/:id/force-expire     — demo: lapse the window now
 *  POST   /resale/expire                        — run the expiry sweep
 *  DELETE /resale/dev/clear                     — dev: wipe all listings
 *
 * All routes delegate to ResaleService.
 */

import { Router, type Request, type Response } from 'express';
import type { ResaleService } from '../../application/resale/index.js';
import { ListingNotPurchasableError } from '../../domain/resale/index.js';

function handleError(res: Response, error: unknown): void {
  if (error instanceof ListingNotPurchasableError) {
    res.status(409).json({ error: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'An unexpected error occurred.';
  if (message.includes('not found')) {
    res.status(404).json({ error: message });
    return;
  }
  console.error('[resaleRoutes] error:', error);
  res.status(500).json({ error: message });
}

export function createResaleRouter(resaleService: ResaleService): Router {
  const router = Router();

  // ── Browse listings ─────────────────────────────────────────────────────
  router.get('/listings', async (req: Request, res: Response) => {
    try {
      const city = (req.query['city'] as string | undefined)?.trim() || undefined;
      const scope = req.query['scope'] as string | undefined;
      const listings = scope === 'all'
        ? await resaleService.getAll()
        : await resaleService.listActive(city);
      res.json({ listings, total: listings.length });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Single listing ──────────────────────────────────────────────────────
  router.get('/listings/:id', async (req: Request, res: Response) => {
    try {
      const listing = await resaleService.getById(req.params['id'] as string);
      if (!listing) {
        res.status(404).json({ error: 'Listing not found.' });
        return;
      }
      res.json(listing);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Purchase ────────────────────────────────────────────────────────────
  router.post('/listings/:id/purchase', async (req: Request, res: Response) => {
    try {
      const { buyerCustomerId, buyerCity } = req.body as {
        buyerCustomerId?: string;
        buyerCity?: string;
      };
      if (!buyerCustomerId || !buyerCity) {
        res.status(400).json({ error: 'buyerCustomerId and buyerCity are required.' });
        return;
      }
      const result = await resaleService.purchase({
        listingId: req.params['id'] as string,
        buyerCustomerId,
        buyerCity,
      });
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Accept Grade C keep-offer ───────────────────────────────────────────
  router.post('/listings/:id/accept-keep-offer', async (req: Request, res: Response) => {
    try {
      const listing = await resaleService.acceptKeepOffer(req.params['id'] as string);
      res.json(listing);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Re-grade a marked-down listing with fresh photos ────────────────────
  // Body: { media: MediaReference[] } — the new return photos the seller uploaded.
  router.post('/listings/:id/regrade', async (req: Request, res: Response) => {
    try {
      const { media } = req.body as { media?: Array<Record<string, unknown>> };
      if (!Array.isArray(media) || media.length === 0) {
        res.status(400).json({ error: 'media must be a non-empty array of new return photos.' });
        return;
      }
      const refs = media.map((m) => ({
        id: String(m['id'] ?? ''),
        type: m['type'] as never,
        storageKey: String(m['storageKey'] ?? ''),
        format: m['format'] as never,
        sizeBytes: Number(m['sizeBytes'] ?? 0),
        capturedAt: new Date(),
      }));
      const listing = await resaleService.regrade(req.params['id'] as string, refs);
      res.json(listing);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Demo: force the window to lapse now ─────────────────────────────────
  router.post('/listings/:id/force-expire', async (req: Request, res: Response) => {
    try {
      const listing = await resaleService.forceExpire(req.params['id'] as string);
      res.json(listing);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Run the expiry sweep ────────────────────────────────────────────────
  router.post('/expire', async (_req: Request, res: Response) => {
    try {
      const result = await resaleService.expireDue();
      res.json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── Dev: clear all listings ─────────────────────────────────────────────
  router.delete('/dev/clear', (_req: Request, res: Response) => {
    resaleService.clear();
    res.json({ message: 'All resale listings cleared.' });
  });

  return router;
}
