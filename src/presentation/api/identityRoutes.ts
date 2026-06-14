/**
 * Express API Routes — Identity Module
 *
 * Implements the HTTP API for the identity/auth flow:
 *  - POST /identity/otp/send       — send OTP to contact
 *  - POST /identity/otp/verify     — verify OTP and get session token
 *  - POST /identity/logout         — invalidate session
 *  - GET  /identity/me             — get authenticated customer
 *
 * Also exports reusable auth middleware for use by other route files.
 *
 * Requirements: 1.1, 2.1, 2.4, 2.5, 2.6, 14.1, 14.4
 */

import { Router, type Request, type Response, type NextFunction } from 'express';
import type { IdentityService } from '../../application/identity/IdentityService.js';
import { OtpInvalidError, OtpExpiredError, OtpLockedError, ContactAlreadyRegisteredError } from '../../domain/identity/errors.js';
import type { Customer } from '../../domain/shared/IAuthService.js';

// ─── Augment Express Request with auth context ───────────────────────────────

declare global {
  namespace Express {
    interface Request {
      /** Authenticated customer, set by authMiddleware */
      customer?: Customer;
      /** Session token extracted from Authorization header */
      sessionToken?: string;
    }
  }
}

// ─── Auth Middleware ─────────────────────────────────────────────────────────

/**
 * Reusable auth middleware that extracts `Authorization: Bearer <token>` header,
 * calls `identityService.authenticate(token)`, attaches the customer to
 * `req.customer`, and responds 401 if absent or invalid.
 *
 * Other route files (account, orders) can import and use this middleware.
 */
export function createAuthMiddleware(identityService: IdentityService) {
  return async (req: Request, res: Response, next: NextFunction): Promise<void> => {
    const authHeader = req.headers['authorization'];

    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      res.status(401).json({ error: 'Authentication required. Provide Authorization: Bearer <token> header.' });
      return;
    }

    const token = authHeader.slice(7); // Remove "Bearer " prefix

    if (!token) {
      res.status(401).json({ error: 'Authentication required. Token is empty.' });
      return;
    }

    try {
      const customer = await identityService.authenticate(token);

      if (!customer) {
        res.status(401).json({ error: 'Invalid or expired session token.' });
        return;
      }

      req.customer = customer;
      req.sessionToken = token;
      next();
    } catch {
      res.status(401).json({ error: 'Authentication failed.' });
    }
  };
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Create the identity router with all endpoints wired to the given service.
 */
export function createIdentityRouter(identityService: IdentityService): Router {
  const router = Router();
  const authMiddleware = createAuthMiddleware(identityService);

  // ── POST /identity/otp/send ────────────────────────────────────────────────

  router.post('/otp/send', async (req: Request, res: Response) => {
    try {
      const { contact } = req.body;

      if (!contact || typeof contact !== 'string' || contact.trim().length === 0) {
        res.status(400).json({ error: 'contact is required and must be a non-empty string.' });
        return;
      }

      const result = await identityService.sendOtp(contact.trim());

      // Per spec: 409 on ContactAlreadyRegisteredError is treated as redirect-to-login
      // However the sendOtp method doesn't throw that error — it returns isExistingCustomer flag.
      // If isExistingCustomer is true, return 200 with the flag so the frontend knows to redirect.
      res.status(200).json(result);
    } catch (error) {
      if (error instanceof Error && error.message === 'Invalid contact format') {
        res.status(400).json({ error: 'Invalid contact format. Provide a valid email or E.164 phone number.' });
        return;
      }
      if (error instanceof ContactAlreadyRegisteredError) {
        res.status(409).json({ isExistingCustomer: true });
        return;
      }
      console.error('[Identity API] otp/send error:', error);
      res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  // ── POST /identity/otp/verify ──────────────────────────────────────────────

  router.post('/otp/verify', async (req: Request, res: Response) => {
    try {
      const { contact, code } = req.body;

      if (!contact || typeof contact !== 'string' || contact.trim().length === 0) {
        res.status(400).json({ error: 'contact is required and must be a non-empty string.' });
        return;
      }

      if (!code || typeof code !== 'string' || code.trim().length === 0) {
        res.status(400).json({ error: 'code is required and must be a non-empty string.' });
        return;
      }

      const result = await identityService.verifyOtp(contact.trim(), code.trim());
      res.status(200).json({ token: result.token });
    } catch (error) {
      if (error instanceof OtpInvalidError) {
        res.status(401).json({ error: 'Invalid OTP code.' });
        return;
      }
      if (error instanceof OtpExpiredError) {
        res.status(401).json({ error: 'OTP has expired. Please request a new one.' });
        return;
      }
      if (error instanceof OtpLockedError) {
        res.status(429).json({
          error: 'Too many failed attempts. Please wait before trying again.',
          retryAfterMs: error.retryAfterMs,
        });
        return;
      }
      console.error('[Identity API] otp/verify error:', error);
      res.status(500).json({ error: 'An internal error occurred. Please try again.' });
    }
  });

  // ── POST /identity/logout ──────────────────────────────────────────────────

  router.post('/logout', async (req: Request, res: Response) => {
    try {
      const authHeader = req.headers['authorization'];
      const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

      if (token) {
        await identityService.logout(token);
      }

      // Always 200 (idempotent) — even if no token was provided
      res.status(200).json({ message: 'Logged out successfully.' });
    } catch {
      // Idempotent: always respond 200 regardless of errors
      res.status(200).json({ message: 'Logged out successfully.' });
    }
  });

  // ── GET /identity/me ───────────────────────────────────────────────────────

  router.get('/me', authMiddleware, (req: Request, res: Response) => {
    // authMiddleware guarantees req.customer is set if we reach here
    res.status(200).json(req.customer);
  });

  return router;
}
