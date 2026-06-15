import { Router, type Request, type Response } from 'express';
import { Review } from '../../infrastructure/db/ReviewModel.js';
import { verifyToken, extractToken } from './authRoutes.js';

export function createReviewRouter(): Router {
  const router = Router();

  // POST /api/reviews — submit a product review
  router.post('/', async (req: Request, res: Response) => {
    const token = extractToken(req);
    if (!token) { res.status(401).json({ error: 'Not authenticated.' }); return; }
    const payload = verifyToken(token);
    if (!payload) { res.status(401).json({ error: 'Session expired.' }); return; }

    const { productId, rating, title, body, returnRequestId, photoUrls, customerName } =
      req.body as Record<string, unknown>;

    if (!productId || !rating || !title || !body) {
      res.status(400).json({ error: 'productId, rating, title and body are required.' });
      return;
    }

    try {
      const review = await Review.create({
        productId: String(productId),
        customerId: payload.userId,
        customerName: String(customerName ?? payload.email.split('@')[0]),
        rating: Math.min(5, Math.max(1, Number(rating))),
        title: String(title).trim().slice(0, 120),
        body: String(body).trim().slice(0, 2000),
        returnRequestId: returnRequestId ? String(returnRequestId) : null,
        photoUrls: Array.isArray(photoUrls) ? photoUrls : [],
      });
      res.status(201).json({ review: formatReview(review.toObject()) });
    } catch {
      res.status(500).json({ error: 'Failed to save review.' });
    }
  });

  // GET /api/reviews?productId=xxx — fetch reviews for a product
  router.get('/', async (req: Request, res: Response) => {
    const { productId } = req.query as Record<string, string>;
    if (!productId) { res.status(400).json({ error: 'productId is required.' }); return; }

    try {
      const reviews = await Review.find({ productId })
        .sort({ createdAt: -1 })
        .limit(50)
        .lean();

      const avgRating =
        reviews.length > 0
          ? reviews.reduce((s, r) => s + r.rating, 0) / reviews.length
          : null;

      res.json({
        reviews: reviews.map(formatReview),
        total: reviews.length,
        avgRating: avgRating !== null ? Math.round(avgRating * 10) / 10 : null,
      });
    } catch {
      res.status(500).json({ error: 'Failed to fetch reviews.' });
    }
  });

  return router;
}

function formatReview(r: {
  _id: unknown;
  productId: string;
  customerId: string;
  customerName: string;
  rating: number;
  title: string;
  body: string;
  returnRequestId?: string | null;
  photoUrls: string[];
  createdAt: unknown;
}) {
  return {
    id: String(r._id),
    productId: r.productId,
    customerId: r.customerId,
    customerName: r.customerName,
    rating: r.rating,
    title: r.title,
    body: r.body,
    returnRequestId: r.returnRequestId ?? null,
    photoUrls: r.photoUrls ?? [],
    createdAt: r.createdAt,
  };
}
