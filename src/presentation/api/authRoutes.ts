import { Router, type Request, type Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { User } from '../../infrastructure/auth/MongoUser.js';

const JWT_SECRET = process.env['JWT_SECRET'] ?? 'dev-secret-please-change';

export interface JwtPayload {
  userId: string;
  email: string;
}

export function signToken(userId: string, email: string): string {
  return jwt.sign({ userId, email } as JwtPayload, JWT_SECRET, { expiresIn: '30d' });
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

    try {
      const user = await User.findOne({ email: email.trim().toLowerCase() });
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

  // GET /auth/me
  router.get('/me', async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: 'Not authenticated.' }); return; }

    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Session expired. Please log in again.' }); return; }

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
