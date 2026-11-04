import { afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';
const events = new Map<string, Set<(event: { payload: unknown }) => void>>();
window.__TAURI__ = {
  core: { invoke: vi.fn() },
  event: {
    listen: vi.fn(async (name, listener) => {
      if (!events.has(name)) events.set(name, new Set());
      const handler = listener as (event: { payload: unknown }) => void;
      events.get(name)!.add(handler);
      return () => {
        events.get(name)?.delete(handler);
      };
    }),
  },
};
export const invoke = vi.mocked(window.__TAURI__.core.invoke);
export function emit(name: string, payload?: unknown) {
  for (const listener of events.get(name) || []) listener({ payload });
}
afterEach(() => {
  cleanup();
  vi.useRealTimers();
});
class Observer {
  observe() {}
  unobserve() {}
  disconnect() {}
}
vi.stubGlobal('ResizeObserver', Observer);
HTMLElement.prototype.scrollIntoView = vi.fn();
