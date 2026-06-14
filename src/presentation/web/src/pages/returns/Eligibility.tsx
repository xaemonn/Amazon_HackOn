import { useCallback, useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import './Eligibility.css';

interface EligibilityResult {
  eligible: boolean;
  daysRemaining: number | null;
  policyExpirationDate: string | null;
  productName: string;
  productImage: string;
  orderDate: string;
  errorMessage?: string | null;
}

type ScreenState = 'loading' | 'result' | 'error';

/**
 * Calls the eligibility API endpoint.
 * Falls back to a user-friendly error on network or server failures.
 */
async function fetchEligibility(
  customerId: string,
  orderItemId: string
): Promise<EligibilityResult> {
  const params = new URLSearchParams({ customerId, orderItemId });
  const response = await fetch(`/api/returns/eligibility?${params.toString()}`);

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new Error(body?.error ?? `Eligibility check failed (${response.status})`);
  }

  return response.json();
}

export function Eligibility() {
  const location = useLocation();
  const navigate = useNavigate();
  const state = location.state as {
    customerId?: string;
    orderItemId?: string;
  } | null;

  const customerId = state?.customerId ?? '';
  const orderItemId = state?.orderItemId ?? '';

  const [screenState, setScreenState] = useState<ScreenState>('loading');
  const [eligibility, setEligibility] = useState<EligibilityResult | null>(null);

  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const checkEligibility = useCallback(async () => {
    setScreenState('loading');
    setErrorMessage(null);
    try {
      const result = await fetchEligibility(customerId, orderItemId);
      // If the API returns an errorMessage (ownership issue, item not found), show as error
      if (result.errorMessage) {
        setErrorMessage(result.errorMessage);
        setScreenState('error');
        return;
      }
      setEligibility(result);
      setScreenState('result');
    } catch (err) {
      setErrorMessage(
        err instanceof Error ? err.message : 'The eligibility check is temporarily unavailable. Please try again.'
      );
      setScreenState('error');
    }
  }, [customerId, orderItemId]);

  useEffect(() => {
    if (customerId && orderItemId) {
      checkEligibility();
    } else {
      setScreenState('error');
    }
  }, [customerId, orderItemId, checkEligibility]);

  const handleProceed = () => {
    navigate('/returns/reason', {
      state: { customerId, orderItemId },
    });
  };

  const handleBack = () => {
    navigate(-1);
  };

  return (
    <section className="eligibility-container" aria-labelledby="eligibility-heading">
      <h1 id="eligibility-heading">Return Eligibility</h1>

      {screenState === 'loading' && (
        <div className="eligibility-loading" role="status" aria-live="polite">
          <div className="eligibility-spinner" aria-hidden="true" />
          <p>Checking whether your item is eligible for return…</p>
        </div>
      )}

      {screenState === 'error' && (
        <div className="eligibility-error" role="alert">
          <div className="eligibility-error-icon" aria-hidden="true">⚠️</div>
          <p>
            {errorMessage ?? 'The eligibility check is temporarily unavailable. Please try again.'}
          </p>
          <div className="eligibility-actions">
            <button
              type="button"
              className="btn btn-retry"
              onClick={checkEligibility}
            >
              Retry
            </button>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handleBack}
            >
              Go back
            </button>
          </div>
        </div>
      )}

      {screenState === 'result' && eligibility && (
        <>
          <div className="eligibility-product-card">
            <div
              className="eligibility-product-image"
              role="img"
              aria-label={eligibility.productName}
            >
              {eligibility.productImage || '📦'}
            </div>
            <div className="eligibility-product-info">
              <p className="eligibility-product-name">
                {eligibility.productName}
              </p>
              <p className="eligibility-order-date">
                Ordered: {eligibility.orderDate}
              </p>
            </div>
          </div>

          <div
            className={`eligibility-status ${
              eligibility.eligible
                ? 'eligibility-status--eligible'
                : 'eligibility-status--ineligible'
            }`}
            aria-live="polite"
          >
            {eligibility.eligible ? (
              <>
                <span className="eligibility-badge eligibility-badge--eligible">
                  ✓ Eligible for return
                </span>
                <p className="eligibility-days">
                  You have <strong>{eligibility.daysRemaining} days</strong>{' '}
                  remaining in your return window.
                </p>
              </>
            ) : (
              <>
                <span className="eligibility-badge eligibility-badge--ineligible">
                  ✗ No longer eligible
                </span>
                <p className="eligibility-days">
                  The return window for this item has closed.
                </p>
                {eligibility.policyExpirationDate && (
                  <p className="eligibility-expiry">
                    Return window expired on {eligibility.policyExpirationDate}.
                  </p>
                )}
              </>
            )}
          </div>

          <div className="eligibility-actions">
            {eligibility.eligible ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={handleProceed}
                aria-label="Proceed with return"
              >
                Proceed
              </button>
            ) : (
              <button
                type="button"
                className="btn btn-secondary"
                onClick={handleBack}
                aria-label="Go back to order details"
              >
                Back to order
              </button>
            )}
          </div>
        </>
      )}
    </section>
  );
}
