import './SkeletonLoader.css';

export interface SkeletonLoaderProps {
  /** Number of skeleton items to render */
  count?: number;
  /** Visual variant of the skeleton */
  variant: 'tile' | 'card';
}

export function SkeletonLoader({ count = 4, variant }: SkeletonLoaderProps) {
  const items = Array.from({ length: count }, (_, i) => i);

  return (
    <div
      className={`skeleton-loader skeleton-loader--${variant}`}
      role="status"
      aria-label="Loading content"
      aria-busy="true"
    >
      {items.map((index) => (
        <div
          key={index}
          className={`skeleton-loader__item skeleton-loader__item--${variant}`}
          aria-hidden="true"
        >
          <div className="skeleton-loader__image" />
          <div className="skeleton-loader__text skeleton-loader__text--title" />
          <div className="skeleton-loader__text skeleton-loader__text--subtitle" />
        </div>
      ))}
      <span className="sr-only">Loading...</span>
    </div>
  );
}
