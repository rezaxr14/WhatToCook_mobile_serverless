import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import confetti from 'canvas-confetti';
import { localized } from '../lib/catalog';
import { supabase } from '../lib/supabase';
import { useAuth } from './AuthContext';

export interface ShoppingItem {
  id: string;
  name: string;
  category?: string;
  quantity?: string;
  checked: boolean;
  addedFrom?: string;
  sourceRecipeId?: number;
}

interface ShoppingListContextType {
  items: ShoppingItem[];
  isShoppingModalOpen: boolean;
  isTelegramModalOpen: boolean;
  openShoppingModal: () => void;
  closeShoppingModal: () => void;
  openTelegramModal: () => void;
  closeTelegramModal: () => void;
  addItem: (name: string, category?: string, quantity?: string, addedFrom?: string) => void;
  addMultipleItems: (
    newItems: Array<{
      name: string;
      category?: string;
      quantity?: string;
      addedFrom?: string;
      sourceRecipeId?: number;
    }>,
    autoOpenModal?: boolean,
  ) => void;
  toggleItem: (id: string) => void;
  removeItem: (id: string) => void;
  clearCompleted: () => void;
  clearAll: () => void;
  exportToWhatsApp: () => void;
  exportToTelegram: () => void;
  copyToClipboard: () => Promise<boolean>;
  printList: () => void;
}

const ShoppingListContext = createContext<ShoppingListContextType | undefined>(undefined);

const STORAGE_KEY = 'whattocook_shopping_list_v1';
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function newId(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  // RFC 4122 v4 fallback for older browsers.
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (char) => {
    const random = (Math.random() * 16) | 0;
    const value = char === 'x' ? random : (random & 0x3) | 0x8;
    return value.toString(16);
  });
}

function normalizeStored(items: ShoppingItem[]): ShoppingItem[] {
  return items.map((item) => ({
    ...item,
    id: UUID_RE.test(item.id) ? item.id : newId(),
  }));
}

function readLocal(): ShoppingItem[] {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (!saved) return [];
    const parsed = JSON.parse(saved);
    return Array.isArray(parsed) ? normalizeStored(parsed) : [];
  } catch {
    return [];
  }
}

