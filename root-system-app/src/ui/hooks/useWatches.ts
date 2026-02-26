// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — useWatches hook
//
// Local-only keyword watches. Watch terms never leave the device.
// Persisted in SecureStore (already a dependency). Max 5 terms.
//
// Usage:
//   const { watches, addWatch, removeWatch } = useWatches();
// ═══════════════════════════════════════════════════════════════════════════

import { useCallback, useEffect, useState } from 'react';
import * as SecureStore from 'expo-secure-store';

const STORAGE_KEY = 'rs_watches';
const MAX_WATCHES = 5;

export function useWatches() {
  const [watches, setWatches] = useState<string[]>([]);

  // Load on mount
  useEffect(() => {
    SecureStore.getItemAsync(STORAGE_KEY)
      .then(raw => {
        if (raw) {
          try { setWatches(JSON.parse(raw) as string[]); }
          catch { /* ignore corrupt data */ }
        }
      })
      .catch(() => {});
  }, []);

  const addWatch = useCallback((term: string) => {
    const trimmed = term.trim().toLowerCase();
    if (!trimmed) return;
    setWatches(prev => {
      if (prev.includes(trimmed) || prev.length >= MAX_WATCHES) return prev;
      const next = [...prev, trimmed];
      void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  const removeWatch = useCallback((term: string) => {
    setWatches(prev => {
      const next = prev.filter(w => w !== term);
      void SecureStore.setItemAsync(STORAGE_KEY, JSON.stringify(next));
      return next;
    });
  }, []);

  return { watches, addWatch, removeWatch };
}
