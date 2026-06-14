import { useNavigate } from 'react-router-dom';
import { SkeletonLoader } from './SkeletonLoader';

export interface OrderItemData {
  id: string;
  productName: string;
  productImage: string;
  unitPrice: number;
  quantity: number;
  deliveryDate: string;
  deliveryStatus: string;
  refundStatus: {
    code: string;
    amount: number | null;
    currency: string | null;
    issuedAt: string | null;
  };
}

export interface EligibilityResult {
  eligible: boolean;
}

interface OrderItemRowProps {
  item: OrderItemData;
  eligibility: EligibilityResult | null;
  eligibilityLoading: boolean;
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
 * Returns CSS class for delivery status badge.
 */
function getDeliveryStatusClass(status: string): string {
  switch (status.toLowerCase()) {
    case 'delivered':
      return 'order-item-row__status-badge--delivered';
    case 'shipped':
      return 'order-item-row__status-badge--shipped';
    case 'pending':
      return 'order-item-row__status-badge--pending';
    case 'returned':
      return 'order-item-row__status-badge--returned';
    default:
      return 'order-item-row__status-badge--default';
  }
}

/**
 * OrderItemRow — displays a single order item with product image, name, quantity,
 * unit price, delivery info, refund badge, and conditional return button.
 *
 * Validates: Requirements 8.3, 9.1, 9.2, 9.3, 9.4, 9.5, 10.2, 15.2, 15.4, 15.5
 */
export function OrderItemRow({ item, eligibility, eligibilityLoading }: OrderItemRowProps) {
  const navigate = useNavigate();

  const handleReturnClick = () => {
    navigate(`/returns/eligibility?orderItemId=${item.id}`);
  };

  const showRefundBadge = item.refundStatus.code === 'refund_issued';

  return (
    <article className="order-item-row" aria-label={`Order item: ${item.productName}`}>
      {/* Product image */}
      <div className="order-item-row__image-container">
        {item.productImage ? (
          <img
            src={item.productImage}
            alt={item.productName}
            className="order-item-row__image"
            loading="lazy"
          />
        ) : (
          <div className="order-item-row__image-placeholder" aria-hidden="true">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#9ca3af" strokeWidth="1.5">
              <rect x="3" y="3" width="18" height="18" rx="2" />
              <path d="M3 16l5-5 3 3 5-5 5 5" />
            </svg>
          </div>
        )}
      </div>

      {/* Item details */}
      <div className="order-item-row__details">
        <h3 className="order-item-row__name">{item.productName}</h3>

        <div className="order-item-row__meta">
          <span className="order-item-row__price">₹{item.unitPrice.toLocaleString('en-IN')}</span>
          <span className="order-item-row__qty">Qty: {item.quantity}</span>
        </div>

        <div className="order-item-row__delivery">
          <span className="order-item-row__delivery-date">
            {item.deliveryStatus === 'delivered' ? 'Delivered' : 'Expected'}: {formatDate(item.deliveryDate)}
          </span>
          <span className={`order-item-row__status-badge ${getDeliveryStatusClass(item.deliveryStatus)}`}>
            {item.deliveryStatus}
          </span>
        </div>

        {/* Refund badge — shown only when refundStatus.code === 'refund_issued' (Req 10.2) */}
        {showRefundBadge && (
          <div className="order-item-row__refund-badge">
            Refund issued: ₹{item.refundStatus.amount?.toLocaleString('en-IN')}
          </div>
        )}

        {/* Eligibility skeleton while loading (Req 9.4) */}
        {eligibilityLoading && (
          <div className="order-item-row__eligibility-skeleton">
            <SkeletonLoader height="2.25rem" width="12rem" />
          </div>
        )}

        {/* Return button — only when eligible === true (Req 9.1); no placeholder for ineligible (Req 9.3) */}
        {!eligibilityLoading && eligibility?.eligible === true && (
          <button
            type="button"
            className="order-item-row__return-button"
            onClick={handleReturnClick}
            aria-label={`Return or replace ${item.productName}`}
          >
            Return or replace items
          </button>
        )}
      </div>
    </article>
  );
}
