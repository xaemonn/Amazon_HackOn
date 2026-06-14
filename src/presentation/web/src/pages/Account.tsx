/**
 * Account — hub page serving as the entry point for account sub-routes
 * (profile, addresses, payment methods, notification preferences).
 *
 * Requirements: 6.7
 */

import { Link } from 'react-router-dom';

export function Account() {
  return (
    <section aria-labelledby="account-heading">
      <h1 id="account-heading">My Account</h1>
      <nav aria-label="Account sections">
        <ul style={{ listStyle: 'none', padding: 0 }}>
          <li style={{ marginBottom: '0.75rem' }}>
            <Link to="/account/profile">Profile</Link>
          </li>
          <li style={{ marginBottom: '0.75rem' }}>
            <Link to="/account/addresses">Addresses</Link>
          </li>
          <li style={{ marginBottom: '0.75rem' }}>
            <Link to="/account/payment-methods">Payment Methods</Link>
          </li>
          <li style={{ marginBottom: '0.75rem' }}>
            <Link to="/account/notifications">Notification Preferences</Link>
          </li>
          <li style={{ marginBottom: '0.75rem' }}>
            <Link to="/orders">My Orders</Link>
          </li>
        </ul>
      </nav>
    </section>
  );
}
