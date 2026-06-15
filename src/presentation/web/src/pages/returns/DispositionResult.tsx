import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { API_BASE } from '../../api/client';
import './ReturnPage.css';
import './DispositionResult.css';

interface RefundEstimate {
  amount: number;
  currency: string;
  condition: 'immediate' | 'upon_sale' | 'after_review';
  method: 'original_payment' | 'store_credit';
  isMinimumGuarantee: boolean;
}

interface ConditionAssessment {
  grade: 'A' | 'B' | 'C' | 'D' | null;
  confidence: number;
  identityVerdict: 'genuine' | 'mismatch' | 'inconclusive';
  fraudScore: number;
  defects: Array<{ location: string; severity: string; description: string }>;
  reasoning: string;
  requiresManualReview: boolean;
  authenticity?: {
    aiGenerated: boolean;
    confidence: number;
    note: string;
  };
}

interface DispositionDecision {
  route: string;
  refundEstimate: RefundEstimate;
  explanation: string;
  handlerName: string;
}

interface ResultState {
  returnId: string;
  conditionAssessment: ConditionAssessment;
  dispositionDecision: DispositionDecision;
}

/** The location.state can come from GradingProgress (with nested `result`) or directly */
interface LocationResultState {
  returnId?: string;
  conditionAssessment?: ConditionAssessment;
  dispositionDecision?: DispositionDecision;
  result?: {
    state?: string;
    conditionAssessment?: ConditionAssessment | null;
    dispositionDecision?: DispositionDecision | null;
  } | null;
}

type ScreenState = 'loading' | 'result' | 'error';

const ROUTE_MESSAGES: Record<string, string> = {
  instant_match: 'Shipping to a buyer near you',
  list_for_resale: 'Listed for resale — item stays with you',
  refurbishment: 'Sending to refurbishment partner',
  returnless_refund: 'Keep the item, refund on the way',
  donate_or_recycle: 'Thank you for choosing sustainability',
  manual_inspection: 'Under review by our team',
};

const PICKUP_ROUTES = ['instant_match', 'refurbishment', 'manual_inspection'];

const CURRENCY_SYMBOLS: Record<string, string> = {
  INR: '₹',
  USD: '$',
  EUR: '€',
  GBP: '£',
};

function getCurrencySymbol(currency: string): string {
  return CURRENCY_SYMBOLS[currency] ?? currency;
}

function getConditionLabel(condition: RefundEstimate['condition']): string {
  switch (condition) {
    case 'immediate':
      return 'Immediate';
    case 'upon_sale':
      return 'Upon sale';
    case 'after_review':
      return 'After review';
  }
}

/**
 * Fetches return data from API when location.state is unavailable.
 * Calls GET /api/returns/:id to retrieve the full return with assessment and disposition.
 */
async function fetchReturnResult(returnId: string): Promise<ResultState> {
  if (!returnId) {
    throw new Error('Return ID is required');
  }

  const res = await fetch(`${API_BASE}/api/returns/${returnId}`);
  if (!res.ok) {
    const errData = await res.json().catch(() => ({}));
    throw new Error(errData.error || `Failed to load return data (${res.status})`);
  }

  const data = await res.json();

  return {
    returnId: data.id ?? returnId,
    conditionAssessment: data.conditionAssessment ?? null,
    dispositionDecision: data.dispositionDecision ?? null,
  };
}

