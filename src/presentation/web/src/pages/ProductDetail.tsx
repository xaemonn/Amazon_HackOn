/**
 * ProductDetail — placeholder page for product detail view.
 * Will be connected to CatalogService via ServiceContext.
 *
 * Requirements: 6.4
 */

import { useParams } from 'react-router-dom';

export function ProductDetail() {
  const { id } = useParams<{ id: string }>();

  return (
    <section aria-labelledby="product-detail-heading">
      <h1 id="product-detail-heading">Product Detail</h1>
      <p>Viewing product: <strong>{id}</strong></p>
    </section>
  );
}
