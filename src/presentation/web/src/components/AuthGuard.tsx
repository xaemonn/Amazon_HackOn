import { type ReactNode } from 'react';
import { Navigate, useLocation } from 'react-router-dom';
import { useAuth } from '../hooks/useAuth';
import { SkeletonLoader } from './SkeletonLoader';

interface AuthGuardProps {
  children: ReactNode;
}

/**
 * Protects routes by requiring authentication before rendering children.
 * - While loading, renders a skeleton placeholder (no personal data exposed).
 * - If unauthenticated, redirects to /login with a returnTo query param.
 * - Otherwise, renders children.
 *
 * Validates: Requirements 14.1, 14.4
 */
export function AuthGuard({ children }: AuthGuardProps) {
  const { customer, loading } = useAuth();
  const location = useLocation();

  if (loading) {
    return (
      <div style={{ padding: '1rem' }}>
        <SkeletonLoader height="2rem" width="60%" />
        <SkeletonLoader height="1rem" width="80%" />
        <SkeletonLoader height="1rem" width="40%" />
      </div>
    );
  }

  if (!customer) {
    const returnTo = encodeURIComponent(location.pathname + location.search);
    return <Navigate to={`/login?returnTo=${returnTo}`} replace />;
  }

  return <>{children}</>;
}
