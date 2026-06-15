import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useReducer,
} from 'react';
import type { Product } from '../api/client';

const CART_KEY = 'slc_cart';

// ─── Types ────────────────────────────────────────────────────────────────────

export interface CartItem {
  product: Product;
  quantity: number;
  /** Selected size for sizeable items (e.g. "UK 10" or "L"). */
  size?: string;
}

interface CartState {
  items: CartItem[];
}

type CartAction =
  | { type: 'ADD'; product: Product; size?: string }
  | { type: 'REMOVE'; productId: string }
  | { type: 'SET_QTY'; productId: string; quantity: number }
  | { type: 'CLEAR' }
  | { type: 'HYDRATE'; items: CartItem[] };

// ─── Reducer ──────────────────────────────────────────────────────────────────

function cartReducer(state: CartState, action: CartAction): CartState {
  switch (action.type) {
    case 'HYDRATE':
      return { items: action.items };

    case 'ADD': {
      const existing = state.items.find((i) => i.product.id === action.product.id);
      if (existing) {
        return {
          items: state.items.map((i) =>
            i.product.id === action.product.id
              ? { ...i, quantity: i.quantity + 1, size: action.size ?? i.size }
              : i,
          ),
        };
      }
      return { items: [...state.items, { product: action.product, quantity: 1, size: action.size }] };
    }

    case 'REMOVE':
      return { items: state.items.filter((i) => i.product.id !== action.productId) };

    case 'SET_QTY':
      if (action.quantity < 1) {
        return { items: state.items.filter((i) => i.product.id !== action.productId) };
      }
      return {
        items: state.items.map((i) =>
          i.product.id === action.productId ? { ...i, quantity: action.quantity } : i,
        ),
      };

    case 'CLEAR':
      return { items: [] };

    default:
      return state;
  }
}

// ─── Context ──────────────────────────────────────────────────────────────────

interface CartContextValue {
  items: CartItem[];
  itemCount: number;
  total: number;
  addItem: (product: Product, size?: string) => void;
  removeItem: (productId: string) => void;
  setQuantity: (productId: string, quantity: number) => void;
  clearCart: () => void;
}

const CartContext = createContext<CartContextValue | null>(null);

export function CartProvider({ children }: { children: React.ReactNode }) {
  const [state, dispatch] = useReducer(cartReducer, { items: [] });

  // Hydrate from localStorage on mount
  useEffect(() => {
    try {
      const raw = localStorage.getItem(CART_KEY);
      if (raw) {
        const items = JSON.parse(raw) as CartItem[];
        dispatch({ type: 'HYDRATE', items });
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  // Persist to localStorage on every change
  useEffect(() => {
    localStorage.setItem(CART_KEY, JSON.stringify(state.items));
  }, [state.items]);

  const addItem = useCallback((product: Product, size?: string) => {
    dispatch({ type: 'ADD', product, size });
  }, []);

  const removeItem = useCallback((productId: string) => {
    dispatch({ type: 'REMOVE', productId });
  }, []);

  const setQuantity = useCallback((productId: string, quantity: number) => {
    dispatch({ type: 'SET_QTY', productId, quantity });
  }, []);

  const clearCart = useCallback(() => {
    dispatch({ type: 'CLEAR' });
  }, []);

  const itemCount = state.items.reduce((sum, i) => sum + i.quantity, 0);
  const total = state.items.reduce((sum, i) => sum + i.product.price * i.quantity, 0);

  return (
    <CartContext.Provider
      value={{ items: state.items, itemCount, total, addItem, removeItem, setQuantity, clearCart }}
    >
      {children}
    </CartContext.Provider>
  );
}

export function useCart(): CartContextValue {
  const ctx = useContext(CartContext);
  if (!ctx) throw new Error('useCart must be used within CartProvider');
  return ctx;
}
