/**
 * Judge test harness — lets a judge (the one-click demo/judge login) add their
 * own product with up to 3 reference images, which immediately:
 *   1. stores the images as the product's catalog reference set, and
 *   2. creates a delivered order for the judge,
 * so the judge can run the full return → AI-grading flow against the exact
 * images they just supplied.
 *
 * Gated to the judge login only (JWT `demo` flag).
 *
 *   POST /api/judge/products   { name, images: dataUrl[] }  → { productId, orderItemId, orderId }
 */

import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import * as fs from 'fs/promises';
import * as path from 'path';
import type { IOrderRepository, Order } from '../../domain/ordering/index.js';
import type { OrderItem as OrderingOrderItem } from '../../domain/ordering/OrderItem.js';
import type { MockAuthService } from '../../infrastructure/auth/MockAuthService.js';
import { verifyToken } from './authRoutes.js';

const CATALOG_DIR = path.resolve('./uploads/catalog');
const DAY_MS = 24 * 60 * 60 * 1000;
const MAX_IMAGES = 3;

/** Parse a data URL (or raw base64) into { buffer, ext }. */
function parseImage(dataUrl: string): { buffer: Buffer; ext: 'jpg' | 'png' } | null {
  const m = /^data:image\/(jpeg|jpg|png);base64,(.+)$/i.exec(dataUrl.trim());
  if (m) {
    const ext = m[1]!.toLowerCase() === 'png' ? 'png' : 'jpg';
    return { buffer: Buffer.from(m[2]!, 'base64'), ext };
  }
  // Raw base64 (assume jpeg)
  try {
    return { buffer: Buffer.from(dataUrl, 'base64'), ext: 'jpg' };
  } catch {
    return null;
  }
}

export function createJudgeRouter(
  orderRepo: IOrderRepository,
  authService: MockAuthService,
): Router {
  const router = Router();

  // POST /judge/products — add a product (name + up to 3 images) and seed it
  // into the judge's order history for return testing.
  router.post('/products', async (req: Request, res: Response) => {
    // ── Auth: judge login only ────────────────────────────────────────────
    const token = req.headers.authorization?.replace(/^Bearer\s+/i, '').trim();
    const payload = token ? verifyToken(token) : null;
    if (!payload) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    if (payload.demo !== true) {
      res.status(403).json({ error: 'The product test harness is available on the Judge login only.' });
      return;
    }

    const { name, images } = req.body as { name?: string; images?: string[] };
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'Product name is required.' });
      return;
    }
    if (!Array.isArray(images) || images.length === 0) {
      res.status(400).json({ error: 'At least one product image is required.' });
      return;
    }

    const customerId = payload.userId;
    const productId = `judge-${randomUUID().slice(0, 8)}`;

    try {
      await fs.mkdir(CATALOG_DIR, { recursive: true });

      // Save up to 3 reference images as catalog/<productId>_N.<ext>
      const catalogImageRefs: string[] = [];
      const used = images.slice(0, MAX_IMAGES);
      for (let i = 0; i < used.length; i++) {
        const parsed = parseImage(used[i]!);
        if (!parsed || parsed.buffer.length === 0) {
          res.status(400).json({ error: `Image ${i + 1} is not a valid image.` });
          return;
        }
        const filename = `${productId}_${i + 1}.${parsed.ext}`;
        await fs.writeFile(path.join(CATALOG_DIR, filename), parsed.buffer);
        catalogImageRefs.push(`catalog/${filename}`);
      }

      // Primary image URL (served by the catalog images endpoint).
      const primaryRef = catalogImageRefs[0]!;
      const primaryFileBase = path.basename(primaryRef, path.extname(primaryRef)); // <productId>_1
      const productImage = `/api/catalog/images/${primaryFileBase}`;

      // ── Create a delivered order for the judge ──────────────────────────
      const orderId = `order-judge-${randomUUID().slice(0, 6)}`;
      const orderItemId = `oi-${productId}`;
      const deliveryDate = new Date(Date.now() - 1 * DAY_MS);

      const orderingItem: OrderingOrderItem = {
        id: orderItemId,
        orderId,
        customerId,
        productId,
        variantId: `var-${productId}`,
        productName: name.trim(),
        productImage,
        unitPrice: 999,
        quantity: 1,
        deliveryDate,
        deliveryStatus: 'delivered',
        refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
      };
      const order: Order = {
        id: orderId,
        customerId,
        placedDate: new Date(Date.now() - 2 * DAY_MS),
        status: 'delivered',
        paymentType: 'prepaid',
        items: [orderingItem],
      };
      await orderRepo.save(order);

      // Register the auth-side order item so return eligibility + grading work,
      // carrying the full multi-image catalog reference set.
      authService.addOrderItem({
        id: orderItemId,
        orderId,
        productId,
        customerId,
        deliveryDate,
        price: 999,
        currency: 'INR',
        productName: name.trim(),
        productImage,
        catalogImageRef: primaryRef,
        catalogImageRefs,
      });

      console.log('[Judge] Added test product', { productId, orderItemId, images: catalogImageRefs.length });
      res.status(201).json({
        productId,
        orderItemId,
        orderId,
        productName: name.trim(),
        productImage,
        catalogImageRefs,
        message: 'Product added to your orders. Open "Your Orders" to start a return and test grading.',
      });
    } catch (err) {
      console.error('[Judge] Failed to add product:', err);
      res.status(500).json({ error: 'Failed to add product. Please try again.' });
    }
  });

  return router;
}
