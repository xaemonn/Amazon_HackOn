/**
 * Express API Routes — Returns Flow
 *
 * Implements the HTTP API for the zero-touch returns flow:
 *  - POST /returns           — initiate a return (eligibility + creation)
 *  - POST /returns/:id/reason       — submit reason
 *  - POST /returns/:id/media        — submit media references
 *  - POST /returns/:id/complete-capture — trigger grading
 *  - GET  /returns/:id              — get return status, assessment, disposition
 *  - GET  /returns/:id/progress     — grading progress (mock step progression)
 *
 * All routes delegate to ReturnsFacade via DI.
 *
 * Requirements: 1.5, 8.1, 8.4, 12.3
 */

import { Router, type Request, type Response } from 'express';
import type { ReturnsFacade } from '../../application/returns/index.js';
import type { ReturnReason, MediaReference } from '../../domain/shared/types.js';

// ─── Grading Progress Mock ───────────────────────────────────────────────────

/**
 * Mock grading progress steps. In a real system these would come from
 * sub-step completion events. Here we simulate a time-based progression.
 */
const GRADING_STEPS = [
  { step: 1, label: 'Verifying item…', completed: false },
  { step: 2, label: 'Assessing condition…', completed: false },
  { step: 3, label: 'Checking for defects…', completed: false },
  { step: 4, label: 'Parsing return reason…', completed: false },
  { step: 5, label: 'Computing fraud score…', completed: false },
  { step: 6, label: 'Almost done…', completed: false },
];

/**
 * Track grading start times for progress simulation.
 * Key: returnRequestId, Value: timestamp when grading started.
 */
const gradingStartTimes = new Map<string, number>();

/**
 * Compute mock grading progress based on elapsed time.
 * Each step takes ~800ms to simulate real-time progression.
 */
function computeGradingProgress(returnRequestId: string): {
  steps: Array<{ step: number; label: string; completed: boolean }>;
  currentStep: number;
  totalSteps: number;
  complete: boolean;
} {
  const startTime = gradingStartTimes.get(returnRequestId);
  if (!startTime) {
    return {
      steps: GRADING_STEPS.map((s) => ({ ...s })),
      currentStep: 0,
      totalSteps: GRADING_STEPS.length,
      complete: false,
    };
  }

  const elapsedMs = Date.now() - startTime;
  const completedCount = Math.min(
    Math.floor(elapsedMs / 800),
    GRADING_STEPS.length,
  );

  const steps = GRADING_STEPS.map((s, i) => ({
    ...s,
    completed: i < completedCount,
  }));

  return {
    steps,
    currentStep: completedCount,
    totalSteps: GRADING_STEPS.length,
    complete: completedCount >= GRADING_STEPS.length,
  };
}

// ─── Validation Helpers ──────────────────────────────────────────────────────

const VALID_REASONS: ReturnReason[] = [
  'defective',
  'damaged_in_transit',
  'wrong_item',
  'size_fit',
  'not_as_described',
  'changed_mind',
];

const VALID_MEDIA_TYPES = ['photo_front', 'photo_back', 'photo_closeup', 'video'] as const;
const VALID_FORMATS = ['jpeg', 'png', 'mp4', 'mov'] as const;

function isValidReason(reason: unknown): reason is ReturnReason {
  return typeof reason === 'string' && VALID_REASONS.includes(reason as ReturnReason);
}

function isValidMediaReference(media: unknown): media is MediaReference {
  if (!media || typeof media !== 'object') return false;
  const m = media as Record<string, unknown>;
  return (
    typeof m.id === 'string' &&
    VALID_MEDIA_TYPES.includes(m.type as typeof VALID_MEDIA_TYPES[number]) &&
    typeof m.storageKey === 'string' &&
    VALID_FORMATS.includes(m.format as typeof VALID_FORMATS[number]) &&
    typeof m.sizeBytes === 'number' && m.sizeBytes > 0
  );
}

/** Extract the :id param from req.params safely */
function getIdParam(req: Request): string {
  return req.params['id'] as string;
}

// ─── Route Factory ───────────────────────────────────────────────────────────

/**
 * Create the returns router with all endpoints wired to the given facade.
 */