export function DispositionResult() {
  const location = useLocation();
  const navigate = useNavigate();
  const rawState = location.state as LocationResultState | null;

  // Normalize: data may arrive directly or nested under `result` (from GradingProgress)
  const locationState: ResultState | null = (() => {
    if (!rawState) return null;
    const assessment = rawState.conditionAssessment ?? rawState.result?.conditionAssessment ?? null;
    const disposition = rawState.dispositionDecision ?? rawState.result?.dispositionDecision ?? null;
    if (assessment && disposition) {
      return {
        returnId: rawState.returnId ?? '',
        conditionAssessment: assessment,
        dispositionDecision: disposition,
      };
    }
    if (rawState.returnId) {
      return { returnId: rawState.returnId } as unknown as ResultState;
    }
    return null;
  })();

  const [screenState, setScreenState] = useState<ScreenState>(
    locationState?.dispositionDecision ? 'result' : 'loading'
  );
  const [resultData, setResultData] = useState<ResultState | null>(locationState);
  const [refundDisplayed, setRefundDisplayed] = useState(!!locationState?.dispositionDecision);

  const fetchData = useCallback(async () => {
    setScreenState('loading');
    try {
      // Extract returnId from URL or a fallback
      const returnId = locationState?.returnId ?? '';
      const data = await fetchReturnResult(returnId);
      setResultData(data);
      setRefundDisplayed(true);
      setScreenState('result');
    } catch {
      setScreenState('error');
    }
  }, [locationState?.returnId]);

  useEffect(() => {
    if (locationState?.dispositionDecision) {
      setResultData(locationState);
      setRefundDisplayed(true);
      setScreenState('result');
    } else {
      fetchData();
    }
  }, [locationState, fetchData]);

  const handleRetry = () => {
    fetchData();
  };

  const handleProceedWithout = () => {
    navigate('/');
  };

  const handleSchedulePickup = () => {
    // Stub for demo — scheduling logic is outside this task's scope
    alert('Pickup scheduling will be available soon.');
  };

  const handleBackToOrders = () => {
    navigate('/');
  };

  const disposition = resultData?.dispositionDecision;
  const assessment = resultData?.conditionAssessment;
  const grade = assessment?.grade;
  const isErrorState = screenState === 'error' || (screenState === 'result' && !disposition);

  return (
    <section className="disposition-container" aria-labelledby="disposition-heading">
      <h1 id="disposition-heading">Return Decision</h1>

      {screenState === 'loading' && (
        <div className="disposition-loading" role="status" aria-live="polite">
          <div className="disposition-spinner" aria-hidden="true" />
          <p>Loading your return decision…</p>
        </div>
      )}

      {isErrorState && (
        <div className="disposition-error" role="alert">
          <div className="disposition-error-icon" aria-hidden="true">⚠️</div>
          <p>
            We couldn't load your refund estimate right now. You can retry or proceed without it.
          </p>
          <div className="disposition-actions">
            <button
              type="button"
              className="btn btn-retry"
              onClick={handleRetry}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleProceedWithout}
            >
              Proceed without estimate
            </button>
          </div>
        </div>
      )}

      {screenState === 'result' && disposition && (
        <>
          {/* Grade badge */}
          {grade && (
            <div style={{ textAlign: 'center' }}>
              <div
                className={`disposition-grade-badge disposition-grade-badge--${grade.toLowerCase()}`}
                role="img"
                aria-label={`Condition grade ${grade}`}
              >
                {grade}
              </div>
            </div>
          )}

          {/* Refund estimate — positioned above pickup controls (Requirement 12.3, 12.5) */}
          <div className="disposition-refund-card" aria-live="polite">
            <p className="disposition-refund-amount">
              {getCurrencySymbol(disposition.refundEstimate.currency)}
              {disposition.refundEstimate.amount.toLocaleString('en-IN')}
            </p>
            {disposition.refundEstimate.isMinimumGuarantee && (
              <p className="disposition-refund-qualifier">
                up to {getCurrencySymbol(disposition.refundEstimate.currency)}
                {disposition.refundEstimate.amount.toLocaleString('en-IN')} — final amount confirmed after review
              </p>
            )}
            <span
              className={`disposition-refund-condition disposition-refund-condition--${disposition.refundEstimate.condition.replace('_', '-')}`}
            >
              {getConditionLabel(disposition.refundEstimate.condition)}
            </span>
          </div>

          {/* Why this grade — AI reasoning + detected defects */}
          {assessment?.reasoning && (
            <div className="disposition-reasoning">
              <h2 className="disposition-reasoning-title">Why this grade?</h2>
              <p className="disposition-reasoning-text">{assessment.reasoning}</p>
              {assessment.defects && assessment.defects.length > 0 && (
                <ul className="disposition-defects">
                  {assessment.defects.map((d, i) => (
                    <li key={i} className={`disposition-defect disposition-defect--${d.severity}`}>
                      <span className="disposition-defect-severity">{d.severity}</span>
                      <span className="disposition-defect-text">
                        <strong>{d.location}:</strong> {d.description}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
              {typeof assessment.confidence === 'number' && (
                <p className="disposition-confidence">
                  AI confidence: {Math.round(assessment.confidence * 100)}%
                </p>
              )}
            </div>
          )}

          {/* Anti-fraud: AI-generated image warning */}
          {assessment?.authenticity?.aiGenerated && (
            <div className="disposition-ai-warning" role="alert">
              <span className="disposition-ai-warning-icon" aria-hidden="true">🤖</span>
              <div>
                <strong>Possible AI-generated images detected</strong>
                <p>
                  {assessment.authenticity.note ||
                    'The submitted photos show signs of being AI-generated or digitally manipulated.'}
                  {' '}This return has been flagged for manual review.
                </p>
              </div>
            </div>
          )}

          {/* Plain-language explanation (Requirement 13.3) */}
          <div className="disposition-explanation">
            <p>{disposition.explanation}</p>
          </div>

          {/* Route-specific message */}
          <div className="disposition-route-message">
            <p>{ROUTE_MESSAGES[disposition.route] ?? 'Processing your return'}</p>
          </div>

          {/* Pickup/action controls — below refund estimate (Requirement 12.5) */}
          <div className="disposition-actions">
            {PICKUP_ROUTES.includes(disposition.route) ? (
              <button
                type="button"
                className="btn btn-primary"
                disabled={!refundDisplayed}
                onClick={handleSchedulePickup}
                aria-label="Schedule pickup for your return"
              >
                Schedule Pickup
              </button>
            ) : (
              /* No-pickup routes show informational messaging */
              null
            )}
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBackToOrders}
              aria-label="Back to orders"
            >
              Back to Orders
            </button>
          </div>
        </>
      )}

      {/* Always show back link when not in loading state */}
      {screenState !== 'loading' && screenState !== 'error' && !disposition && (
        <button
          type="button"
          className="disposition-back-link"
          onClick={handleBackToOrders}
        >
          Back to Orders
        </button>
      )}
    </section>
  );
}
