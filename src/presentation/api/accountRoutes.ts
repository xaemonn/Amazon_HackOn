/**
 * Express API Routes — Account Module
 *
 * Implements the HTTP API for account management:
 *  - GET    /account/profile           — get customer profile
 *  - PUT    /account/profile           — update profile (name)
 *  - GET    /account/addresses         — list addresses (default-first)
 *  - POST   /account/addresses         — add a new address
 *  - PUT    /account/addresses/:id     — update an address
 *  - DELETE /account/addresses/:id     — remove an address
 *  - PUT    /account/addresses/:id/default — set address as default
 *  - GET    /account/payment-methods   — list payment methods
 *  - POST   /account/payment-methods   — add a payment method
 *  - DELETE /account/payment-methods/:id — remove a payment method
 *  - GET    /account/notifications     — get notification preferences
 *  - PUT    /account/notifications     — update notification preferences
 *
 * All routes require authentication (401 if unauthenticated).
 * Cross-customer guard: returns 403 if path param customerId doesn't match session.
 *
 * Requirements: 3.1, 3.2, 3.3, 4.1, 4.6, 5.1, 5.2, 5.3, 6.1, 6.2, 14.3
 */

import { Router, type Request, type Response } from 'express';
import type { IAuthService } from '../../domain/shared/IAuthService.js';
import type { AccountService } from '../../application/account/AccountService.js';
import {
  AddressValidationError,
  AddressNotFoundError,
  DuplicatePaymentMethodError,
  PaymentMethodCapExceededError,
  PaymentMethodNotFoundError,
  CustomerNotFoundError,
} from '../../domain/account/errors.js';
import { createAuthMiddleware } from './middleware/authMiddleware.js';

/**
 * Create the account router with all endpoints wired to the given services.
 */
export function createAccountRouter(
  authService: IAuthService,
  accountService: AccountService,
): Router {
  const router = Router();

  // Apply auth middleware to all account routes
  router.use(createAuthMiddleware(authService));

  // ── Profile ─────────────────────────────────────────────────────────────────

  /**
   * GET /account/profile
   * Returns the authenticated customer's profile.
   */
  router.get('/profile', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const customer = await accountService.getCustomer(customerId);

      if (!customer) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      res.status(200).json(customer);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * PUT /account/profile
   * Updates the authenticated customer's name.
   * Body: { name: string }
   */
  router.put('/profile', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const { name } = req.body;

      if (name === undefined || name === null) {
        res.status(400).json({ error: 'name field is required.' });
        return;
      }

      const updated = await accountService.updateProfile(customerId, { name: String(name) });
      res.status(200).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  // ── Addresses ───────────────────────────────────────────────────────────────

  /**
   * GET /account/addresses
   * Returns the authenticated customer's address book, sorted default-first.
   */
  router.get('/addresses', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const customer = await accountService.getCustomer(customerId);

      if (!customer) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      // Sort default-first
      const sorted = [...customer.addresses].sort((a, b) => {
        if (a.isDefault && !b.isDefault) return -1;
        if (!a.isDefault && b.isDefault) return 1;
        return 0;
      });

      res.status(200).json(sorted);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * POST /account/addresses
   * Adds a new address to the authenticated customer's address book.
   * Body: { recipientName, streetLine1, city, state, pincode, country }
   */
  router.post('/addresses', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const { recipientName, streetLine1, city, state, pincode, country } = req.body;

      const updated = await accountService.addAddress(customerId, {
        recipientName: recipientName ?? '',
        streetLine1: streetLine1 ?? '',
        city: city ?? '',
        state: state ?? '',
        pincode: pincode ?? '',
        country: country ?? '',
      });

      res.status(201).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * PUT /account/addresses/:id
   * Updates an existing address.
   * Body: partial address fields
   */
  router.put('/addresses/:id', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const addressId = req.params['id'] as string;
      const fields = req.body;

      const updated = await accountService.updateAddress(customerId, addressId, fields);
      res.status(200).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * DELETE /account/addresses/:id
   * Removes an address from the address book.
   */
  router.delete('/addresses/:id', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const addressId = req.params['id'] as string;

      const updated = await accountService.removeAddress(customerId, addressId);
      res.status(200).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * PUT /account/addresses/:id/default
   * Sets the specified address as the default.
   */
  router.put('/addresses/:id/default', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const addressId = req.params['id'] as string;

      const updated = await accountService.setDefaultAddress(customerId, addressId);
      res.status(200).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  // ── Payment Methods ─────────────────────────────────────────────────────────

  /**
   * GET /account/payment-methods
   * Returns the authenticated customer's payment methods.
   */
  router.get('/payment-methods', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const methods = await accountService.getPaymentMethods(customerId);
      res.status(200).json(methods);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * POST /account/payment-methods
   * Adds a new payment method.
   * Body: { type: 'upi' | 'card' | 'cod', ...typeSpecificFields }
   */
  router.post('/payment-methods', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const method = req.body;

      if (!method || !method.type) {
        res.status(400).json({ error: 'Payment method type is required.' });
        return;
      }

      const updated = await accountService.addPaymentMethod(customerId, method);
      res.status(201).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * DELETE /account/payment-methods/:id
   * Removes a payment method.
   */
  router.delete('/payment-methods/:id', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const methodId = req.params['id'] as string;

      const updated = await accountService.removePaymentMethod(customerId, methodId);
      res.status(200).json(updated);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  // ── Notification Preferences ────────────────────────────────────────────────

  /**
   * GET /account/notifications
   * Returns the authenticated customer's notification preferences.
   */
  router.get('/notifications', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const customer = await accountService.getCustomer(customerId);

      if (!customer) {
        res.status(404).json({ error: 'Customer not found.' });
        return;
      }

      res.status(200).json(customer.notificationPreferences);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  /**
   * PUT /account/notifications
   * Updates notification preferences (partial update, deep-merge).
   * Body: Partial<NotificationPreferences>
   */
  router.put('/notifications', async (req: Request, res: Response) => {
    try {
      const customerId = req.authenticatedCustomer!.id;
      const prefs = req.body;

      const updated = await accountService.updateNotificationPreferences(customerId, prefs);
      res.status(200).json(updated.notificationPreferences);
    } catch (error) {
      handleAccountError(res, error);
    }
  });

  return router;
}

// ─── Error Handler ───────────────────────────────────────────────────────────

function handleAccountError(res: Response, error: unknown): void {
  if (error instanceof AddressValidationError) {
    res.status(400).json({
      error: error.message,
      invalidFields: error.invalidFields,
    });
    return;
  }

  if (error instanceof AddressNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof DuplicatePaymentMethodError) {
    res.status(409).json({ error: error.message });
    return;
  }

  if (error instanceof PaymentMethodCapExceededError) {
    res.status(400).json({ error: error.message });
    return;
  }

  if (error instanceof PaymentMethodNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }

  if (error instanceof CustomerNotFoundError) {
    res.status(404).json({ error: error.message });
    return;
  }

  // Generic server error
  console.error('[Account API] Unhandled error:', error);
  res.status(500).json({ error: 'An internal error occurred. Please try again.' });
}
