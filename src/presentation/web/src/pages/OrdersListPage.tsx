import { useState, useEffect, useCallback } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SkeletonLoader } from '../components/SkeletonLoader';
import { OrderCard, type OrderCardOrder } from '../components/OrderCard';
import './OrdersListPage.css';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || 'http://localhost:3001';

/**
 * OrdersListPage — displays all orders for the authenticated customer,
 * sorted newest-first. Shows skeleton loaders while fetching, error state
 * with retry, and empty state with link to home.
 *
 * Validates: Requirements 7.1, 7.2, 7.3, 7.4, 7.5, 15.1, 15.2, 15.3
 */
export function OrdersListPage() {
  const { sessionToken } = useAuth();

  const [orders, setOrders] = useState<OrderCardOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [fetchError, setFetchError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setLoading(true);
    setFetchError(null);

    try {
      const res = await fetch(`${API_BASE_URL}/api/orders`, {
        headers: {
          Authorization: `Bearer ${sessionToken}`,
        },
      });

      if (!res.ok) {
        throw new Error('Failed to load orders');
      }

      const data: OrderCardOrder[] = await res.json();

      // Sort newest-first by placedDate (Req 7.1)
      const sorted = [...data].sort(
        (a, b) => new Date(b.placedDate).getTime() - new Date(a.placedDate).getTime()
      );

      setOrders(sorted);
    } catch {
      setFetchError('Unable to load your orders. Please try again.');
    } finally {
      setLoading(false);
    }
  }, [sessionToken]);

  useEffect(() => {
    fetchOrders();
  }, [fetchOrders]);

  // --- Render loading skeleton (Req 7.5 — no full-screen block) ---
  if (loading) {
    return (
      <div className="orders-list-page">
        <div className="orders-list-container">
          <h1 className="orders-list-title">My Orders</h1>
          <div className="orders-list-skeleton" aria-label="Loading orders">
            {[1, 2, 3].map((i) => (
              <div key={i} className="orders-list-skeleton-card">
                <div className="orders-list-skeleton-image">
                  <SkeletonLoader height="64px" width="64px" borderRadius="6px" />
                </div>
                <div className="orders-list-skeleton-details">
                  <SkeletonLoader height="0.75rem" width="40%" />
                  <SkeletonLoader height="1rem" width="70%" />
                  <SkeletonLoader height="0.75rem" width="50%" />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    );
  }

  // --- Render error state with retry ---
  if (fetchError) {
    return (
      <div className="orders-list-page">
        <div className="orders-list-container">
          <h1 className="orders-list-title">My Orders</h1>
          <div className="orders-list-error">
            <p className="orders-list-error-msg" role="alert">
              {fetchError}
            </p>
            <button
              className="orders-list-retry-btn"
              onClick={fetchOrders}
              type="button"
            >
              Retry
            </button>
          </div>
        </div>
      </div>
    );
  }

  // --- Render empty state (Req 7.4) ---
  if (orders.length === 0) {
    return (
      <div className="orders-list-page">
        <div className="orders-list-container">
          <h1 className="orders-list-title">My Orders</h1>
          <div className="orders-list-empty">
            <div className="orders-list-empty-icon" aria-hidden="true">
              <svg width="48" height="48" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5">
                <path d="M20 7l-8-4-8 4m16 0l-8 4m8-4v10l-8 4m0-10L4 7m8 4v10M4 7v10l8 4" />
              </svg>
            </div>
            <p className="orders-list-empty-msg">You have no orders yet</p>
            <p className="orders-list-empty-sub">
              Browse our catalog and place your first order.
            </p>
            <Link to="/" className="orders-list-empty-link">
              Browse Products
            </Link>
          </div>
        </div>
      </div>
    );
  }

  // --- Render order cards ---
  return (
    <div className="orders-list-page">
      <div className="orders-list-container">
        <h1 className="orders-list-title">My Orders</h1>
        <div className="orders-list-cards">
          {orders.map((order) => (
            <OrderCard key={order.id} order={order} />
          ))}
        </div>
      </div>
    </div>
  );
}
