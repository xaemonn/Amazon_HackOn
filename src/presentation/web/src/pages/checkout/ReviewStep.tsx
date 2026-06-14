import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCheckout } from './CheckoutLayout';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import './ReviewStep.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────

interface CartItemView {
  variantId: string;
  productId: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  condition: string;
}

interface AddressView {
  id: string;
  recipientName: string;
  streetLine1: string;
  streetLine2?: string;
  city: string;
  state: string;
  pincode: string;
}

interface DeliveryOptionView {
  id: string;
  name: string;
  minDays: number;
  maxDays: number;
  cost: number;
}

interface StockIssue {
  variantId: string;
  productName: string;
  requestedQty: number;
  availableStock: number;
  issue: 'out_of_stock' | 'price_changed' | 'insufficient_stock';
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

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
 * ReviewStep — Fourth step of checkout. Displays a full order summary
 * (items, address, delivery option, payment method) with a price breakdown.
 * Validates stock before placing the order and blocks placement if issues
 * are detected. Place Order button is disabled during payment processing
 * to prevent double submission.
 *
 * Validates: Requirements 9.1, 9.2, 9.3, 9.4, 9.5, 10.6
 */
export function ReviewStep() {
  const { sessionToken } = useAuth();
  const { state, nextStep } = useCheckout();

  // Data states
  const [cartItems, setCartItems] = useState<CartItemView[]>([]);
  const [subtotal, setSubtotal] = useState<number>(0);
  const [address, setAddress] = useState<AddressView | null>(null);
  const [deliveryOption, setDeliveryOption] = useState<DeliveryOptionView | null>(null);
  const [paymentLabel, setPaymentLabel] = useState<string>('');

  // UI states
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);
  const [placing, setPlacing] = useState(false);
  const [placeError, setPlaceError] = useState<string | null>(null);
  const [stockIssues, setStockIssues] = useState<StockIssue[]>([]);
  const [stockAcknowledged, setStockAcknowledged] = useState(false);

  // ── Fetch all review data ─────────────────────────────────────────────────

  const fetchReviewData = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    setStockIssues([]);
    setStockAcknowledged(false);

