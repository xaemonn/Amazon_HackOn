import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCheckout } from './CheckoutLayout';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import './PaymentStep.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface PaymentMethodView {
  id: string;
  type: 'upi' | 'card' | 'cod';
  label: string;
  isPreferred: boolean;
}

/**
 * PaymentStep — Third step of checkout. Displays saved payment methods
 * (prepaid first) plus a Cash on Delivery option. Pre-selects the preferred
 * method or COD if none is preferred. Shows a high-RTO warning when COD
 * is selected with a high-RTO pincode.
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 8.7
 */
export function PaymentStep() {
  const { sessionToken } = useAuth();
  const { state, setPaymentMethod, nextStep } = useCheckout();

  const [methods, setMethods] = useState<PaymentMethodView[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(state.selectedPaymentMethodId);
  const [highRtoWarning, setHighRtoWarning] = useState(false);
  const [validationError, setValidationError] = useState<string | null>(null);

  const fetchPaymentMethods = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/checkout/payment-methods`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load payment methods');
      }

      const data: PaymentMethodView[] = await res.json();

      // Sort: prepaid methods (UPI, Card) first, then COD (Req 8.1)
      const sorted = [...data].sort((a, b) => {
        if (a.type === 'cod' && b.type !== 'cod') return 1;
        if (a.type !== 'cod' && b.type === 'cod') return -1;
        return 0;
      });

      setMethods(sorted);

      // Pre-select: preferred method if exists, otherwise COD (Req 8.2, 8.3)
      if (!state.selectedPaymentMethodId) {
        const preferred = sorted.find((m) => m.isPreferred);
        const preSelectedId = preferred ? preferred.id : 'cod';
        setSelectedId(preSelectedId);
        setPaymentMethod(preSelectedId);
      }
    } catch {
      setFetchError('Unable to load payment methods. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, state.selectedPaymentMethodId, setPaymentMethod]);

  useEffect(() => {
    fetchPaymentMethods();
  }, [fetchPaymentMethods]);

  // High-RTO pincode check when COD is selected (Req 8.6)
  useEffect(() => {
    if (!selectedId) {
      setHighRtoWarning(false);
      return;
    }

    // Determine if current selection is COD
    const isCod = selectedId === 'cod' || methods.find((m) => m.id === selectedId)?.type === 'cod';

    if (!isCod || !state.selectedAddressId) {
      setHighRtoWarning(false);
      return;
    }

    // Check high-RTO status — show warning within 1 second
    let cancelled = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(
          `${API_BASE_URL}/api/checkout/is-high-rto?addressId=${encodeURIComponent(state.selectedAddressId!)}`,
          {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          }
        );

        if (!res.ok) {
          return;
        }

        const data = await res.json();
        if (!cancelled) {
          setHighRtoWarning(data.isHighRto === true);
        }
      } catch {
        // Silently fail — warning is non-blocking
      }
    }, 0);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [selectedId, methods, state.selectedAddressId, sessionToken]);

  const handleSelectMethod = (methodId: string) => {
    setSelectedId(methodId);
    setPaymentMethod(methodId);
    setValidationError(null);
  };

  const handleContinue = () => {
    // Prevent advance without payment method selected (Req 8.7)
    if (!selectedId) {
      setValidationError('Please select a payment method to continue.');
      return;
    }
    nextStep();
  };

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="payment-step">
        <h2 className="payment-step__title">Select Payment Method</h2>
        <div className="payment-step__skeleton" aria-label="Loading payment methods">
          {[1, 2, 3].map((i) => (
            <div key={i} className="payment-step__skeleton-card">
              <SkeletonLoader height="1rem" width="50%" />
              <SkeletonLoader height="0.85rem" width="70%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Error state with retry ---
  if (fetchError) {
    return (
      <div className="payment-step">
        <h2 className="payment-step__title">Select Payment Method</h2>
        <div className="payment-step__error">
          <p className="payment-step__error-msg" role="alert">
            {fetchError}
          </p>
          <button
            className="payment-step__retry-btn"
            onClick={fetchPaymentMethods}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // --- Payment method list ---
  return (
    <div className="payment-step">
      <h2 className="payment-step__title">Select Payment Method</h2>

      <div className="payment-step__list" role="radiogroup" aria-label="Payment methods">
        {methods.map((method) => (
          <button
            key={method.id}
            type="button"
            className={`payment-step__card ${
              selectedId === method.id ? 'payment-step__card--selected' : ''
            }`}
            onClick={() => handleSelectMethod(method.id)}
            aria-pressed={selectedId === method.id}
            aria-label={`${method.label}${method.isPreferred ? ' (Preferred)' : ''}`}
          >
            <div className="payment-step__card-radio">
              <span
                className={`payment-step__radio-dot ${
                  selectedId === method.id ? 'payment-step__radio-dot--active' : ''
                }`}
              />
            </div>
            <div className="payment-step__card-details">
              <div className="payment-step__card-header">
                <span className="payment-step__card-label">{method.label}</span>
                {method.isPreferred && (
                  <span className="payment-step__card-badge">Preferred</span>
                )}
              </div>
              <span className="payment-step__card-type">
                {method.type === 'upi' && 'UPI'}
                {method.type === 'card' && 'Credit/Debit Card'}
                {method.type === 'cod' && 'Pay when delivered'}
              </span>
            </div>
          </button>
        ))}
      </div>

      {/* High-RTO warning (Req 8.6) */}
      {highRtoWarning && (
        <div className="payment-step__warning" role="alert" aria-live="polite">
          <span className="payment-step__warning-icon" aria-hidden="true">⚠️</span>
          <p className="payment-step__warning-text">
            Cash on Delivery orders to this pincode have a high return-to-origin rate.
            Consider using a prepaid payment method for faster delivery.
          </p>
        </div>
      )}

      {/* Validation error (Req 8.7) */}
      {validationError && (
        <p className="payment-step__validation-error" role="alert">
          {validationError}
        </p>
      )}

      <button
        type="button"
        className="payment-step__continue-btn"
        onClick={handleContinue}
        disabled={!selectedId}
        aria-disabled={!selectedId}
      >
        Continue
      </button>
    </div>
  );
}
