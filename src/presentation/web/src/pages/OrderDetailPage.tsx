import { useState, useEffect, useCallback } from 'react';
import { useParams, Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { OrderItemRow, type OrderItemData, type EligibilityResult } from '../components/OrderItemRow';
import './OrderDetailPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

interface OrderDetail {
  id: string;
  customerId: string;
  placedDate: string;
  status: string;
  paymentType: string;
  items: OrderItemData[];
}

/**
 * Returns badge CSS modifier class for the order status.
 */
function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'delivered':
      return 'order-detail-page__status-badge--delivered';
    case 'shipped':
      return 'order-detail-page__status-badge--shipped';
    case 'placed':
      return 'order-detail-page__status-badge--placed';
    case 'cancelled':
      return 'order-detail-page__status-badge--cancelled';
    default:
      return 'order-detail-page__status-badge--default';
  }
}

/**
 * Formats a date string for display (e.g. "15 Jun 2025").
 */
function formatDate(dateStr: string): string {
  try {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });
  } catch {
    return dateStr;
  }
}

/**
 * OrderDetailPage — displays full order details with per-item return eligibility.
 *
 * - Fetches order via GET /api/orders/:orderId
 * - Shows not-found message on 404 (no data leak — Req 8.5)
 * - Shows order header: full id, placed date, payment type badge, overall status
 * - Renders each item via OrderItemRow with parallel eligibility checks (Req 9.4)
 * - Skeleton loaders per item section while data loads (Req 8.6)
 *
 * Validates: Requirements 8.1, 8.2, 8.3, 8.4, 8.5, 8.6, 9.1, 9.2, 9.3, 9.4, 9.5, 9.6, 10.2, 10.5, 15.1, 15.2, 15.3, 15.4, 15.5
 */
export function OrderDetailPage() {
  const { orderId } = useParams<{ orderId: string }>();
  const { sessionToken } = useAuth();

  const [order, setOrder] = useState<OrderDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  // Per-item eligibility state
  const [eligibilityMap, setEligibilityMap] = useState<Record<string, EligibilityResult | null>>({});
  const [eligibilityLoadingMap, setEligibilityLoadingMap] = useState<Record<string, boolean>>({});

  // Fetch order details
  const fetchOrder = useCallback(async () => {
    if (!orderId || !sessionToken) return;

    setLoading(true);
    setNotFound(false);

    try {
      const res = await fetch(`${API_BASE_URL}/api/orders/${orderId}`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (res.status === 404) {
        setNotFound(true);
        setOrder(null);
        return;
      }

      if (!res.ok) {
        throw new Error('Failed to load order');
      }

      const data: OrderDetail = await res.json();
      setOrder(data);
    } catch {
      setNotFound(true);
      setOrder(null);
    } finally {
      setLoading(false);
    }
  }, [orderId, sessionToken]);

  // Fetch eligibility for all items in parallel (Req 9.4)
  const fetchEligibility = useCallback(async (items: OrderItemData[]) => {
    if (!sessionToken) return;

    // Initialize loading states for all items
    const loadingState: Record<string, boolean> = {};
    items.forEach((item) => {
      loadingState[item.id] = true;
    });
    setEligibilityLoadingMap(loadingState);

    // Fire all eligibility checks in parallel using Promise.allSettled
    const results = await Promise.allSettled(
      items.map(async (item) => {
        const res = await fetch(
          `${API_BASE_URL}/api/orders/items/${item.id}/eligibility`,
          {
            headers: {
              Authorization: `Bearer ${sessionToken}`,
            },
          }
        );

        if (!res.ok) {
          // On error → treat as ineligible (Req 9.5)
          return { itemId: item.id, eligible: false };
        }

        const data = await res.json();
        return { itemId: item.id, eligible: data.eligible === true };
      })
    );

    // Process results
    const newEligibilityMap: Record<string, EligibilityResult | null> = {};
    const newLoadingMap: Record<string, boolean> = {};

    results.forEach((result, index) => {
      const itemId = items[index].id;
      if (result.status === 'fulfilled') {
        newEligibilityMap[itemId] = { eligible: result.value.eligible };
      } else {
        // On error → no button (Req 9.5)
        newEligibilityMap[itemId] = { eligible: false };
      }
      newLoadingMap[itemId] = false;
    });

    setEligibilityMap(newEligibilityMap);
    setEligibilityLoadingMap(newLoadingMap);
  }, [sessionToken]);

  useEffect(() => {
    fetchOrder();
  }, [fetchOrder]);

  // Once order is loaded, fire eligibility checks for all items
  useEffect(() => {
    if (order && order.items.length > 0) {
      fetchEligibility(order.items);
    }
  }, [order, fetchEligibility]);

  // --- Loading skeleton (Req 8.6) ---
  if (loading) {
    return (
      <div className="order-detail-page">
        <h1 className="order-detail-page__title">Order Details</h1>

        {/* Header skeleton */}
        <div className="order-detail-page__skeleton-header">
          <SkeletonLoader height="0.85rem" width="60%" />
          <SkeletonLoader height="0.85rem" width="40%" />
          <SkeletonLoader height="1.5rem" width="30%" />
        </div>

        {/* Items skeleton */}
        <div className="order-detail-page__skeleton-items">
          {[1, 2].map((i) => (
            <div key={i} className="order-detail-page__skeleton-item">
              <div className="order-detail-page__skeleton-item-img">
                <SkeletonLoader height="72px" width="72px" borderRadius="6px" />
              </div>
              <div className="order-detail-page__skeleton-item-details">
                <SkeletonLoader height="1rem" width="80%" />
                <SkeletonLoader height="0.85rem" width="50%" />
                <SkeletonLoader height="0.75rem" width="60%" />
                <SkeletonLoader height="2.25rem" width="12rem" />
              </div>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // --- Not found / cross-customer access (Req 8.5) ---
  if (notFound || !order) {
    return (
      <div className="order-detail-page">
        <div className="order-detail-page__not-found">
          <h2>Order not found</h2>
          <p>We couldn't find this order. It may not exist or you may not have access to it.</p>
          <Link to="/orders" className="order-detail-page__back-link">
            Back to My Orders
          </Link>
        </div>
      </div>
    );
  }

  // --- Render order detail ---
  return (
    <div className="order-detail-page">
      <h1 className="order-detail-page__title">Order Details</h1>

      {/* Order header: full order id, placed date, payment type badge, overall status */}
      <div className="order-detail-page__header">
        <div className="order-detail-page__header-row">
          <span className="order-detail-page__order-id">Order #{order.id}</span>
          <span className="order-detail-page__placed-date">
            Placed: {formatDate(order.placedDate)}
          </span>
        </div>
        <div className="order-detail-page__badges">
          <span className="order-detail-page__payment-badge">
            {order.paymentType}
          </span>
          <span className={`order-detail-page__status-badge ${getStatusBadgeClass(order.status)}`}>
            {order.status}
          </span>
        </div>
      </div>

      {/* Items section */}
      <h2 className="order-detail-page__items-title">
        Items ({order.items.length})
      </h2>

      <div className="order-detail-page__items">
        {order.items.map((item) => (
          <OrderItemRow
            key={item.id}
            item={item}
            eligibility={eligibilityMap[item.id] ?? null}
            eligibilityLoading={eligibilityLoadingMap[item.id] ?? false}
          />
        ))}
      </div>
    </div>
  );
}
