'use client';

import { useMemo, useSyncExternalStore } from 'react';

// Cached once per page load on the client.
let clientNow: number | null = null;

const subscribe = () => () => {};
const getSnapshot = () => (clientNow ??= Date.now());
// Server prerender and hydration see `null`, so no current time is read
// during prerender (which `cacheComponents` forbids).
const getServerSnapshot = () => null;

/** Current date, or `null` until the component has hydrated on the client. */
export function useNow(): Date | null {
  const ms = useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
  return useMemo(() => (ms === null ? null : new Date(ms)), [ms]);
}
