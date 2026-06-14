/**
 * Auth Middleware — Express middleware for authentication and cross-customer guard.
 *
 * Extracts the Bearer token from the Authorization header, calls
 * `IAuthService.authenticate(token)`, and attaches the authenticated customer
 * to the request context. Returns 401 if the token is missing or invalid.
 *
 * Requirements: 14.1, 14.3, 14.4
 */

import type { Request, Response, NextFunction } from 'express';
import type { IAuthService, Customer } from '../../../domain/shared/IAuthService.js';

/**
 * Augment Express Request to carry the authenticated customer.
 */
declare global {
  namespace Express {
    interface Request {
      authenticatedCustomer?: Customer;
    }
  }
}

/**
 * Creates an Express middleware that authenticates requests via Bearer token.
 * Responds with 401 if no valid token is present.
 */
export function createAuthMiddleware(authService: IAuthService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Provide a valid Bearer token.' });
      return;
    }

    const token = authHeader.slice(7); // Remove 'Bearer ' prefix
    if (!token) {
      res.status(401).json({ error: 'Authentication required. Provide a valid Bearer token.' });
      return;
    }

    try {
      const customer = await authService.authenticate(token);
      if (!customer) {
        res.status(401).json({ error: 'Invalid or expired session token.' });
        return;
      }

      req.authenticatedCustomer = customer;
      next();
    } catch {
      res.status(401).json({ error: 'Authentication failed.' });
    }
  };
}
