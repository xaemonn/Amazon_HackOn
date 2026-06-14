import { CSSProperties } from 'react';

interface SkeletonLoaderProps {
  /** Height of the skeleton block (CSS value, e.g. '1rem', '200px') */
  height?: string;
  /** Width of the skeleton block (CSS value, e.g. '100%', '80px') */
  width?: string;
  /** Border radius for rounded skeletons */
  borderRadius?: string;
  /** Additional class name */
  className?: string;
}

/**
 * Reusable animated pulse skeleton block.
 * Mobile-first, used as a loading placeholder while data is being fetched.
 * Validates: Requirements 14.4, 7.5, 8.6
 */
export function SkeletonLoader({
  height = '1rem',
  width = '100%',
  borderRadius = '4px',
  className = '',
}: SkeletonLoaderProps) {
  const style: CSSProperties = {
    height,
    width,
    borderRadius,
    backgroundColor: '#e2e8f0',
    animation: 'skeleton-pulse 1.5s ease-in-out infinite',
  };

  return (
    <>
      <div
        className={`skeleton-loader ${className}`}
        style={style}
        aria-hidden="true"
        role="presentation"
      />
      <style>{`
        @keyframes skeleton-pulse {
          0%, 100% {
            opacity: 1;
          }
          50% {
            opacity: 0.4;
          }
        }
      `}</style>
    </>
  );
}
