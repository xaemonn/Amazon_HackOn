import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '../../hooks/useAuth';
import { useCheckout } from './CheckoutLayout';
import { SkeletonLoader } from '../../components/SkeletonLoader';
import './ConfirmationStep.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

// ── Types ─────────────────────────────────────────────────────────────────────

interface OrderItemSummary {
  productName: string;
  productImage: string;
  quantity: number;
  unitPrice: number;
}

interface OrderConfirmation {
  orderId: string;
  estimatedDelivery: { min: string; max: string };
  items: OrderItemSummary[];
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function formatCurrency(amount: number): string {
  return `₹${amount.toLocaleString('en-IN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatDate(dateStr: string): string {
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-IN', { weekday: 'short', month: 'short', day: 'numeric' });
}

/**
 * ConfirmationStep — Final step of checkout. Displays order confirmation
 * with order ID, estimated delivery date range, and a summary of purchased
 * items. Shows error with retry on order failure, preserving cart contents.
 *
 * Validates: Requirements 13.1, 13.3
 */
export function ConfirmationStep() {
  const { sessionToken } = useAuth();
  // Validate that we're within a CheckoutLayout context
  useCheckout();

  const [confirmation, setConfirmation] = useState<OrderConfirmation | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // ── Fetch order confirmation ──────────────────────────────────────────────

  const fetchConfirmation = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      // Try sessionStorage first (set by ReviewStep on successful place-order)
      const cached = sessionStorage.getItem('lastOrderConfirmation');
      if (cached) {
        const parsed: OrderConfirmation = JSON.parse(cached);
        setConfirmation(parsed);
        setLoading(false);
        return;
      }

      // Fallback: fetch the latest order from API
      const res = await fetch(`${API_BASE_URL}/api/orders/latest`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
          'Content-Type': 'application/json',
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load order confirmation');
      }

      const data = await res.json();

      const orderData: OrderConfirmation = {
        orderId: data.orderId ?? data.id,
        estimatedDelivery: data.estimatedDelivery ?? {
          min: data.estimatedDeliveryMin ?? '',
          max: data.estimatedDeliveryMax ?? '',
        },
        items: data.items ?? [],
      };

      setConfirmation(orderData);
    } catch {
      setError('Unable to load your order confirmation. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchConfirmation();
  }, [fetchConfirmation]);

  // ── Loading skeleton ────────────────────────────────────────────────────────

  if (loading) {
    return (
      <div className="confirmation-step">
        <div className="confirmation-step__skeleton" aria-label="Loading order confirmation">
          <SkeletonLoader height="3rem" width="3rem" borderRadius="50%" />
          <SkeletonLoader height="1.5rem" width="60%" />
          <SkeletonLoader height="1rem" width="40%" />
          <SkeletonLoader height="4rem" />
          <SkeletonLoader height="4rem" />
        </div>
      </div>
    );
  }

  // ── Error state with retry ──────────────────────────────────────────────────

  if (error) {
    return (
      <div className="confirmation-step">
        <div className="confirmation-step__error" role="alert">
          <span className="confirmation-step__error-icon" aria-hidden="true">⚠️</span>
          <p className="confirmation-step__error-msg">{error}</p>
          <p className="confirmation-step__error-hint">
            Your cart items have been preserved. You can retry or return to review your order.
          </p>
          <button
            className="confirmation-step__retry-btn"
            onClick={fetchConfirmation}
            type="button"
          >
            Retry
          </button>
        </div>
      </div>
    );
  }

  // ── Confirmation content ────────────────────────────────────────────────────

  if (!confirmation) {
    return null;
  }

  const { orderId, estimatedDelivery, items } = confirmation;
  const deliveryRange = estimatedDelivery.min && estimatedDelivery.max
    ? `${formatDate(estimatedDelivery.min)} – ${formatDate(estimatedDelivery.max)}`
    : 'Estimated delivery details will be sent via email';

  return (
    <div className="confirmation-step">
      {/* Success header */}
      <div className="confirmation-step__header" aria-label="Order placed successfully">
        <span className="confirmation-step__checkmark" aria-hidden="true">✓</span>
        <h2 className="confirmation-step__title">Order Placed Successfully!</h2>
        <p className="confirmation-step__subtitle">
          Thank you for your purchase.
        </p>
      </div>

      {/* Order details */}
      <section className="confirmation-step__details" aria-label="Order details">
        <div className="confirmation-step__detail-row">
          <span className="confirmation-step__detail-label">Order ID</span>
          <span className="confirmation-step__detail-value confirmation-step__order-id">
            {orderId}
          </span>
        </div>
        <div className="confirmation-step__detail-row">
          <span className="confirmation-step__detail-label">Estimated Delivery</span>
          <span className="confirmation-step__detail-value">
            {deliveryRange}
          </span>
        </div>
      </section>

      {/* Purchased items summary */}
      <section className="confirmation-step__items" aria-label="Purchased items">
        <h3 className="confirmation-step__items-title">
          Items Ordered ({items.length})
        </h3>
        <ul className="confirmation-step__items-list">
          {items.map((item, index) => (
            <li key={`${item.productName}-${index}`} className="confirmation-step__item">
              <img
                src={item.productImage}
                alt={item.productName}
                className="confirmation-step__item-image"
                loading="lazy"
              />
              <div className="confirmation-step__item-details">
                <span className="confirmation-step__item-name">{item.productName}</span>
                <div className="confirmation-step__item-meta">
                  <span className="confirmation-step__item-qty">Qty: {item.quantity}</span>
                  <span className="confirmation-step__item-price">
                    {formatCurrency(item.unitPrice)}
                  </span>
                </div>
              </div>
            </li>
          ))}
        </ul>
      </section>

      {/* Continue Shopping link */}
      <a
        href="/"
        className="confirmation-step__continue-link"
        aria-label="Continue shopping, return to home page"
      >
        Continue Shopping
      </a>
    </div>
  );
}
