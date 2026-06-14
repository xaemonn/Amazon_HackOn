import { Router, type Request, type Response } from 'express';
import { randomUUID } from 'crypto';
import type { IOrderRepository, Order } from '../../domain/ordering/index.js';
import type { OrderItem } from '../../domain/ordering/OrderItem.js';
import { CATALOG_PRODUCTS } from './catalogRoutes.js';

// ─── Auth middleware helper ────────────────────────────────────────────────────

const DEMO_CUSTOMER_ID = 'customer-001';

function getCustomerId(_req: Request): string {
  // In demo mode all authenticated requests resolve to the demo customer.
  // A real implementation would decode the JWT here.
  return DEMO_CUSTOMER_ID;
}

function requireAuth(req: Request, res: Response): boolean {
  const authHeader = req.headers.authorization;
  const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!token) {
    res.status(401).json({ error: 'Not authenticated.' });
    return false;
  }
  return true;
}

// ─── Route Factory ────────────────────────────────────────────────────────────

export function createOrdersRouter(orderRepo: IOrderRepository): Router {
  const router = Router();

  // GET /orders — all orders for the authenticated customer
  router.get('/', async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const customerId = getCustomerId(req);
    const orders = await orderRepo.findByCustomerId(customerId);
    const sorted = orders.slice().sort(
      (a, b) => b.placedDate.getTime() - a.placedDate.getTime(),
    );
    res.json({ orders: sorted });
  });

  // GET /orders/:id — single order (ownership-checked)
  router.get('/:id', async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const customerId = getCustomerId(req);
    const order = await orderRepo.findById(req.params['id'] as string);
    if (!order || order.customerId !== customerId) {
      res.status(404).json({ error: 'Order not found.' });
      return;
    }
    res.json(order);
  });

  // POST /orders/checkout — place a new order from cart items
  router.post('/checkout', async (req: Request, res: Response) => {
    if (!requireAuth(req, res)) return;
    const customerId = getCustomerId(req);

    const { items, paymentType } = req.body as {
      items: Array<{ productId: string; quantity: number }>;
      paymentType?: 'prepaid' | 'cod';
    };

    if (!Array.isArray(items) || items.length === 0) {
      res.status(400).json({ error: 'Cart is empty.' });
      return;
    }

    const orderId = `order-${randomUUID().slice(0, 8)}`;
    const now = new Date();
    const deliveryDate = new Date(now.getTime() + 3 * 24 * 60 * 60 * 1000);

    const orderItems: OrderItem[] = [];

    for (const cartItem of items) {
      const product = CATALOG_PRODUCTS.find((p) => p.id === cartItem.productId);
      if (!product) {
        res.status(400).json({ error: `Product '${cartItem.productId}' not found.` });
        return;
      }
      if (!product.inStock) {
        res.status(400).json({ error: `'${product.name}' is out of stock.` });
        return;
      }

      const itemId = `oi-${randomUUID().slice(0, 8)}`;
      orderItems.push({
        id: itemId,
        orderId,
        customerId,
        productId: product.id,
        variantId: `var-${product.id}`,
        productName: product.name,
        productImage: product.emoji,
        unitPrice: product.price,
        quantity: cartItem.quantity,
        deliveryDate,
        deliveryStatus: 'pending',
        refundStatus: { code: 'none', amount: null, currency: null, issuedAt: null },
      });
    }

    const order: Order = {
      id: orderId,
      customerId,
      placedDate: now,
      status: 'placed',
      paymentType: paymentType ?? 'prepaid',
      items: orderItems,
    };

    await orderRepo.save(order);

    res.status(201).json(order);
  });

  return router;
}
