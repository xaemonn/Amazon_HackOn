import { createContext, useContext, useReducer, useEffect, useCallback, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../hooks/useAuth';
import './CheckoutLayout.css';

// ── Step definitions ──────────────────────────────────────────────────────────

const STEPS = ['Address', 'Delivery', 'Payment', 'Review', 'Confirmation'] as const;
export type CheckoutStepName = (typeof STEPS)[number];

// ── Context types ─────────────────────────────────────────────────────────────

export interface CheckoutState {
  currentStep: number;
  selectedAddressId: string | null;
  selectedDeliveryOptionId: string | null;
  selectedPaymentMethodId: string | null;
}

export type CheckoutAction =
  | { type: 'GO_TO_STEP'; step: number }
  | { type: 'NEXT_STEP' }
  | { type: 'PREV_STEP' }
  | { type: 'SET_ADDRESS'; addressId: string }
  | { type: 'SET_DELIVERY_OPTION'; deliveryOptionId: string }
  | { type: 'SET_PAYMENT_METHOD'; paymentMethodId: string }
  | { type: 'RESET' };

export interface CheckoutContextValue {
  state: CheckoutState;
  dispatch: React.Dispatch<CheckoutAction>;
  steps: readonly string[];
  goToStep: (step: number) => void;
  nextStep: () => void;
  prevStep: () => void;
  setAddress: (addressId: string) => void;
  setDeliveryOption: (deliveryOptionId: string) => void;
  setPaymentMethod: (paymentMethodId: string) => void;
}

// ── Context ───────────────────────────────────────────────────────────────────

export const CheckoutContext = createContext<CheckoutContextValue | null>(null);

export function useCheckout(): CheckoutContextValue {
  const ctx = useContext(CheckoutContext);
  if (!ctx) {
    throw new Error('useCheckout must be used within a CheckoutLayout');
  }
  return ctx;
}

// ── Reducer ───────────────────────────────────────────────────────────────────

const initialState: CheckoutState = {
  currentStep: 0,
  selectedAddressId: null,
  selectedDeliveryOptionId: null,
  selectedPaymentMethodId: null,
};

function checkoutReducer(state: CheckoutState, action: CheckoutAction): CheckoutState {
  switch (action.type) {
    case 'GO_TO_STEP':
      return { ...state, currentStep: Math.max(0, Math.min(action.step, STEPS.length - 1)) };
    case 'NEXT_STEP':
      return { ...state, currentStep: Math.min(state.currentStep + 1, STEPS.length - 1) };
    case 'PREV_STEP':
      return { ...state, currentStep: Math.max(state.currentStep - 1, 0) };
    case 'SET_ADDRESS':
      return { ...state, selectedAddressId: action.addressId };
    case 'SET_DELIVERY_OPTION':
      return { ...state, selectedDeliveryOptionId: action.deliveryOptionId };
    case 'SET_PAYMENT_METHOD':
      return { ...state, selectedPaymentMethodId: action.paymentMethodId };
    case 'RESET':
      return initialState;
    default:
      return state;
  }
}

// ── Component ─────────────────────────────────────────────────────────────────

interface CheckoutLayoutProps {
  children?: ReactNode;
  /** Current cart item count — if 0 during checkout, redirect to /cart */
  cartItemCount: number;
  /** Render function receiving current step index to render the active step component */
  renderStep?: (stepIndex: number) => ReactNode;
}

/**
 * CheckoutLayout — Multi-step wizard container for the checkout flow.
 *
 * Provides a step indicator bar, back-navigation to any completed step
 * (preserving all selections), and monitors cart state to halt checkout
 * if the cart becomes empty.
 *
 * Validates: Requirements 9.3, 14.4
 */
export function CheckoutLayout({ children, cartItemCount, renderStep }: CheckoutLayoutProps) {
  const [state, dispatch] = useReducer(checkoutReducer, initialState);
  const navigate = useNavigate();
  const { customer } = useAuth();

  // ── Cart empty guard — redirect to /cart if items removed during checkout ──
  useEffect(() => {
    if (cartItemCount === 0 && state.currentStep < STEPS.length - 1) {
      navigate('/cart', {
        state: { error: 'Your cart is now empty. Please add items before checking out.' },
      });
    }
  }, [cartItemCount, state.currentStep, navigate]);

  // ── Convenience action dispatchers ──────────────────────────────────────────

  const goToStep = useCallback((step: number) => {
    dispatch({ type: 'GO_TO_STEP', step });
  }, []);

  const nextStep = useCallback(() => {
    dispatch({ type: 'NEXT_STEP' });
  }, []);

  const prevStep = useCallback(() => {
    dispatch({ type: 'PREV_STEP' });
  }, []);

  const setAddress = useCallback((addressId: string) => {
    dispatch({ type: 'SET_ADDRESS', addressId });
  }, []);

  const setDeliveryOption = useCallback((deliveryOptionId: string) => {
    dispatch({ type: 'SET_DELIVERY_OPTION', deliveryOptionId });
  }, []);

  const setPaymentMethod = useCallback((paymentMethodId: string) => {
    dispatch({ type: 'SET_PAYMENT_METHOD', paymentMethodId });
  }, []);

  // ── Context value ───────────────────────────────────────────────────────────

  const contextValue: CheckoutContextValue = {
    state,
    dispatch,
    steps: STEPS,
    goToStep,
    nextStep,
    prevStep,
    setAddress,
    setDeliveryOption,
    setPaymentMethod,
  };

  // ── Determine step status for rendering ─────────────────────────────────────

  const getStepStatus = (index: number): 'completed' | 'active' | 'upcoming' => {
    if (index < state.currentStep) return 'completed';
    if (index === state.currentStep) return 'active';
    return 'upcoming';
  };

  const isStepClickable = (index: number): boolean => {
    // Can navigate back to any previously completed step
    return index < state.currentStep;
  };

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <CheckoutContext.Provider value={contextValue}>
      <div className="checkout-layout" role="main" aria-label="Checkout">
        {/* Step indicator bar */}
        <nav className="checkout-steps" aria-label="Checkout progress">
          <ol className="checkout-steps-list">
            {STEPS.map((stepName, index) => {
              const status = getStepStatus(index);
              const clickable = isStepClickable(index);

              return (
                <li
                  key={stepName}
                  className={`checkout-step-item checkout-step-item--${status}`}
                >
                  {clickable ? (
                    <button
                      type="button"
                      className="checkout-step-btn checkout-step-btn--clickable"
                      onClick={() => goToStep(index)}
                      aria-label={`Go back to ${stepName} step`}
                      aria-current={status === 'active' ? 'step' : undefined}
                    >
                      <span className="checkout-step-number" aria-hidden="true">
                        {status === 'completed' ? '✓' : index + 1}
                      </span>
                      <span className="checkout-step-label">{stepName}</span>
                    </button>
                  ) : (
                    <span
                      className="checkout-step-btn"
                      aria-current={status === 'active' ? 'step' : undefined}
                      aria-disabled={status === 'upcoming'}
                    >
                      <span className="checkout-step-number" aria-hidden="true">
                        {status === 'completed' ? '✓' : index + 1}
                      </span>
                      <span className="checkout-step-label">{stepName}</span>
                    </span>
                  )}

                  {/* Connector line between steps */}
                  {index < STEPS.length - 1 && (
                    <span
                      className={`checkout-step-connector ${
                        index < state.currentStep ? 'checkout-step-connector--completed' : ''
                      }`}
                      aria-hidden="true"
                    />
                  )}
                </li>
              );
            })}
          </ol>
        </nav>

        {/* Step content area */}
        <div className="checkout-content">
          {/* Back button for steps after the first (not on confirmation) */}
          {state.currentStep > 0 && state.currentStep < STEPS.length - 1 && (
            <button
              type="button"
              className="checkout-back-btn"
              onClick={prevStep}
              aria-label={`Go back to ${STEPS[state.currentStep - 1]} step`}
            >
              ← Back to {STEPS[state.currentStep - 1]}
            </button>
          )}

          {/* Render the active step component */}
          <div className="checkout-step-content" aria-live="polite">
            {renderStep ? renderStep(state.currentStep) : children}
          </div>
        </div>
      </div>
    </CheckoutContext.Provider>
  );
}
