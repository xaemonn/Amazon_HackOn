import { useCallback, useEffect, useState } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { apiGetOrders, type OrderData } from '../api/client';
import { useAuth } from '../context/AuthContext';
import './OrderHistoryPage.css';

const STATUS_LABELS: Record<string, string> = {
  placed: 'Order placed',
  shipped: 'Shipped',
  delivered: 'Delivered',
  cancelled: 'Cancelled',
  returned: 'Returned',
};

const STATUS_CLASS: Record<string, string> = {
  placed: 'badge--placed',
  shipped: 'badge--shipped',
  delivered: 'badge--delivered',
  cancelled: 'badge--cancelled',
  returned: 'badge--returned',
};

function formatDate(dateStr: string): string {
  return new Date(dateStr).toLocaleDateString('en-IN', {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}

function formatDelivery(dateStr: string, status: string): string {
  if (status === 'delivered') return `Delivered ${formatDate(dateStr)}`;
  if (status === 'shipped') return `Expected ${formatDate(dateStr)}`;
  return `Est. ${formatDate(dateStr)}`;
}

function isReturnEligible(item: OrderData['items'][0]): boolean {
  if (item.deliveryStatus !== 'delivered') return false;
  if (item.refundStatus.code !== 'none') return false;
  const delivered = new Date(item.deliveryDate).getTime();
  const windowDays = 30;
  return Date.now() - delivered < windowDays * 24 * 60 * 60 * 1000;
}

export function OrderHistoryPage() {
  const { isAuthenticated, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const newOrderId = (location.state as { newOrderId?: string } | null)?.newOrderId;

  const [orders, setOrders] = useState<OrderData[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const fetchOrders = useCallback(async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await apiGetOrders();
      setOrders(data.orders);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load orders.');
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isAuthenticated) {
      navigate('/login', { state: { from: '/orders' } });
      return;
    }
    fetchOrders();
  }, [isAuthenticated, navigate, fetchOrders]);

  const handleReturn = (orderItemId: string) => {
    navigate('/returns/eligibility', {
      state: {
        customerId: user?.id ?? 'customer-001',
        orderItemId,
      },
    });
  };

  if (!isAuthenticated) return null;

  return (
    <div className="orders-page">
      <h1 className="orders-title">Your Orders</h1>

      {newOrderId && (
        <div className="orders-success" role="status">
          ✓ Order placed! Your items are on their way.
        </div>
      )}

      {isLoading && (
        <div className="orders-loading" role="status">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="order-skeleton" aria-hidden="true" />
          ))}
        </div>
      )}

      {!isLoading && error && (
        <div className="orders-error" role="alert">
          <p>{error}</p>
          <button type="button" className="btn btn-retry" onClick={fetchOrders}>Retry</button>
        </div>
      )}

      {!isLoading && !error && orders.length === 0 && (
        <div className="orders-empty">
          <div aria-hidden="true">📦</div>
          <p>No orders yet.</p>
          <Link to="/catalog" className="btn btn-primary">Start shopping</Link>
        </div>
      )}

      {!isLoading && !error && orders.length > 0 && (
        <div className="orders-list">
          {orders.map((order) => {
            const orderTotal = order.items.reduce(
              (sum, item) => sum + item.unitPrice * item.quantity,
              0,
            );

            return (
              <article key={order.id} className="order-card">
                <header className="order-card__header">
                  <div className="order-card__meta">
                    <div>
                      <span className="order-card__label">Order ID</span>
                      <span className="order-card__id">{order.id}</span>
                    </div>
                    <div>
                      <span className="order-card__label">Placed</span>
                      <span>{formatDate(order.placedDate)}</span>
                    </div>
                    <div>
                      <span className="order-card__label">Total</span>
                      <span className="order-card__total">₹{orderTotal.toLocaleString('en-IN')}</span>
                    </div>
                    <div>
                      <span className="order-card__label">Payment</span>
                      <span>{order.paymentType === 'cod' ? 'Cash on Delivery' : 'Prepaid'}</span>
                    </div>
                  </div>
                  <span className={`order-badge ${STATUS_CLASS[order.status] ?? ''}`}>
                    {STATUS_LABELS[order.status] ?? order.status}
                  </span>
                </header>

                <ul className="order-items" aria-label="Items in this order">
                  {order.items.map((item) => {
                    const eligible = isReturnEligible(item);
                    const hasRefund = item.refundStatus.code !== 'none';

                    return (
                      <li key={item.id} className="order-item">
                        <div className="order-item__image" aria-hidden="true">
                          {item.productImage}
                        </div>
                        <div className="order-item__details">
                          <p className="order-item__name">{item.productName}</p>
                          <p className="order-item__meta">
                            Qty: {item.quantity} · ₹{item.unitPrice.toLocaleString('en-IN')} each
                          </p>
                          <p className="order-item__delivery">
                            {formatDelivery(item.deliveryDate, item.deliveryStatus)}
                          </p>
                          {hasRefund && (
                            <p className="order-item__refund">
                              Refund: ₹{item.refundStatus.amount?.toLocaleString('en-IN')} issued
                            </p>
                          )}
                        </div>
                        <div className="order-item__actions">
                          {eligible && (
                            <button
                              type="button"
                              className="btn-return"
                              onClick={() => handleReturn(item.id)}
                            >
                              Return item
                            </button>
                          )}
                          {!eligible && item.deliveryStatus === 'delivered' && !hasRefund && (
                            <span className="order-item__return-closed">Return window closed</span>
                          )}
                          {hasRefund && (
                            <span className="order-item__refunded">Refund issued</span>
                          )}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}
