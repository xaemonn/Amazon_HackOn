import { useState, useRef, useEffect, useCallback, type KeyboardEvent, type ChangeEvent } from 'react';
import { useNavigate } from 'react-router-dom';
import './SearchBar.css';

export interface SearchBarProps {
  onSearch?: (query: string) => void;
  suggestions?: string[];
  onQueryChange?: (query: string) => void;
  placeholder?: string;
}

export function SearchBar({
  onSearch,
  suggestions = [],
  onQueryChange,
  placeholder = 'Search products...',
}: SearchBarProps) {
  const [query, setQuery] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [activeIndex, setActiveIndex] = useState(-1);
  const inputRef = useRef<HTMLInputElement>(null);
  const listRef = useRef<HTMLUListElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const navigate = useNavigate();

  const displayedSuggestions = suggestions.slice(0, 8);
  const showDropdown = isOpen && query.length >= 2 && displayedSuggestions.length > 0;

  // Debounced query change notification
  const debouncedQueryChange = useCallback(
    (value: string) => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
      if (value.length >= 2 && onQueryChange) {
        debounceRef.current = setTimeout(() => {
          onQueryChange(value);
        }, 300);
      }
    },
    [onQueryChange]
  );

  // Cleanup debounce on unmount
  useEffect(() => {
    return () => {
      if (debounceRef.current) {
        clearTimeout(debounceRef.current);
      }
    };
  }, []);

  const handleInputChange = (e: ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.slice(0, 200);
    setQuery(value);
    setActiveIndex(-1);

    if (value.length >= 2) {
      setIsOpen(true);
      debouncedQueryChange(value);
    } else {
      setIsOpen(false);
    }
  };

  const executeSearch = (searchQuery: string) => {
    const trimmed = searchQuery.trim();
    if (!trimmed) return;

    setIsOpen(false);
    setActiveIndex(-1);

    if (onSearch) {
      onSearch(trimmed);
    }
    navigate(`/search?q=${encodeURIComponent(trimmed)}`);
  };

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (!showDropdown) {
      if (e.key === 'Enter') {
        executeSearch(query);
      }
      return;
    }

    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev < displayedSuggestions.length - 1 ? prev + 1 : 0
        );
        break;
      case 'ArrowUp':
        e.preventDefault();
        setActiveIndex((prev) =>
          prev > 0 ? prev - 1 : displayedSuggestions.length - 1
        );
        break;
      case 'Enter':
        e.preventDefault();
        if (activeIndex >= 0 && activeIndex < displayedSuggestions.length) {
          selectSuggestion(displayedSuggestions[activeIndex]);
        } else {
          executeSearch(query);
        }
        break;
      case 'Escape':
        setIsOpen(false);
        setActiveIndex(-1);
        break;
    }
  };

  const selectSuggestion = (suggestion: string) => {
    setQuery(suggestion);
    setIsOpen(false);
    setActiveIndex(-1);
    executeSearch(suggestion);
  };

  const handleBlur = (e: React.FocusEvent<HTMLDivElement>) => {
    // Only close if focus leaves the entire container
    if (!containerRef.current?.contains(e.relatedTarget as Node)) {
      setIsOpen(false);
      setActiveIndex(-1);
    }
  };

  const handleSearchButtonClick = () => {
    executeSearch(query);
  };

  // Scroll active item into view
  useEffect(() => {
    if (activeIndex >= 0 && listRef.current) {
      const activeItem = listRef.current.children[activeIndex] as HTMLElement;
      if (activeItem) {
        activeItem.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [activeIndex]);

  const listboxId = 'search-autocomplete-listbox';

  return (
    <div
      className="search-bar"
      ref={containerRef}
      onBlur={handleBlur}
      role="combobox"
      aria-expanded={showDropdown}
      aria-haspopup="listbox"
      aria-owns={listboxId}
    >
      <div className="search-bar__input-wrapper">
        <input
          ref={inputRef}
          type="text"
          className="search-bar__input"
          value={query}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (query.length >= 2) setIsOpen(true);
          }}
          placeholder={placeholder}
          maxLength={200}
          aria-label="Search products"
          aria-autocomplete="list"
          aria-controls={listboxId}
          aria-activedescendant={
            activeIndex >= 0 ? `search-suggestion-${activeIndex}` : undefined
          }
          autoComplete="off"
        />
        <button
          type="button"
          className="search-bar__button"
          onClick={handleSearchButtonClick}
          aria-label="Search"
        >
          <svg
            className="search-bar__icon"
            width="20"
            height="20"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="8" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
        </button>
      </div>

      {showDropdown && (
        <ul
          id={listboxId}
          ref={listRef}
          className="search-bar__dropdown"
          role="listbox"
          aria-label="Search suggestions"
        >
          {displayedSuggestions.map((suggestion, index) => (
            <li
              key={`${suggestion}-${index}`}
              id={`search-suggestion-${index}`}
              className={`search-bar__suggestion${
                index === activeIndex ? ' search-bar__suggestion--active' : ''
              }`}
              role="option"
              aria-selected={index === activeIndex}
              onMouseDown={(e) => {
                e.preventDefault(); // prevent blur before click registers
                selectSuggestion(suggestion);
              }}
              onMouseEnter={() => setActiveIndex(index)}
            >
              <svg
                className="search-bar__suggestion-icon"
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              <span className="search-bar__suggestion-text">{suggestion}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
