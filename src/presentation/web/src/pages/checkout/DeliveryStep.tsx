import { useState, useEffect, useCallback } from 'react';
import { useCheckout } from './CheckoutLayout';
import { useAuth } from '../../hooks/useAuth';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import './DeliveryStep.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface DeliveryOption {
  id: string;
  name: string;
  minDays: number;
  maxDays: number;
  cost: number;
}

/**
 * Computes a date range string from today + minDays to today + maxDays.
 */
function computeDateRange(minDays: number, maxDays: number): string {
  const today = new Date();
  const minDate = new Date(today);
  minDate.setDate(today.getDate() + minDays);
  const maxDate = new Date(today);
  maxDate.setDate(today.getDate() + maxDays);

  const formatDate = (d: Date): string =>
    d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });

  return `${formatDate(minDate)} – ${formatDate(maxDate)}`;
}

/**
 * Formats a cost as ₹ currency string.
 */
function formatCost(cost: number): string {
  if (cost === 0) return 'FREE';
  return `₹${cost}`;
}

/**
 * DeliveryStep — Select a delivery option during checkout.
 *
 * Fetches available delivery options from the API, displays them as radio buttons
 * with estimated delivery date ranges and costs, and pre-selects Standard by default.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5
 */
export function DeliveryStep() {
  const { state, setDeliveryOption, nextStep } = useCheckout();
  const { sessionToken } = useAuth();

  const [options, setOptions] = useState<DeliveryOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(
    state.selectedDeliveryOptionId
  );
  const [cartSubtotal, setCartSubtotal] = useState<number>(0);

  const fetchDeliveryOptions = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/checkout/delivery-options`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load delivery options');
      }

      const data = await res.json();
      const deliveryOptions: DeliveryOption[] = data.options ?? data;
      setOptions(deliveryOptions);

      if (data.cartSubtotal !== undefined) {
        setCartSubtotal(data.cartSubtotal);
      }

      // Pre-select standard if no option was previously selected
      if (!state.selectedDeliveryOptionId) {
        const standard = deliveryOptions.find((opt) => opt.id === 'standard');
        if (standard) {
          setSelectedId(standard.id);
          setDeliveryOption(standard.id);
        } else if (deliveryOptions.length > 0) {
          setSelectedId(deliveryOptions[0].id);
          setDeliveryOption(deliveryOptions[0].id);
        }
      }
    } catch {
      setError('Unable to load delivery options. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, state.selectedDeliveryOptionId, setDeliveryOption]);

  useEffect(() => {
    fetchDeliveryOptions();
  }, [fetchDeliveryOptions]);

  const handleOptionChange = (optionId: string) => {
    setSelectedId(optionId);
    setDeliveryOption(optionId);
  };

  const handleContinue = () => {
    if (selectedId) {
      nextStep();
    }
  };

  const selectedOption = options.find((opt) => opt.id === selectedId);
  const deliveryCost = selectedOption?.cost ?? 0;
  const displayedTotal = cartSubtotal + deliveryCost;

  // --- Loading skeleton ---
  if (loading) {
    return (
      <div className="delivery-step">
        <h2 className="delivery-step__title">Choose Delivery Option</h2>
        <div className="delivery-step__skeleton" aria-label="Loading delivery options">
          {[1, 2].map((i) => (
            <div key={i} className="delivery-step__skeleton-item">
              <SkeletonLoader height="1.25rem" width="40%" />
              <SkeletonLoader height="0.85rem" width="70%" />
              <SkeletonLoader height="0.85rem" width="30%" />
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Error state ---
  if (error) {
    return (
      <div className="delivery-step">
        <h2 className="delivery-step__title">Choose Delivery Option</h2>
        <div className="delivery-step__error">
          <p className="delivery-step__error-msg" role="alert">
            {error}
          </p>
          <button
            className="delivery-step__retry-btn"
            onClick={fetchDeliveryOptions}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // --- Delivery options ---
  return (
    <div className="delivery-step">
      <h2 className="delivery-step__title">Choose Delivery Option</h2>

      <fieldset className="delivery-step__options" aria-label="Delivery options">
        <legend className="delivery-step__legend">Select a delivery speed</legend>

        {options.map((option) => {
          const isSelected = selectedId === option.id;
          const dateRange = computeDateRange(option.minDays, option.maxDays);

          return (
            <label
              key={option.id}
              className={`delivery-step__option ${
                isSelected ? 'delivery-step__option--selected' : ''
              }`}
              htmlFor={`delivery-option-${option.id}`}
            >
              <input
                type="radio"
                id={`delivery-option-${option.id}`}
                name="delivery-option"
                value={option.id}
                checked={isSelected}
                onChange={() => handleOptionChange(option.id)}
                className="delivery-step__radio"
                aria-describedby={`delivery-desc-${option.id}`}
              />
              <div className="delivery-step__option-content">
                <div className="delivery-step__option-header">
                  <span className="delivery-step__option-name">{option.name}</span>
                  <span
                    className={`delivery-step__option-cost ${
                      option.cost === 0 ? 'delivery-step__option-cost--free' : ''
                    }`}
                  >
                    {formatCost(option.cost)}
                  </span>
                </div>
                <span
                  className="delivery-step__option-date"
                  id={`delivery-desc-${option.id}`}
                >
                  Estimated delivery: {dateRange}
                </span>
              </div>
            </label>
          );
        })}
      </fieldset>

      {/* Order total display */}
      {cartSubtotal > 0 && (
        <div className="delivery-step__total" aria-live="polite">
          <div className="delivery-step__total-row">
            <span className="delivery-step__total-label">Subtotal</span>
            <span className="delivery-step__total-value">
              ₹{cartSubtotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
          <div className="delivery-step__total-row">
            <span className="delivery-step__total-label">Delivery</span>
            <span className="delivery-step__total-value">
              {deliveryCost === 0 ? 'FREE' : `₹${deliveryCost}`}
            </span>
          </div>
          <div className="delivery-step__total-row delivery-step__total-row--grand">
            <span className="delivery-step__total-label">Order Total</span>
            <span className="delivery-step__total-value">
              ₹{displayedTotal.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
          </div>
        </div>
      )}

      {/* Continue button */}
      <button
        className="delivery-step__continue-btn"
        onClick={handleContinue}
        disabled={!selectedId}
        type="button"
        aria-label={selectedId ? 'Continue to payment' : 'Select a delivery option to continue'}
      >
        Continue
      </button>
    </div>
  );
}
