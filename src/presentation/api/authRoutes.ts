import { Router, type Request, type Response } from 'express';
import type { MockAuthService } from '../../infrastructure/auth/MockAuthService.js';

// ─── Demo credentials ─────────────────────────────────────────────────────────

const DEMO_EMAIL = 'priya@example.com';
const DEMO_NAME = 'Priya Sharma';
const DEMO_CUSTOMER_ID = 'customer-001';

// Simple in-memory session store: token → customerId
const activeSessions = new Map<string, string>();

// In-memory profile overrides (demo)
interface ProfileOverride {
  name?: string;
  phone?: string;
  address?: {
    street: string;
    city: string;
    state: string;
    pincode: string;
  };
}
const profileOverrides = new Map<string, ProfileOverride>();

function generateToken(email: string): string {
  return `slc_${Buffer.from(email).toString('base64')}_${Date.now()}`;
}

// ─── Route Factory ────────────────────────────────────────────────────────────

export function createAuthRouter(authService: MockAuthService): Router {
  const router = Router();

  // POST /auth/login — accepts any email for demo; returns demo user
  router.post('/login', async (req: Request, res: Response) => {
    const { email, password: _password } = req.body;

    if (!email || typeof email !== 'string') {
      res.status(400).json({ error: 'email is required.' });
      return;
    }

    const trimmed = email.trim().toLowerCase();
    if (!trimmed.includes('@')) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    // In demo mode every email maps to the seeded customer
    const token = generateToken(trimmed);
    activeSessions.set(token, DEMO_CUSTOMER_ID);

    res.json({
      token,
      customer: {
        id: DEMO_CUSTOMER_ID,
        name: DEMO_NAME,
        email: DEMO_EMAIL,
      },
    });
  });

  // GET /auth/me — validate token and return current user
  router.get('/me', async (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();

    if (!token) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }

    const customerId = activeSessions.get(token);
    if (!customerId) {
      // Also accept the legacy demo-session-token from seed data
      if (token !== 'demo-session-token') {
        res.status(401).json({ error: 'Session expired. Please log in again.' });
        return;
      }
    }

    const overrides = profileOverrides.get(DEMO_CUSTOMER_ID) ?? {};
    res.json({
      id: DEMO_CUSTOMER_ID,
      name: overrides.name ?? DEMO_NAME,
      email: DEMO_EMAIL,
      phone: overrides.phone ?? null,
      address: overrides.address ?? null,
    });
  });

  // PATCH /auth/profile — update name, phone, address
  router.patch('/profile', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (!token || (!activeSessions.has(token) && token !== 'demo-session-token')) {
      res.status(401).json({ error: 'Not authenticated.' });
      return;
    }
    const { name, phone, address } = req.body as ProfileOverride & { name?: string };
    const customerId = DEMO_CUSTOMER_ID;
    const existing = profileOverrides.get(customerId) ?? {};
    const updated: ProfileOverride = { ...existing };
    if (name !== undefined) updated.name = String(name).trim();
    if (phone !== undefined) updated.phone = String(phone).trim();
    if (address !== undefined) updated.address = address;
    profileOverrides.set(customerId, updated);

    res.json({
      id: customerId,
      name: updated.name ?? DEMO_NAME,
      email: DEMO_EMAIL,
      phone: updated.phone ?? null,
      address: updated.address ?? null,
    });
  });

  // POST /auth/logout
  router.post('/logout', (req: Request, res: Response) => {
    const authHeader = req.headers.authorization;
    const token = authHeader?.replace(/^Bearer\s+/i, '').trim();
    if (token) activeSessions.delete(token);
    res.json({ message: 'Logged out.' });
  });

  return router;
}
