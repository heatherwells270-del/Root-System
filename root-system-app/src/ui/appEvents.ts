// ═══════════════════════════════════════════════════════════════════════════
// ROOT SYSTEM — App Event Bus
//
// Minimal event emitter for cross-component state signals that don't belong
// in React state or context. Used exclusively for navigation-layer transitions
// (identity created, community ready) so App.tsx can update its auth state
// without prop drilling or a full state management library.
// ═══════════════════════════════════════════════════════════════════════════

type AppEventType = 'identity-created' | 'community-ready' | 'data-nuked';
type Handler = () => void;

const _listeners = new Map<AppEventType, Handler[]>();

export function emitAppEvent(event: AppEventType): void {
  const handlers = _listeners.get(event);
  if (handlers) handlers.slice().forEach(h => h());
}

export function onAppEvent(event: AppEventType, handler: Handler): () => void {
  if (!_listeners.has(event)) _listeners.set(event, []);
  _listeners.get(event)!.push(handler);
  return () => {
    const arr = _listeners.get(event);
    if (arr) {
      const i = arr.indexOf(handler);
      if (i >= 0) arr.splice(i, 1);
    }
  };
}
