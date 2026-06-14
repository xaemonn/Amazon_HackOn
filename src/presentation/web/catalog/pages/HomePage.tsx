import { CategoryTiles } from '../components/CategoryTiles';
import { DealsRail } from '../components/DealsRail';
import { SecondLifeRail } from '../components/SecondLifeRail';
import { SkeletonLoader } from '../components/SkeletonLoader';
import './HomePage.css';

import type { CategoryTileData } from '../components/CategoryTiles';
import type { DealCardData } from '../components/DealsRail';
import type { SecondLifeCardData } from '../components/SecondLifeRail';

export interface HomePageProps {
  categories: CategoryTileData[];
  deals: DealCardData[];
  secondLife: SecondLifeCardData[];
  loading?: boolean;
}

export function HomePage({ categories, deals, secondLife, loading = false }: HomePageProps) {
  return (
    <main className="home-page" aria-label="Home page">
      {/* Category tiles section */}
      <div className="home-page__hero">
        {loading ? (
          <SkeletonLoader variant="tile" count={6} />
        ) : (
          <CategoryTiles categories={categories} />
        )}
      </div>

      {/* Deals rail section — hidden when empty */}
      <div className="home-page__section">
        {loading ? (
          <SkeletonLoader variant="card" count={4} />
        ) : (
          <DealsRail deals={deals} />
        )}
      </div>

      {/* Second Life rail section — hidden when empty */}
      <div className="home-page__section">
        {loading ? (
          <SkeletonLoader variant="card" count={4} />
        ) : (
          <SecondLifeRail items={secondLife} />
        )}
      </div>
    </main>
  );
}
