import { useNavigate, useParams } from 'react-router-dom';
import './OrderDetail.css';

// Seeded demo data — dates computed dynamically to stay consistent with seed data
const _fiveDaysAgo = new Date(Date.now() - 5 * 24 * 60 * 60 * 1000);
const _tenDaysAgo = new Date(Date.now() - 10 * 24 * 60 * 60 * 1000);

const DEMO_ORDER = {
  orderId: 'order-item-001',
  customerId: 'customer-001',
  productName: 'Premium Wireless Headphones',
  orderDate: _tenDaysAgo.toISOString().split('T')[0],
  deliveryDate: _fiveDaysAgo.toISOString().split('T')[0],
  price: '₹1,299',
  status: 'Delivered',
};

export function OrderDetail() {
  const { orderId } = useParams<{ orderId: string }>();
  const navigate = useNavigate();

  const handleReturn = () => {
    navigate('/returns/eligibility', {
      state: {
        customerId: DEMO_ORDER.customerId,
        orderItemId: orderId ?? DEMO_ORDER.orderId,
      },
    });
  };

  return (
    <section className="order-detail">
      <h1>Order Details</h1>

      <article className="order-item-card">
        <div className="order-item-image" aria-hidden="true">
          🎧
        </div>
        <div className="order-item-info">
          <h2>{DEMO_ORDER.productName}</h2>
          <p className="order-item-meta">
            Ordered: {DEMO_ORDER.orderDate} &middot; {DEMO_ORDER.price}
          </p>
          <p className="order-item-meta">
            Delivered: {DEMO_ORDER.deliveryDate}
          </p>
          <span className="order-item-status">{DEMO_ORDER.status}</span>

          <div>
            <button
              type="button"
              className="btn btn-accent return-button"
              onClick={handleReturn}
              aria-label={`Return ${DEMO_ORDER.productName}`}
            >
              Return this item
            </button>
          </div>
        </div>
      </article>
    </section>
  );
}
