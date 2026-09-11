import { useSyncExternalStore } from 'react';
// Narrow integration point for memory-only features; carries no patient values.
const owners = new Set<symbol>();
const listeners = new Set<() => void>();
export function holdSensitiveSession() {
  const owner = Symbol();
  owners.add(owner);
  listeners.forEach((l) => l());
  return () => {
    owners.delete(owner);
    listeners.forEach((l) => l());
  };
}
export const hasSensitiveSession = () => owners.size > 0;
export function useSensitiveSession() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => {
        listeners.delete(listener);
      };
    },
    hasSensitiveSession,
    () => false,
  );
}
