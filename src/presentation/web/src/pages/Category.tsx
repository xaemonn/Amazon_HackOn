/**
 * Category — placeholder page for category browsing.
 * Will be connected to CatalogService via ServiceContext.
 *
 * Requirements: 6.6
 */

import { useParams } from 'react-router-dom';

export function Category() {
  const { id } = useParams<{ id: string }>();

  return (
    <section aria-labelledby="category-heading">
      <h1 id="category-heading">Category</h1>
      <p>Browsing products in category: <strong>{id}</strong></p>
    </section>
  );
}
