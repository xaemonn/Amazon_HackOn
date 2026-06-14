import { Link } from 'react-router-dom';

export interface OrderCardOrder {
  id: string;
  placedDate: string;
  status: string;
  items: Array<{
    id: string;
    productName: string;
    productImage: string;
  }>;
}

/**
 * Maps order status to badge color styling.
 * WCAG AA contrast: all badge text is white on sufficiently dark backgrounds.
 */
function getStatusBadgeClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'delivered':
      return 'order-card__badge--delivered';
    case 'shipped':
      return 'order-card__badge--shipped';
    case 'placed':
      return 'order-card__badge--placed';
    case 'cancelled':
      return 'order-card__badge--cancelled';
    default:
      return 'order-card__badge--default';
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

interface OrderCardProps {
  order: OrderCardOrder;
}

/**
 * OrderCard — displays order summary with last-8-chars ID, placed date, status badge,
 * first product image + name, and item count. Each card links to order detail.
 * Validates: Requirements 7.1, 7.2, 15.1, 15.2, 15.3
 */
export function OrderCard({ order }: OrderCardProps) {
  const shortId = order.id.slice(-8);
  const firstItem = order.items[0];
  const itemCount = order.items.length;

  return (
    <Link
      to={`/orders/${order.id}`}
      className="order-card"
      aria-label={`Order ${shortId}, ${order.status}, placed ${formatDate(order.placedDate)}`}
    >
      {/* Product thumbnail */}
      <div className="order-card__image-container">
        {firstItem?.productImage ? (
          <img
            src={firstItem.productImage}
            alt={firstItem.productName}
            className="order-card__image"
            loading="lazy"
          />
        ) : (
          <div className="order-card__image-placeholder" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 16l5-5 3 3 5-5 5 5" />
            </svg>
          </div>
        )}
      </div>

      {/* Order details */}
      <div className="order-card__details">
        <div className="order-card__header">
          <span className="order-card__id">#{shortId}</span>
          <span className={`order-card__badge ${getStatusBadgeClass(order.status)}`}>
            {order.status}
          </span>
        </div>

        <p className="order-card__product-name">
          {firstItem?.productName || 'Order'}
        </p>

        <div className="order-card__footer">
          <span className="order-card__date">{formatDate(order.placedDate)}</span>
          <span className="order-card__item-count">
            {itemCount} {itemCount === 1 ? 'item' : 'items'}
          </span>
        </div>
      </div>

      {/* Chevron icon */}
      <div className="order-card__chevron" aria-hidden="true">
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="#9ca3af" strokeWidth="2">
          <path d="M7 4l6 6-6 6" />
        </svg>
      </div>
    </Link>
  );
}
