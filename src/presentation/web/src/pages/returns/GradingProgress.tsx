import { useCallback, useEffect, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './ReturnPage.css';
import './GradingProgress.css';

// ─── Types ────────────────────────────────────────────────────────────────────

interface ProgressStep {
  step: number;
  label: string;
  completed: boolean;
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
  refundEstimate: {
    amount: number;
    currency: string;
    condition: string;
    isMinimumGuarantee: boolean;
  };
  explanation: string;
}

interface ProgressResponse {
  steps: ProgressStep[];
  currentStep: number;
  totalSteps: number;
  complete: boolean;
  result: {
    state: string;
    conditionAssessment: ConditionAssessment | null;
    dispositionDecision: DispositionDecision | null;
  } | null;
}

interface LocationState {
  customerId?: string;
  orderItemId?: string;
  reason?: string;
  reasonDetails?: string;
  returnId?: string;
}

// ─── Component ────────────────────────────────────────────────────────────────

export function GradingProgress() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as LocationState | null;
  const returnId = state?.returnId;

  const [steps, setSteps] = useState<ProgressStep[]>([]);
  const [currentStep, setCurrentStep] = useState(0);
  const [totalSteps, setTotalSteps] = useState(6);
  const [isComplete, setIsComplete] = useState(false);
  const [result, setResult] = useState<ProgressResponse['result']>(null);
  const [showDelay, setShowDelay] = useState(false);
  const [isFailure, setIsFailure] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastAdvanceRef = useRef<number>(Date.now());
  const delayTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const prevStepRef = useRef<number>(0);

  // Screen-reader live region announcement
  const [announcement, setAnnouncement] = useState('');

  const stopPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
    if (delayTimerRef.current) {
      clearTimeout(delayTimerRef.current);
      delayTimerRef.current = null;
    }
  }, []);

  const pollProgress = useCallback(async () => {
    if (!returnId) return;

    try {
      const res = await fetch(`/api/returns/${returnId}/progress`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}`);
      }
      const data: ProgressResponse = await res.json();

      setSteps(data.steps);
      setCurrentStep(data.currentStep);
      setTotalSteps(data.totalSteps);

      // Track step advancement for delay detection
      if (data.currentStep > prevStepRef.current) {
        lastAdvanceRef.current = Date.now();
        prevStepRef.current = data.currentStep;
        setShowDelay(false);

        // Announce step to screen readers
        const activeStep = data.steps.find(
          (s) => s.step === data.currentStep
        );
        if (activeStep) {
          setAnnouncement(
            `Step ${data.currentStep} of ${data.totalSteps}: ${activeStep.label.replace('…', '')} complete`
          );
        }
      }

      // Check for completion
      if (data.complete && data.result) {
        stopPolling();
        setIsComplete(true);
        setResult(data.result);

        // Failure only when condition grading truly failed (grade is null)
        const assessment = data.result.conditionAssessment;
        if (!assessment || assessment.grade === null) {
          setIsFailure(true);
          setAnnouncement('Grading could not be completed. Your return has been submitted for manual review.');
        } else {
          setIsFailure(false);
          setAnnouncement(
            `Grading complete. Condition grade: ${assessment.grade}. Refund estimate available.`
          );
        }
      }
    } catch (err) {
      // Network error — don't stop polling, just note it
      console.error('[GradingProgress] Poll error:', err);
      setError('Having trouble reaching the server. Retrying…');
    }
  }, [returnId, stopPolling]);

  // Start polling on mount
  useEffect(() => {
    if (!returnId) return;

    // Initial fetch
    pollProgress();

    // Poll every 1 second
    pollingRef.current = setInterval(pollProgress, 1000);

    return () => {
      stopPolling();
    };
  }, [returnId, pollProgress, stopPolling]);

  // 10s delay detection
  useEffect(() => {
    if (isComplete) return;

    const checkDelay = setInterval(() => {
      const elapsed = Date.now() - lastAdvanceRef.current;
      if (elapsed >= 10000 && !showDelay) {
        setShowDelay(true);
      }
    }, 1000);

    return () => clearInterval(checkDelay);
  }, [isComplete, showDelay]);

  // Handle retry — just reset the delay timer and continue polling
  const handleRetry = () => {
    setShowDelay(false);
    lastAdvanceRef.current = Date.now();
    setError(null);
  };

  // Navigate to result
  const handleViewResult = () => {
    navigate('/returns/result', {
      state: {
        returnId,
        result,
        customerId: state?.customerId,
        orderItemId: state?.orderItemId,
      },
    });
  };

  // Navigate away on failure
  const handleNavigateAway = () => {
    navigate('/');
  };

  // ─── Render: No returnId ──────────────────────────────────────────────────

  if (!returnId) {
    return (
      <section className="return-page">
        <h1>AI Grading</h1>
        <p className="return-page-note">
          No return ID found. Please start the return flow from your orders.
        </p>
      </section>
    );
  }

  // ─── Render: Failure state ────────────────────────────────────────────────

  if (isComplete && isFailure) {
    return (
      <section className="grading-progress" aria-labelledby="grading-title">
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
        <div className="grading-progress__failure">
          <div className="grading-progress__failure-icon" aria-hidden="true">
            📋
          </div>
          <h2 className="grading-progress__failure-title">
            Manual Review Required
          </h2>
          <p className="grading-progress__failure-text">
            Our AI couldn't complete grading automatically. A specialist will
            review your return and you'll hear back within 2 business days.
          </p>
          <button
            className="grading-progress__btn grading-progress__btn--primary"
            onClick={handleNavigateAway}
          >
            Back to Home
          </button>
        </div>
      </section>
    );
  }

  // ─── Render: Completion state ─────────────────────────────────────────────

  if (isComplete && result) {
    const assessment = result.conditionAssessment!;
    const disposition = result.dispositionDecision;

    const gradeLabels: Record<string, string> = {
      A: 'Like New',
      B: 'Good',
      C: 'Fair',
      D: 'Poor',
    };

    return (
      <section className="grading-progress" aria-labelledby="grading-title">
        <div aria-live="polite" aria-atomic="true" className="sr-only">
          {announcement}
        </div>
        <div className="grading-progress__result">
          <h2 className="grading-progress__result-title">
            AI Grading Complete ✓
          </h2>
          <div
            className={`grading-progress__grade-badge grading-progress__grade-badge--${assessment.grade}`}
            aria-label={`Condition grade: ${assessment.grade}`}
          >
            {assessment.grade}
          </div>
          <ul className="grading-progress__result-details">
            <li>
              <strong>Condition:</strong> Grade {assessment.grade}
              {assessment.grade && ` — ${gradeLabels[assessment.grade]}`}
            </li>
            <li>
              <strong>Identity:</strong>{' '}
              {assessment.identityVerdict === 'genuine'
                ? '✓ Verified genuine'
                : assessment.identityVerdict === 'mismatch'
                  ? '✗ Item mismatch detected'
                  : '~ Under review'}
            </li>
            {disposition && (
              <li>
                <strong>Refund Estimate:</strong>{' '}
                {disposition.refundEstimate.currency === 'INR' ? '₹' : '$'}
                {disposition.refundEstimate.amount.toLocaleString('en-IN')}
                {disposition.refundEstimate.isMinimumGuarantee && ' (minimum guarantee)'}
              </li>
            )}
            {disposition && (
              <li>
                <strong>Next Step:</strong> {disposition.explanation}
              </li>
            )}
          </ul>
          {assessment.reasoning && (
            <div className="grading-progress__reasoning">
              <strong>Why this grade?</strong>
              <p>{assessment.reasoning}</p>
            </div>
          )}
          {assessment.authenticity?.aiGenerated && (
            <div className="grading-progress__ai-warning" role="alert">
              🤖 <strong>Possible AI-generated images detected.</strong>{' '}
              {assessment.authenticity.note || 'Flagged for manual review.'}
            </div>
          )}
          {assessment.requiresManualReview && (
            <div className="grading-progress__review-notice" role="note">
              Some details are being reviewed by our team — your refund estimate
              may be adjusted within 1 business day.
            </div>
          )}
          <button
            className="grading-progress__btn grading-progress__btn--primary"
            onClick={handleViewResult}
          >
            View Full Result
          </button>
        </div>
      </section>
    );
  }

  // ─── Render: Progress state ───────────────────────────────────────────────

  const progressPercent = totalSteps > 0 ? (currentStep / totalSteps) * 100 : 0;

  return (
    <section className="grading-progress" aria-labelledby="grading-title">
      {/* Screen reader announcements */}
      <div aria-live="polite" aria-atomic="true" className="sr-only">
        {announcement}
      </div>

      <header className="grading-progress__header">
        <h1 id="grading-title" className="grading-progress__title">
          AI Grading in Progress
        </h1>
        <p className="grading-progress__subtitle">
          Analyzing your item — this usually takes a few seconds
        </p>
      </header>

      {/* Progress bar */}
      <div
        className="grading-progress__bar-container"
        role="progressbar"
        aria-valuenow={currentStep}
        aria-valuemin={0}
        aria-valuemax={totalSteps}
        aria-label="Grading progress"
      >
        <div
          className="grading-progress__bar-fill"
          style={{ width: `${progressPercent}%` }}
        />
      </div>
      <p className="grading-progress__step-counter">
        Step {currentStep} of {totalSteps}
      </p>

      {/* Step list */}
      <ul className="grading-progress__steps" aria-label="Grading steps">
        {steps.map((step) => {
          const isActive = step.step === currentStep + 1 && !step.completed;
          const stepClass = step.completed
            ? 'grading-progress__step grading-progress__step--completed'
            : isActive
              ? 'grading-progress__step grading-progress__step--active'
              : 'grading-progress__step grading-progress__step--pending';

          return (
            <li key={step.step} className={stepClass}>
              <span
                className={`grading-progress__icon ${
                  step.completed
                    ? 'grading-progress__icon--completed'
                    : isActive
                      ? 'grading-progress__icon--active'
                      : 'grading-progress__icon--pending'
                }`}
                aria-hidden="true"
              >
                {step.completed ? (
                  <svg width="14" height="14" viewBox="0 0 14 14" fill="none">
                    <path
                      d="M2 7l3.5 3.5L12 4"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    />
                  </svg>
                ) : isActive ? (
                  <span className="grading-progress__spinner" />
                ) : (
                  <span style={{ fontSize: '10px' }}>{step.step}</span>
                )}
              </span>
              <span className="grading-progress__step-label">
                {step.label}
              </span>
            </li>
          );
        })}
      </ul>

      {/* Delay warning */}
      {showDelay && (
        <div
          className="grading-progress__delay-message"
          role="alert"
          aria-live="assertive"
        >
          <p className="grading-progress__delay-text">
            Taking a bit longer… you can retry or keep waiting
          </p>
          <div className="grading-progress__delay-actions">
            <button
              className="grading-progress__btn grading-progress__btn--primary"
              onClick={handleRetry}
            >
              Retry
            </button>
            <button
              className="grading-progress__btn grading-progress__btn--secondary"
              onClick={() => setShowDelay(false)}
            >
              Keep Waiting
            </button>
          </div>
        </div>
      )}

      {/* Network error (non-blocking) */}
      {error && !showDelay && (
        <p className="return-page-note" role="status">
          {error}
        </p>
      )}
    </section>
  );
}