    try {
      const headers: HeadersInit = {
        Authorization: `Bearer ${sessionToken}`,
        'Content-Type': 'application/json',
      };

      // Fetch cart, address, delivery options, payment methods in parallel
      const [cartRes, addressRes, deliveryRes, paymentRes] = await Promise.all([
        fetch(`${API_BASE_URL}/api/cart`, { headers }),
        fetch(`${API_BASE_URL}/api/checkout/addresses`, { headers }),
        fetch(`${API_BASE_URL}/api/checkout/delivery-options`, { headers }),
        fetch(`${API_BASE_URL}/api/checkout/payment-methods`, { headers }),
      ]);

      if (!cartRes.ok || !addressRes.ok || !deliveryRes.ok || !paymentRes.ok) {
        throw new Error('Failed to load order summary');
      }

      const cartData = await cartRes.json();
      const addressData = await addressRes.json();
      const deliveryData = await deliveryRes.json();
      const paymentData = await paymentRes.json();

      // Cart items and subtotal
      const items: CartItemView[] = cartData.items ?? [];
      setCartItems(items);
      setSubtotal(cartData.subtotal ?? 0);

      // Selected address
      const addresses: AddressView[] = Array.isArray(addressData) ? addressData : addressData.addresses ?? [];
      const selectedAddr = addresses.find((a) => a.id === state.selectedAddressId) ?? null;
      setAddress(selectedAddr);

      // Selected delivery option
      const options: DeliveryOptionView[] = deliveryData.options ?? deliveryData ?? [];
      const selectedDelivery = options.find((o) => o.id === state.selectedDeliveryOptionId) ?? null;
      setDeliveryOption(selectedDelivery);

      // Selected payment method label
      const methods = Array.isArray(paymentData) ? paymentData : paymentData.methods ?? [];
      if (state.selectedPaymentMethodId === 'cod') {
        setPaymentLabel('Cash on Delivery');
      } else {
        const selectedMethod = methods.find(
          (m: { id: string; label: string }) => m.id === state.selectedPaymentMethodId
        );
        setPaymentLabel(selectedMethod?.label ?? 'Unknown');
      }
    } catch {
      setFetchError('Unable to load your order summary. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken, state.selectedAddressId, state.selectedDeliveryOptionId, state.selectedPaymentMethodId]);

  useEffect(() => {
    fetchReviewData();
  }, [fetchReviewData]);

  // ── Stock validation ──────────────────────────────────────────────────────

  const validateStock = useCallback(async (): Promise<boolean> => {
    try {
      const res = await fetch(`${API_BASE_URL}/api/checkout/validate-stock`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Stock validation failed');
      }

      const data = await res.json();

      if (!data.valid && data.unavailableItems?.length > 0) {
        setStockIssues(
          data.unavailableItems.map((item: StockIssue) => ({
            variantId: item.variantId,
            productName: item.productName,
            requestedQty: item.requestedQty,
            availableStock: item.availableStock,
            issue: item.availableStock === 0 ? 'out_of_stock' : 'insufficient_stock',
          }))
        );
        return false;
      }

      return true;
    } catch {
      setPlaceError('Could not verify stock availability. Please try again.');
      return false;
    }
  }, [sessionToken]);

  // ── Place order ───────────────────────────────────────────────────────────

  const handlePlaceOrder = async () => {
    if (placing) return; // Prevent double submission (Req 10.6)

    setPlacing(true);
    setPlaceError(null);

    try {
      // Validate stock first (Req 9.5, 15.1)
      const stockValid = await validateStock();
      if (!stockValid) {
        setPlacing(false);
        return;
      }

      // Place the order
      const res = await fetch(`${API_BASE_URL}/api/checkout/place-order`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          addressId: state.selectedAddressId,
          deliveryOptionId: state.selectedDeliveryOptionId,
          paymentMethodId: state.selectedPaymentMethodId,
        }),
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => null);
        throw new Error(errorData?.message ?? 'Order placement failed');
      }

      // Success — move to confirmation step
      nextStep();
    } catch (err) {
      setPlaceError(
        err instanceof Error
          ? err.message
          : 'Something went wrong placing your order. Please try again.'
      );
    } finally {
      setPlacing(false);
    }
  };

  const handleAcknowledgeStockIssues = () => {
    setStockAcknowledged(true);
    setStockIssues([]);
  };

  // ── Computed values ─────────────────────────────────────────────────────────

  const deliveryCost = deliveryOption?.cost ?? 0;
  const total = subtotal + deliveryCost;
  const hasStockIssues = stockIssues.length > 0 && !stockAcknowledged;

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="review-step">
        <h2 className="review-step__title">Review Your Order</h2>
        <div className="review-step__skeleton" aria-label="Loading order summary">
          <SkeletonLoader height="4rem" />
          <SkeletonLoader height="4rem" />
          <SkeletonLoader height="3rem" width="70%" />
          <SkeletonLoader height="2rem" width="50%" />
          <SkeletonLoader height="5rem" />
        </div>
      </div>
    );
  }

  // ── Error state with retry ──────────────────────────────────────────────────

  if (fetchError) {
    return (
      <div className="review-step">
        <h2 className="review-step__title">Review Your Order</h2>
        <div className="review-step__error">
          <p className="review-step__error-msg" role="alert">
            {fetchError}
          </p>
          <button
            className="review-step__retry-btn"
            onClick={fetchReviewData}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Full review ─────────────────────────────────────────────────────────────

  return (
    <div className="review-step">
      <h2 className="review-step__title">Review Your Order</h2>

      {/* Items section (Req 9.1) */}
      <section className="review-step__section" aria-label="Order items">
        <h3 className="review-step__section-title">Items ({cartItems.length})</h3>
        <ul className="review-step__items-list">
          {cartItems.map((item) => (
            <li key={item.variantId} className="review-step__item">
              <img
                src={item.productImage}
                alt={item.productName}
                className="review-step__item-image"
                loading="lazy"
              />
              <div className="review-step__item-details">
                <span className="review-step__item-name">{item.productName}</span>
                <span className="review-step__item-condition">{item.condition}</span>
                <div className="review-step__item-meta">
                  <span className="review-step__item-qty">Qty: {item.quantity}</span>
                  <span className="review-step__item-price">{formatCurrency(item.unitPrice)}</span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Address section (Req 9.1) */}
      {address && (
        <section className="review-step__section" aria-label="Delivery address">
          <h3 className="review-step__section-title">Delivery Address</h3>
          <div className="review-step__address-card">
            <span className="review-step__address-name">{address.recipientName}</span>
            <span className="review-step__address-line">{address.streetLine1}</span>
            {address.streetLine2 && (
              <span className="review-step__address-line">{address.streetLine2}</span>
            )}
            <span className="review-step__address-line">
              {address.city}, {address.state} — {address.pincode}
            </span>
          </div>
        </section>
      )}

      {/* Delivery option (Req 9.1) */}
      {deliveryOption && (
        <section className="review-step__section" aria-label="Delivery option">
          <h3 className="review-step__section-title">Delivery</h3>
          <div className="review-step__delivery-card">
            <span className="review-step__delivery-name">{deliveryOption.name}</span>
            <span className="review-step__delivery-date">
              {computeDateRange(deliveryOption.minDays, deliveryOption.maxDays)}
            </span>
            <span className="review-step__delivery-cost">
              {deliveryOption.cost === 0 ? 'FREE' : formatCurrency(deliveryOption.cost)}
            </span>
          </div>
        </section>
      )}

      {/* Payment method (Req 9.1) */}
      <section className="review-step__section" aria-label="Payment method">
        <h3 className="review-step__section-title">Payment</h3>
        <div className="review-step__payment-card">
          <span className="review-step__payment-label">{paymentLabel}</span>
        </div>
      </section>

      {/* Price breakdown (Req 9.2) */}
      <section className="review-step__section review-step__totals" aria-label="Price breakdown">
        <div className="review-step__total-row">
          <span className="review-step__total-label">Subtotal</span>
          <span className="review-step__total-value">{formatCurrency(subtotal)}</span>
        </div>
        <div className="review-step__total-row">
          <span className="review-step__total-label">Delivery</span>
          <span className="review-step__total-value">
            {deliveryCost === 0 ? 'FREE' : formatCurrency(deliveryCost)}
          </span>
        </div>
        <div className="review-step__total-row review-step__total-row--grand">
          <span className="review-step__total-label">Order Total</span>
          <span className="review-step__total-value">{formatCurrency(total)}</span>
        </div>
      </section>

      {/* Stock issues warning (Req 9.5) */}
      {hasStockIssues && (
        <div className="review-step__stock-warning" role="alert" aria-live="assertive">
          <div className="review-step__stock-warning-header">
            <span className="review-step__stock-warning-icon" aria-hidden="true">⚠️</span>
            <strong>Some items have availability issues</strong>
          </div>
          <ul className="review-step__stock-list">
            {stockIssues.map((issue) => (
              <li key={issue.variantId} className="review-step__stock-item">
                <span className="review-step__stock-item-name">{issue.productName}</span>
                {issue.availableStock === 0 ? (
                  <span className="review-step__stock-item-status review-step__stock-item-status--unavailable">
                    Out of stock
                  </span>
                ) : (
                  <span className="review-step__stock-item-status">
                    Only {issue.availableStock} available (you requested {issue.requestedQty})
                  </span>
                )}
              </li>
            ))}
          </ul>
          <button
            className="review-step__acknowledge-btn"
            onClick={handleAcknowledgeStockIssues}
            type="button"
          >
            I understand, update my cart
          </button>
        </div>
      )}

      {/* Place order error */}
      {placeError && (
        <div className="review-step__place-error" role="alert">
          <p className="review-step__place-error-msg">{placeError}</p>
        </div>
      )}

      {/* Place Order button (Req 10.6 — disabled while placing) */}
      <button
        type="button"
        className="review-step__place-btn"
        onClick={handlePlaceOrder}
        disabled={placing || hasStockIssues}
        aria-disabled={placing || hasStockIssues}
        aria-busy={placing}
      >
        {placing ? 'Placing Order…' : 'Place Order'}
      </button>
    </div>
  );
}
