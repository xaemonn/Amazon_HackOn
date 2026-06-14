/**
 * Express API Routes — Orders
 *
 * Implements the HTTP API for the ordering module:
 *  - GET /orders                         — list all orders for the authenticated customer
 *  - GET /orders/:orderId                — get order detail (404 if not found or cross-customer)
 *  - GET /orders/items/:orderItemId/eligibility — check return eligibility for an item
 *
 * All routes require authentication via Bearer token.
 *
 * Requirements: 7.1, 7.3, 8.1, 8.4, 9.1, 9.5, 14.3, 14.4
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { IAuthService, Customer } from '../../domain/shared/IAuthService.js';
import type { IOrdersService } from '../../application/ordering/OrdersService.js';

// ─── Auth Middleware ──────────────────────────────────────────────────────────

/**
 * Augment Express Request with authenticated session data.
 */
export interface AuthenticatedRequest extends Request {
  session?: {
    customerId: string;
    customer: Customer;
  };
}

/**
 * Create an auth middleware that verifies the Bearer token via IAuthService.
 * Attaches session data (customerId + customer) to the request.
 * Returns 401 if the token is missing, invalid, or expired.
 */
export function createAuthMiddleware(authService: IAuthService) {
  return async (req: AuthenticatedRequest, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Provide a Bearer token.' });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix

    try {
      const customer = await authService.authenticate(token);

      if (!customer) {
        res.status(401).json({ error: 'Invalid or expired token.' });
        return;
      }

      // Attach session info to the request
      req.session = {
        customerId: customer.id,
        customer,
      };

      next();
    } catch (error) {
      console.error('[AuthMiddleware] Authentication error:', error);
      res.status(401).json({ error: 'Authentication failed.' });
    }
  };
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Create the orders router with all endpoints wired to the given service.
 * All routes are protected by the auth middleware.
 */
export function createOrdersRouter(
  ordersService: IOrdersService,
  authService: IAuthService,
): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(authService);

  // Apply auth middleware to all routes
  router.use(authMiddleware);

  // ── GET /orders — List all orders for authenticated customer ─────────────

  router.get('/', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { customerId } = req.session!;
      const orders = await ordersService.getOrdersByCustomer(customerId);

      res.status(200).json(orders);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── GET /orders/items/:orderItemId/eligibility — Check return eligibility ─
  // NOTE: This route MUST be defined before /orders/:orderId to prevent
  // 'items' from being captured as an orderId param.

  router.get('/items/:orderItemId/eligibility', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { customerId } = req.session!;
      const orderItemId = req.params['orderItemId'] as string;

      const eligibility = await ordersService.checkReturnEligibility(customerId, orderItemId);

      // Always returns 200 — errors surface as eligible: false
      res.status(200).json({
        eligible: eligibility.eligible,
        daysRemaining: eligibility.daysRemaining,
        policyExpirationDate: eligibility.policyExpirationDate
          ? eligibility.policyExpirationDate.toISOString()
          : null,
        productName: eligibility.productName,
        productImage: eligibility.productImage,
        orderDate: eligibility.orderDate instanceof Date
          ? eligibility.orderDate.toISOString().split('T')[0]
          : eligibility.orderDate,
        errorMessage: eligibility.errorMessage ?? null,
      });
    } catch (error) {
      // Even on unexpected errors, return 200 with eligible: false
      res.status(200).json({
        eligible: false,
        daysRemaining: null,
        policyExpirationDate: null,
        productName: '',
        productImage: '',
        orderDate: null,
        errorMessage: 'Eligibility check temporarily unavailable',
      });
    }
  });

  // ── GET /orders/:orderId — Get order detail ──────────────────────────────

  router.get('/:orderId', async (req: AuthenticatedRequest, res: Response) => {
    try {
      const { customerId } = req.session!;
      const orderId = req.params['orderId'] as string;

      const order = await ordersService.getOrderDetail(customerId, orderId);

      if (!order) {
        // 404 — either order doesn't exist or belongs to another customer
        // No data leak: same response in both cases
        res.status(404).json({ error: 'Order not found.' });
        return;
      }

      res.status(200).json(order);
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

// ─── Error Handler ───────────────────────────────────────────────────────────

function handleError(res: Response, error: unknown): void {
  if (error instanceof Error) {
    console.error('[OrdersAPI] Error:', error.message);
  } else {
    console.error('[OrdersAPI] Unknown error:', error);
  }
  res.status(500).json({ error: 'An internal error occurred. Please try again.' });
}