export const ShoppingListProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [items, setItems] = useState<ShoppingItem[]>(readLocal);
  const [isShoppingModalOpen, setIsShoppingModalOpen] = useState(false);
  const [isTelegramModalOpen, setIsTelegramModalOpen] = useState(false);
  const { user, isAuthenticated, isLoading: authLoading } = useAuth();
  const hydratedRef = useRef(false);
  const lastSyncRef = useRef<string>('');

  const openShoppingModal = useCallback(() => setIsShoppingModalOpen(true), []);
  const closeShoppingModal = useCallback(() => setIsShoppingModalOpen(false), []);
  const openTelegramModal = useCallback(() => setIsTelegramModalOpen(true), []);
  const closeTelegramModal = useCallback(() => setIsTelegramModalOpen(false), []);

  // Merge the signed-in user's Postgres list with the offline cache once auth is
  // ready. Local-only items are kept and pushed by the sync effect below.
  useEffect(() => {
    if (authLoading) return;

    let cancelled = false;
    hydratedRef.current = false;

    const load = async () => {
      if (!isAuthenticated || !user) {
        hydratedRef.current = true;
        return;
      }

      const local = readLocal();
      try {
        const { data, error } = await supabase
          .from('grocery_items')
          .select('id,name,category,quantity,checked,source_recipe_id,created_at')
          .eq('user_id', user.id)
          .order('created_at', { ascending: true });

        if (error) throw error;
        if (cancelled) return;

        const rows = data ?? [];
        const recipeIds = [
          ...new Set(
            rows
              .map((row) => row.source_recipe_id)
              .filter((id): id is number => typeof id === 'number'),
          ),
        ];
        const recipeNames = new Map<number, string>();
        if (recipeIds.length > 0) {
          const { data: recipes } = await supabase
            .from('recipes')
            .select('id,title')
            .in('id', recipeIds);
          for (const recipe of recipes ?? []) {
            recipeNames.set(recipe.id, localized(recipe.title));
          }
        }

        const remote: ShoppingItem[] = rows.map((row) => ({
          id: row.id,
          name: row.name,
          category: row.category,
          quantity: row.quantity,
          checked: row.checked,
          addedFrom:
            row.source_recipe_id != null ? recipeNames.get(row.source_recipe_id) : undefined,
          sourceRecipeId: row.source_recipe_id ?? undefined,
        }));

        const byName = new Map(remote.map((item) => [item.name.toLowerCase(), item]));
        const merged = [...remote];
        for (const localItem of local) {
          const existing = byName.get(localItem.name.toLowerCase());
          if (!existing) {
            merged.push(localItem);
            byName.set(localItem.name.toLowerCase(), localItem);
          } else if (!existing.addedFrom && localItem.addedFrom) {
            existing.addedFrom = localItem.addedFrom;
            existing.sourceRecipeId = localItem.sourceRecipeId ?? existing.sourceRecipeId;
          }
        }

        if (!cancelled) setItems(merged);
      } catch (err) {
        // Offline or RLS error: keep the local cache usable.
        console.warn('Shopping list remote sync unavailable; using local cache.', err);
        if (!cancelled) setItems(local);
      } finally {
        if (!cancelled) hydratedRef.current = true;
      }
    };

    void load();
    return () => {
      cancelled = true;
    };
  }, [authLoading, isAuthenticated, user]);

  // Save locally immediately; sync to Postgres after a short debounce.
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    } catch (err) {
      console.error('Failed to save shopping list to localStorage:', err);
    }

    if (!hydratedRef.current || !isAuthenticated || !user) return;

    const serialized = JSON.stringify(items);
    if (serialized === lastSyncRef.current) return;

    const timer = window.setTimeout(async () => {
      try {
        const { data: existing, error: existingError } = await supabase
          .from('grocery_items')
          .select('id')
          .eq('user_id', user.id);
        if (existingError) throw existingError;

        const keep = new Set(items.map((item) => item.id));
        const removed = (existing ?? [])
          .map((row) => row.id)
          .filter((id) => !keep.has(id));
        if (removed.length > 0) {
          const { error: deleteError } = await supabase
            .from('grocery_items')
            .delete()
            .eq('user_id', user.id)
            .in('id', removed);
          if (deleteError) throw deleteError;
        }

        if (items.length > 0) {
          const rows = items.map((item) => ({
            id: item.id,
            user_id: user.id,
            name: item.name,
            category: item.category || 'General',
            quantity: item.quantity || '1 item',
            checked: item.checked,
            source_recipe_id: item.sourceRecipeId ?? null,
            ingredient_id: null,
            updated_at: new Date().toISOString(),
          }));
          const { error: upsertError } = await supabase
            .from('grocery_items')
            .upsert(rows, { onConflict: 'id' });
          if (upsertError) throw upsertError;
        }

        lastSyncRef.current = serialized;
      } catch (err) {
        // Keep the local copy; retry on the next change/reconnect.
        console.warn('Shopping list sync failed; kept locally.', err);
      }
    }, 600);

    return () => window.clearTimeout(timer);
  }, [items, isAuthenticated, user]);

  const addItem = useCallback(
    (name: string, category?: string, quantity?: string, addedFrom?: string) => {
      const trimmed = name.trim();
      if (!trimmed) return;

      setItems((prev) => {
        if (prev.some((item) => item.name.toLowerCase() === trimmed.toLowerCase())) {
          return prev;
        }
        return [
          ...prev,
          {
            id: newId(),
            name: trimmed,
            category: category || 'General',
            quantity: quantity || '1 item',
            checked: false,
            addedFrom,
          },
        ];
      });
    },
    [],
  );

  const addMultipleItems = useCallback(
    (
      newItems: Array<{
        name: string;
        category?: string;
        quantity?: string;
        addedFrom?: string;
        sourceRecipeId?: number;
      }>,
      autoOpenModal = false,
    ) => {
      setItems((prev) => {
        const existingNames = new Set(prev.map((item) => item.name.toLowerCase()));
        const toAdd: ShoppingItem[] = [];

        for (const item of newItems) {
          const trimmed = item.name.trim();
          if (trimmed && !existingNames.has(trimmed.toLowerCase())) {
            existingNames.add(trimmed.toLowerCase());
            toAdd.push({
              id: newId(),
              name: trimmed,
              category: item.category || 'General',
              quantity: item.quantity || '1 item',
              checked: false,
              addedFrom: item.addedFrom,
              sourceRecipeId: item.sourceRecipeId,
            });
          }
        }

        if (toAdd.length > 0) {
          confetti({ particleCount: 60, spread: 60, origin: { y: 0.7 } });
        }
        return [...prev, ...toAdd];
      });

      if (autoOpenModal) {
        setIsShoppingModalOpen(true);
      }
    },
    [],
  );

  const toggleItem = useCallback((id: string) => {
    setItems((prev) =>
      prev.map((item) => (item.id === id ? { ...item, checked: !item.checked } : item)),
    );
  }, []);

  const removeItem = useCallback((id: string) => {
    setItems((prev) => prev.filter((item) => item.id !== id));
  }, []);

  const clearCompleted = useCallback(() => {
    setItems((prev) => prev.filter((item) => !item.checked));
  }, []);

  const clearAll = useCallback(() => {
    setItems([]);
  }, []);

  const formatListText = useCallback((): string => {
    if (items.length === 0) return 'My WhatToCook Shopping List is currently empty!';

    const unchecked = items.filter((i) => !i.checked);
    const checked = items.filter((i) => i.checked);

    let text = '🛒 *WhatToCook - Smart Grocery List*\n\n';

    if (unchecked.length > 0) {
      text += '📋 *To Buy:*\n';
      unchecked.forEach((item) => {
        text += `• ${item.name} (${item.quantity || '1'})\n`;
      });
      text += '\n';
    }

    if (checked.length > 0) {
      text += '✅ *Purchased:*\n';
      checked.forEach((item) => {
        text += `• ~${item.name}~\n`;
      });
      text += '\n';
    }

    text += 'Generated by WhatToCook';
    return text;
  }, [items]);

  const exportToWhatsApp = useCallback(() => {
    const text = encodeURIComponent(formatListText());
    window.open(`https://wa.me/?text=${text}`, '_blank');
  }, [formatListText]);

  const exportToTelegram = useCallback(() => {
    const text = encodeURIComponent(formatListText());
    window.open(`https://t.me/share/url?url=${text}`, '_blank');
  }, [formatListText]);

  const copyToClipboard = useCallback(async (): Promise<boolean> => {
    try {
      await navigator.clipboard.writeText(formatListText());
      return true;
    } catch {
      return false;
    }
  }, [formatListText]);

  const printList = useCallback(() => {
    window.print();
  }, []);

  const value = useMemo<ShoppingListContextType>(
    () => ({
      items,
      isShoppingModalOpen,
      isTelegramModalOpen,
      openShoppingModal,
      closeShoppingModal,
      openTelegramModal,
      closeTelegramModal,
      addItem,
      addMultipleItems,
      toggleItem,
      removeItem,
      clearCompleted,
      clearAll,
      exportToWhatsApp,
      exportToTelegram,
      copyToClipboard,
      printList,
    }),
    [
      items,
      isShoppingModalOpen,
      isTelegramModalOpen,
      openShoppingModal,
      closeShoppingModal,
      openTelegramModal,
      closeTelegramModal,
      addItem,
      addMultipleItems,
      toggleItem,
      removeItem,
      clearCompleted,
      clearAll,
      exportToWhatsApp,
      exportToTelegram,
      copyToClipboard,
      printList,
    ],
  );

  return <ShoppingListContext.Provider value={value}>{children}</ShoppingListContext.Provider>;
};

export const useShoppingList = () => {
  const context = useContext(ShoppingListContext);
  if (!context) {
    throw new Error('useShoppingList must be used within a ShoppingListProvider');
  }
  return context;
};
