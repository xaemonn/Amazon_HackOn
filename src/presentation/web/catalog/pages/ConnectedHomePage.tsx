import { useState, useEffect } from 'react';
import { useCatalog } from '../CatalogContext';
import { HomePage } from './HomePage';
import type { CategoryTileData } from '../components/CategoryTiles';
import type { DealCardData } from '../components/DealsRail';
import type { SecondLifeCardData } from '../components/SecondLifeRail';

export function ConnectedHomePage() {
  const { getCategories, getDeals, getSecondLifeItems, ready } = useCatalog();

  const [categories, setCategories] = useState<CategoryTileData[]>([]);
  const [deals, setDeals] = useState<DealCardData[]>([]);
  const [secondLife, setSecondLife] = useState<SecondLifeCardData[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!ready) return;

    let cancelled = false;

    async function loadData() {
      setLoading(true);
      try {
        const [cats, dealItems, slItems] = await Promise.all([
          getCategories(),
          getDeals(),
          getSecondLifeItems(),
        ]);

        if (cancelled) return;

        setCategories(
          cats.map((c) => ({
            id: c.id,
            name: c.name,
            imageUrl: c.imageUrl,
          }))
        );
        setDeals(dealItems);
        setSecondLife(slItems);
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    }

    loadData();

    return () => {
      cancelled = true;
    };
  }, [ready, getCategories, getDeals, getSecondLifeItems]);

  return (
    <HomePage
      categories={categories}
      deals={deals}
      secondLife={secondLife}
      loading={loading}
    />
  );
}
