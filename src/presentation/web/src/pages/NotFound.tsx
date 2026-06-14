/**
 * NotFound — rendered for any unmatched route within MainLayout.
 * Provides a clear message and a link back to home.
 *
 * Requirements: 6.14
 */

import { Link } from 'react-router-dom';

export function NotFound() {
  return (
    <section className="not-found-page" aria-labelledby="not-found-heading">
      <h1 id="not-found-heading">Page Not Found</h1>
      <p>
        Sorry, we couldn&apos;t find the page you&apos;re looking for.
        It may have been moved or no longer exists.
      </p>
      <Link to="/" className="btn btn-primary">
        Go to Home
      </Link>
    </section>
  );
}
