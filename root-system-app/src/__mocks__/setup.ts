// ─── Global test mocks ──────────────────────────────────────────────────────
// Loaded before every test via jest.setupFiles.
// Replaces Expo native modules with pure Node.js equivalents so tests run
// without a device or simulator.

// In-memory SecureStore — same interface, no native code
const _store: Record<string, string> = {};

jest.mock('expo-secure-store', () => ({
  setItemAsync:    async (k: string, v: string) => { _store[k] = v; },
  getItemAsync:    async (k: string) => _store[k] ?? null,
  deleteItemAsync: async (k: string) => { delete _store[k]; },
}));

// expo-crypto → Node.js built-in crypto (same entropy quality)
jest.mock('expo-crypto', () => ({
  getRandomBytesAsync: async (n: number) => require('crypto').randomBytes(n),
  randomUUID: () => require('crypto').randomUUID(),
}));
