import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../infrastructure/auth/MongoUser.js';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-please-change';

export interface JwtPayload {
  userId: string;
  email: string;
  demo?: boolean;
}

// ─── Named demo accounts (work even when MongoDB is unavailable) ───────────────
// These mirror DEMO_USERS in seed/demoUsers.ts. Stable IDs so order history
// seeded against them is always reachable.

const NAMED_DEMOS: Array<{ id: string; name: string; email: string; password: string }> = [
  { id: 'seed-prince', name: 'Prince', email: 'prince@gmail.com', password: 'prince123' },
  { id: 'seed-priya',  name: 'Priya',  email: 'priya@gmail.com',  password: 'priya123'  },
];

// ─── Demo account (one-click sign-in, no DB required) ──────────────────────────

const DEMO_USER = {
  id: 'demo-user',
  name: 'Demo Shopper',
  email: 'demo@secondlife.shop',
};

// In-memory profile for the demo account so "Edit Profile" stays functional
// without persisting demo data to MongoDB.
const demoProfile: { name: string; phone: string | null; address: unknown } = {
  name: DEMO_USER.name,
  phone: null,
  address: null,
};

export function signToken(userId: string, email: string, demo = false): string {
  return jwt.sign({ userId, email, demo } as JwtPayload, JWT_SECRET, { expiresIn: '30d' });
}

export function verifyToken(token: string): JwtPayload | null {
  try {
    return jwt.verify(token, JWT_SECRET) as JwtPayload;
  } catch {
    return null;
  }
}

function extractToken(req: Request): string | null {
  const h = req.headers.authorization;
  if (!h?.startsWith('Bearer ')) return null;
  return h.slice(7).trim() || null;
}

// ─── Route Factory ────────────────────────────────────────────────────────────

export function createAuthRouter(): Router {
  const router = Router();

  // POST /auth/signup
  router.post('/signup', async (req: Request, res: Response) => {
    const { name, email, password } = req.body as Record<string, string>;

    if (!name?.trim())     { res.status(400).json({ error: 'Name is required.' }); return; }
    if (!email?.trim())    { res.status(400).json({ error: 'Email is required.' }); return; }
    if (!password)         { res.status(400).json({ error: 'Password is required.' }); return; }
    if (password.length < 6) { res.status(400).json({ error: 'Password must be at least 6 characters.' }); return; }

    const normalEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalEmail)) {
      res.status(400).json({ error: 'Please enter a valid email address.' });
      return;
    }

    try {
      const existing = await User.findOne({ email: normalEmail });
      if (existing) {
        res.status(409).json({ error: 'An account with this email already exists. Please sign in.' });
        return;
      }

      const passwordHash = await bcrypt.hash(password, 12);
      const user = await User.create({ name: name.trim(), email: normalEmail, passwordHash });

      const token = signToken(user._id.toString(), user.email);
      res.status(201).json({
        token,
        customer: { id: user._id.toString(), name: user.name, email: user.email },
      });
    } catch (err) {
      console.error('[Auth] Signup error:', err);
      res.status(500).json({ error: 'Failed to create account. Please try again.' });
    }
  });

  // POST /auth/login
  router.post('/login', async (req: Request, res: Response) => {
    const { email, password } = req.body as Record<string, string>;

    if (!email?.trim() || !password) {
      res.status(400).json({ error: 'Email and password are required.' });
      return;
    }

    const normalEmail = email.trim().toLowerCase();

    // ── In-memory fallback for named demo accounts ────────────────────────────
    // These work even when MongoDB is unreachable or seeding was skipped.
    const namedDemo = NAMED_DEMOS.find((d) => d.email === normalEmail);
    if (namedDemo && password === namedDemo.password) {
      // Try to find the real Mongo ID so order history links up; fall back to
      // the stable seed ID if Mongo is unavailable.
      let customerId = namedDemo.id;
      try {
        const mongoUser = await User.findOne({ email: normalEmail }).select('_id');
        if (mongoUser) customerId = mongoUser._id.toString();
      } catch { /* Mongo unavailable — use stable seed ID */ }

      const token = signToken(customerId, namedDemo.email);
      res.json({ token, customer: { id: customerId, name: namedDemo.name, email: namedDemo.email } });
      return;
    }

    try {
      const user = await User.findOne({ email: normalEmail });
      if (!user) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const valid = await bcrypt.compare(password, user.passwordHash);
      if (!valid) {
        res.status(401).json({ error: 'Invalid email or password.' });
        return;
      }

      const token = signToken(user._id.toString(), user.email);
      res.json({
        token,
        customer: { id: user._id.toString(), name: user.name, email: user.email },
      });
    } catch (err) {
      console.error('[Auth] Login error:', err);
      res.status(500).json({ error: 'Login failed. Please try again.' });
    }
  });

  // POST /auth/demo — instant one-click sign-in (no credentials, no DB needed)
  router.post('/demo', (_req: Request, res: Response) => {
    const token = signToken(DEMO_USER.id, DEMO_USER.email, true);
    res.json({
      token,
      customer: {
        id: DEMO_USER.id,
        name: demoProfile.name,
        email: DEMO_USER.email,
        phone: demoProfile.phone,
        address: demoProfile.address,
      },
    });
  });

  // GET /auth/me
  router.get('/me', async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: 'Not authenticated.' }); return; }

    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Session expired. Please log in again.' }); return; }

    // Demo account is served from memory, never the database
    if (payload.demo) {
      res.json({
        id: DEMO_USER.id,
        name: demoProfile.name,
        email: DEMO_USER.email,
        phone: demoProfile.phone,
        address: demoProfile.address,
      });
      return;
    }

    try {
      const user = await User.findById(payload.userId).select('-passwordHash');
      if (!user) { res.status(401).json({ error: 'User not found.' }); return; }
      res.json({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        address: user.address ?? null,
      });
    } catch {
      res.status(500).json({ error: 'Failed to fetch user.' });
    }
  });

  // PATCH /auth/profile
  router.patch('/profile', async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: 'Not authenticated.' }); return; }

    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Session expired.' }); return; }

    // Demo account updates stay in memory
    if (payload.demo) {
      const { name, phone, address } = req.body as Record<string, unknown>;
      if (name !== undefined)    demoProfile.name    = String(name).trim();
      if (phone !== undefined)   demoProfile.phone   = String(phone).trim();
      if (address !== undefined) demoProfile.address = address;
      res.json({
        id: DEMO_USER.id,
        name: demoProfile.name,
        email: DEMO_USER.email,
        phone: demoProfile.phone,
        address: demoProfile.address,
      });
      return;
    }

    try {
      const { name, phone, address } = req.body as Record<string, unknown>;
      const updates: Record<string, unknown> = {};
      if (name !== undefined)    updates['name']    = String(name).trim();
      if (phone !== undefined)   updates['phone']   = String(phone).trim();
      if (address !== undefined) updates['address'] = address;

      const user = await User.findByIdAndUpdate(
        payload.userId,
        { $set: updates },
        { new: true, select: '-passwordHash' },
      );
      if (!user) { res.status(404).json({ error: 'User not found.' }); return; }

      res.json({
        id: user._id.toString(),
        name: user.name,
        email: user.email,
        phone: user.phone ?? null,
        address: user.address ?? null,
      });
    } catch {
      res.status(500).json({ error: 'Failed to update profile.' });
    }
  });

  // POST /auth/logout — JWT is stateless; client deletes the token
  router.post('/logout', (_req: Request, res: Response) => {
    res.json({ message: 'Logged out.' });
  });

  return router;
}
