/**
 * Express API Routes — Cart & Checkout Module
 *
 * Placeholder router for the cart and checkout module.
 * Returns 501 Not Implemented for unimplemented routes.
 *
 * Future endpoints:
 *  - GET    /cart              — get current cart
 *  - POST   /cart/items        — add item to cart
 *  - PUT    /cart/items/:id    — update cart item quantity
 *  - DELETE /cart/items/:id    — remove item from cart
 *  - POST   /cart/checkout     — place order
 *
 * Requirements: 5.7
 */

import { Router, type Request, type Response } from 'express';
import type { ICartService } from '../../application/cart/CartService.js';
import type { ICheckoutService } from '../../application/cart/CheckoutService.js';

/**
 * Create the cart router with endpoints wired to the given services.
 */
export function createCartRouter(
  cartService: ICartService,
  checkoutService: ICheckoutService,
): Router {
  const router = Router();

  router.get('/', async (req: Request, res: Response) => {
    try {
      const customerId = req.query['customerId'] as string | undefined;
      if (!customerId) {
        res.status(400).json({ error: 'customerId query parameter is required.' });
        return;
      }
      const cart = await cartService.getCart(customerId);
      res.status(200).json(cart);
    } catch {
      res.status(501).json({ error: 'Cart retrieval not yet fully implemented.' });
    }
  });

  router.post('/items', async (req: Request, res: Response) => {
    try {
      const { customerId, variantId } = req.body;
      if (!customerId || !variantId) {
        res.status(400).json({ error: 'customerId and variantId are required.' });
        return;
      }
      const result = await cartService.addItem(customerId, variantId);
      res.status(200).json(result);
    } catch {
      res.status(501).json({ error: 'Add to cart not yet fully implemented.' });
    }
  });

  router.put('/items/:variantId', async (req: Request, res: Response) => {
    try {
      const variantId = req.params['variantId'] as string;
      const { customerId, quantity } = req.body;
      if (!customerId) {
        res.status(400).json({ error: 'customerId is required.' });
        return;
      }
      const result = await cartService.updateQuantity(customerId, variantId, quantity);
      res.status(200).json(result);
    } catch {
      res.status(501).json({ error: 'Update cart item not yet fully implemented.' });
    }
  });

  router.delete('/items/:variantId', async (req: Request, res: Response) => {
    try {
      const variantId = req.params['variantId'] as string;
      const customerId = req.query['customerId'] as string | undefined;
      if (!customerId) {
        res.status(400).json({ error: 'customerId query parameter is required.' });
        return;
      }
      const result = await cartService.removeItem(customerId, variantId);
      res.status(200).json(result);
    } catch {
      res.status(501).json({ error: 'Remove cart item not yet fully implemented.' });
    }
  });

  router.post('/checkout', async (req: Request, res: Response) => {
    try {
      const { customerId, addressId, deliveryOptionId, paymentMethodId } = req.body;
      if (!customerId || !addressId || !paymentMethodId) {
        res.status(400).json({ error: 'customerId, addressId, and paymentMethodId are required.' });
        return;
      }
      const result = await checkoutService.placeOrder(customerId, {
        addressId,
        deliveryOptionId: deliveryOptionId ?? 'standard',
        paymentMethodId,
      });
      res.status(201).json(result);
    } catch {
      res.status(501).json({ error: 'Checkout not yet fully implemented.' });
    }
  });

  return router;
}
