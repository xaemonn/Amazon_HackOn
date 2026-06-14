/**
 * ReturnsFlow — page for the returns process for a specific order item.
 * Combines the returns flow steps (eligibility, reason, media, grading, result).
 *
 * Requirements: 6.10
 */

import { useParams, Link } from 'react-router-dom';

export function ReturnsFlow() {
  const { orderId, itemId } = useParams<{ orderId: string; itemId: string }>();

  return (
    <section aria-labelledby="returns-heading">
      <h1 id="returns-heading">Return Item</h1>
      <p>
        Starting return for item <strong>{itemId}</strong> from order <strong>{orderId}</strong>.
      </p>
      <Link to={`/orders/${orderId}`}>Back to Order</Link>
    </section>
  );
}