export function createReturnsRouter(returnsFacade: ReturnsFacade): Router {
  const router = Router();

  // ── DELETE /returns/dev/clear — DEV ONLY: wipe all return data ───────────
  // Lets you re-test the same order item without restarting the server.
  router.delete('/dev/clear', async (_req: Request, res: Response) => {
    try {
      const result = await returnsFacade.devClearAllReturns();
      gradingStartTimes.clear();
      res.json({ message: 'All return data cleared.', ...result });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── GET /returns/eligibility — Check return eligibility ──────────────────

  router.get('/eligibility', async (req: Request, res: Response) => {
    try {
      const customerId = req.query['customerId'] as string | undefined;
      const orderItemId = req.query['orderItemId'] as string | undefined;

      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({ error: 'customerId query parameter is required.' });
        return;
      }
      if (!orderItemId || typeof orderItemId !== 'string') {
        res.status(400).json({ error: 'orderItemId query parameter is required.' });
        return;
      }

      const result = await returnsFacade.checkEligibility(customerId, orderItemId);

      // Serialize dates for JSON response
      res.status(200).json({
        eligible: result.eligible,
        daysRemaining: result.daysRemaining,
        policyExpirationDate: result.policyExpirationDate
          ? result.policyExpirationDate.toISOString()
          : null,
        productName: result.productName,
        productImage: result.productImage,
        orderDate: result.orderDate instanceof Date
          ? result.orderDate.toISOString().split('T')[0]
          : result.orderDate,
        errorMessage: result.errorMessage ?? null,
        returnPolicy: result.returnPolicy ?? null,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── GET /returns/policy — Pre-purchase return-abuse policy ──────────────
  // Lets the product page warn that returns may be unavailable for a customer
  // with high recent return activity, before they buy.
  router.get('/policy', async (req: Request, res: Response) => {
    try {
      const customerId = req.query['customerId'] as string | undefined;
      const productValueRaw = req.query['productValue'] as string | undefined;
      if (!customerId) {
        res.status(400).json({ error: 'customerId query parameter is required.' });
        return;
      }
      const productValue = Number(productValueRaw);
      if (Number.isNaN(productValue)) {
        res.status(400).json({ error: 'productValue must be a number.' });
        return;
      }
      const decision = await returnsFacade.evaluateReturnPolicyFor(customerId, productValue);
      res.status(200).json(decision);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── POST /returns — Initiate a return ────────────────────────────────────

  router.post('/', async (req: Request, res: Response) => {
    try {
      const { customerId, orderItemId, reason, reasonDetails } = req.body;

      // Validate required fields
      if (!customerId || typeof customerId !== 'string') {
        res.status(400).json({ error: 'customerId is required and must be a string.' });
        return;
      }
      if (!orderItemId || typeof orderItemId !== 'string') {
        res.status(400).json({ error: 'orderItemId is required and must be a string.' });
        return;
      }
      if (!isValidReason(reason)) {
        res.status(400).json({
          error: `reason is required and must be one of: ${VALID_REASONS.join(', ')}.`,
        });
        return;
      }

      // Check eligibility first
      const eligibility = await returnsFacade.checkEligibility(customerId, orderItemId);
      if (!eligibility.eligible) {
        res.status(422).json({
          error: 'Item is not eligible for return.',
          eligibility,
        });
        return;
      }

      // Initiate the return
      const result = await returnsFacade.initiateReturn({
        customerId,
        orderItemId,
        reason,
        reasonDetails: reasonDetails ?? null,
      });

      res.status(201).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── POST /returns/:id/reason — Submit reason ─────────────────────────────

  router.post('/:id/reason', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);
      const { reason, reasonDetails } = req.body;

      if (!isValidReason(reason)) {
        res.status(400).json({
          error: `reason is required and must be one of: ${VALID_REASONS.join(', ')}.`,
        });
        return;
      }

      const result = await returnsFacade.submitReason({
        returnRequestId: id,
        reason,
        reasonDetails: reasonDetails ?? null,
      });

      res.status(200).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── POST /returns/:id/media — Submit media references ────────────────────

  router.post('/:id/media', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);
      const { media } = req.body;

      if (!Array.isArray(media) || media.length === 0) {
        res.status(400).json({ error: 'media must be a non-empty array of media references.' });
        return;
      }

      // Validate each media reference
      for (let i = 0; i < media.length; i++) {
        if (!isValidMediaReference(media[i])) {
          res.status(400).json({
            error: `Invalid media reference at index ${i}. Each must have id, type (photo_front|photo_back|photo_closeup|video), storageKey, format (jpeg|png|mp4|mov), and sizeBytes (positive number).`,
          });
          return;
        }
      }

      // Add capturedAt if not provided
      const mediaWithTimestamp: MediaReference[] = media.map((m: Record<string, unknown>) => ({
        id: m.id as string,
        type: m.type as MediaReference['type'],
        storageKey: m.storageKey as string,
        format: m.format as MediaReference['format'],
        sizeBytes: m.sizeBytes as number,
        capturedAt: m.capturedAt ? new Date(m.capturedAt as string) : new Date(),
      }));

      const result = await returnsFacade.submitMedia({
        returnRequestId: id,
        media: mediaWithTimestamp,
      });

      res.status(200).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── POST /returns/:id/complete-capture — Trigger grading ─────────────────

  router.post('/:id/complete-capture', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);

      // Record grading start time for progress tracking
      gradingStartTimes.set(id, Date.now());

      const result = await returnsFacade.completeMediaCapture(id);

      res.status(200).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── GET /returns/:id — Get return status ─────────────────────────────────

  router.get('/:id', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);

      const result = await returnsFacade.getReturnById(id);
      if (!result) {
        res.status(404).json({ error: `Return request '${id}' not found.` });
        return;
      }

      res.status(200).json(result);
    } catch (error) {
      handleError(res, error);
    }
  });

  // ── GET /returns/:id/progress — Grading progress ─────────────────────────

  router.get('/:id/progress', async (req: Request, res: Response) => {
    try {
      const id = getIdParam(req);

      // Verify the return request exists
      const returnRequest = await returnsFacade.getReturnById(id);
      if (!returnRequest) {
        res.status(404).json({ error: `Return request '${id}' not found.` });
        return;
      }

      // If grading is complete (state moved past Grading), return full completion
      const postGradingStates = [
        'Graded', 'DispositionAssigned', 'AwaitingPickup',
        'Listed', 'Completed', 'ManualReview',
      ];
      if (postGradingStates.includes(returnRequest.state)) {
        // Clean up tracking
        gradingStartTimes.delete(id);

        res.status(200).json({
          steps: GRADING_STEPS.map((s) => ({ ...s, completed: true })),
          currentStep: GRADING_STEPS.length,
          totalSteps: GRADING_STEPS.length,
          complete: true,
          result: {
            state: returnRequest.state,
            productId: returnRequest.productId,
            conditionAssessment: returnRequest.conditionAssessment,
            dispositionDecision: returnRequest.dispositionDecision,
          },
        });
        return;
      }

      // If not yet in Grading state, no progress yet
      if (returnRequest.state !== 'Grading') {
        res.status(200).json({
          steps: GRADING_STEPS.map((s) => ({ ...s })),
          currentStep: 0,
          totalSteps: GRADING_STEPS.length,
          complete: false,
          result: null,
        });
        return;
      }

      // Compute mock progress based on elapsed time
      const progress = computeGradingProgress(id);
      res.status(200).json({
        ...progress,
        result: null,
      });
    } catch (error) {
      handleError(res, error);
    }
  });

  return router;
}

// ─── Error Handler ───────────────────────────────────────────────────────────

function handleError(res: Response, error: unknown): void {
  if (error instanceof Error) {
    const message = error.message;

    // Ownership errors → 403
    if (message.includes('does not own') || message.includes('does not belong')) {
      res.status(403).json({ error: message });
      return;
    }

    // Not found errors → 404
    if (message.includes('not found')) {
      res.status(404).json({ error: message });
      return;
    }

    // Duplicate return → 409
    if (message.includes('already exists')) {
      res.status(409).json({ error: message });
      return;
    }

    // Validation errors → 400
    if (
      message.includes('must be') ||
      message.includes('exceeds') ||
      message.includes('Invalid') ||
      message.includes('requires') ||
      message.includes('Media validation')
    ) {
      res.status(400).json({ error: message });
      return;
    }

    // Illegal state transition → 422
    if (message.includes('transition') || message.includes('state')) {
      res.status(422).json({ error: message });
      return;
    }

    // Generic server error
    console.error('[API] Unhandled error:', error);
    res.status(500).json({ error: 'An internal error occurred. Please try again.' });
  } else {
    console.error('[API] Unknown error:', error);
    res.status(500).json({ error: 'An internal error occurred. Please try again.' });
  }
}
