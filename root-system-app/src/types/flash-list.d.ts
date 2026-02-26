// ─── FlashList type augmentation ────────────────────────────────────────────
// @shopify/flash-list v2.x ships estimatedItemSize as a runtime prop but the
// installed type definitions don't include it. This module augmentation adds
// it back so TypeScript accepts it without changing any component code.
// Remove this file once the upstream types are corrected.

import '@shopify/flash-list';

declare module '@shopify/flash-list' {
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  interface FlashListProps<T> {
    estimatedItemSize?: number;
  }
}
