import { Link } from 'react-router-dom';
import './CategoryTiles.css';

export interface CategoryTileData {
  id: string;
  name: string;
  imageUrl: string;
}

export interface CategoryTilesProps {
  categories: CategoryTileData[];
}

export function CategoryTiles({ categories }: CategoryTilesProps) {
  if (categories.length === 0) {
    return null;
  }

  const visibleCategories = categories.slice(0, 12);

  return (
    <section className="category-tiles" aria-labelledby="category-tiles-heading">
      <h2 id="category-tiles-heading" className="category-tiles__title">
        Shop by Category
      </h2>
      <ul className="category-tiles__grid" role="list">
        {visibleCategories.map((category) => (
          <li key={category.id} className="category-tiles__item">
            <Link
              to={`/category/${category.id}`}
              className="category-tiles__link"
              aria-label={`Browse ${category.name}`}
            >
              <img
                src={category.imageUrl}
                alt={category.name}
                className="category-tiles__image"
                loading="lazy"
              />
              <span className="category-tiles__name">{category.name}</span>
            </Link>
          </li>
        ))}
      </ul>
    </section>
  );
}
