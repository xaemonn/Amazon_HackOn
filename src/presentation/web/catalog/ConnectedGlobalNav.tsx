import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { GlobalNav } from './components/GlobalNav';
import { useCatalog } from './CatalogContext';
import type { CategoryLink } from './components/GlobalNav';

export function ConnectedGlobalNav() {
  const { getCategories, ready } = useCatalog();
  const navigate = useNavigate();

  const [categories, setCategories] = useState<CategoryLink[]>([]);

  useEffect(() => {
    if (!ready) return;
    let cancelled = false;

    async function loadCategories() {
      const cats = await getCategories();
      if (!cancelled) {
        setCategories(cats.map((c) => ({ id: c.id, name: c.name })));
      }
    }

    loadCategories();
    return () => { cancelled = true; };
  }, [ready, getCategories]);

  // Wire up the search input to navigate to /search?q=...
  useEffect(() => {
    const input = document.getElementById('global-search-input') as HTMLInputElement | null;
    const btn = document.querySelector('.global-nav__search-btn') as HTMLButtonElement | null;

    function handleSearch() {
      if (input && input.value.trim()) {
        navigate(`/search?q=${encodeURIComponent(input.value.trim())}`);
      }
    }

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === 'Enter') {
        handleSearch();
      }
    }

    input?.addEventListener('keydown', handleKeyDown as EventListener);
    btn?.addEventListener('click', handleSearch);

    return () => {
      input?.removeEventListener('keydown', handleKeyDown as EventListener);
      btn?.removeEventListener('click', handleSearch);
    };
  }, [navigate]);

  return <GlobalNav cartCount={0} categories={categories} />;
}
