import './Pagination.css';

export interface PaginationProps {
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
}

export function Pagination({ page, totalPages, onPageChange }: PaginationProps) {
  if (totalPages <= 1) {
    return null;
  }

  const getPageNumbers = (): (number | 'ellipsis')[] => {
    const pages: (number | 'ellipsis')[] = [];
    const maxVisible = 7;

    if (totalPages <= maxVisible) {
      for (let i = 1; i <= totalPages; i++) {
        pages.push(i);
      }
    } else {
      pages.push(1);

      if (page > 3) {
        pages.push('ellipsis');
      }

      const start = Math.max(2, page - 1);
      const end = Math.min(totalPages - 1, page + 1);

      for (let i = start; i <= end; i++) {
        pages.push(i);
      }

      if (page < totalPages - 2) {
        pages.push('ellipsis');
      }

      pages.push(totalPages);
    }

    return pages;
  };

  const pageNumbers = getPageNumbers();

  return (
    <nav className="pagination" aria-label="Search results pagination">
      <ul className="pagination__list">
        <li className="pagination__item">
          <button
            type="button"
            className="pagination__button pagination__button--prev"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            aria-label="Previous page"
          >
            ← Prev
          </button>
        </li>

        {pageNumbers.map((item, index) => (
          <li key={`${item}-${index}`} className="pagination__item">
            {item === 'ellipsis' ? (
              <span className="pagination__ellipsis" aria-hidden="true">…</span>
            ) : (
              <button
                type="button"
                className={`pagination__button pagination__button--page${item === page ? ' pagination__button--active' : ''}`}
                onClick={() => onPageChange(item)}
                aria-label={`Page ${item}`}
                aria-current={item === page ? 'page' : undefined}
              >
                {item}
              </button>
            )}
          </li>
        ))}

        <li className="pagination__item">
          <button
            type="button"
            className="pagination__button pagination__button--next"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            aria-label="Next page"
          >
            Next →
          </button>
        </li>
      </ul>
    </nav>
  );
}
