'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  getAnalysis,
  getAnalysisStatus,
  getCategories,
  type AnalysisResponse,
  type AnalysisStatusResponse,
  type CategoriesResponse,
} from '@/lib/api';
import { indexTaxonomy, type TaxonomyIndex } from '@/lib/taxonomy';

// How often the analysis status is re-read; the dashboard reloads when its counts change
const POLL_MS = 5000;

export interface LoadError {
  message: string;
  /** The backend could not be reached at all. */
  unreachable: boolean;
}

interface Loaded<T> {
  key: string;
  data: T | null;
  error: LoadError | null;
}

const toLoadError = (err: unknown): LoadError => ({
  message: err instanceof Error ? err.message : String(err),
  unreachable: err instanceof ApiError && err.unreachable,
});

/** Unified category tree with article counts for the period. Keeps the last tree while reloading. */
export function useCategories(days: number, retry: number) {
  const key = `${days}:${retry}`;
  const [state, setState] = useState<Loaded<CategoriesResponse>>({ key: '', data: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    getCategories(days, ctrl.signal).then(
      (data) => setState({ key, data, error: null }),
      (err) => {
        if (!ctrl.signal.aborted) setState((s) => ({ key, data: s.data, error: toLoadError(err) }));
      },
    );
    return () => ctrl.abort();
  }, [days, key]);

  const index: TaxonomyIndex | null = useMemo(
    () => (state.data ? indexTaxonomy(state.data.categories) : null),
    [state.data],
  );

  return { data: state.data, index, error: state.error, loading: state.key !== key };
}

/**
 * Dashboard for a filter selection. The backend analyses articles on its own; a new `refresh`
 * value (from the analysis status) re-reads the dashboard in place, without the loading state.
 */
export function useAnalysis(categories: string[], days: number, retry: number, refresh: string) {
  const key = `${days}|${[...categories].sort().join(',')}|${retry}`;
  const [state, setState] = useState<Loaded<AnalysisResponse>>({ key: '', data: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    getAnalysis({ categories, days }, ctrl.signal).then(
      (data) => setState({ key, data, error: null }),
      (err) => {
        if (!ctrl.signal.aborted) setState((s) => ({ key, data: s.data, error: toLoadError(err) }));
      },
    );
    return () => ctrl.abort();
    // `key` covers categories, days and retry
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key, refresh]);

  return { data: state.data, error: state.error, loading: state.key !== key };
}

/** How many articles Gemma has analysed and how many are left, re-read every POLL_MS. */
export function useAnalysisStatus(retry: number) {
  const [state, setState] = useState<{ data: AnalysisStatusResponse | null; error: LoadError | null }>({
    data: null,
    error: null,
  });

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = () =>
      getAnalysisStatus(ctrl.signal).then(
        (data) => setState({ data, error: null }),
        (err) => {
          if (!ctrl.signal.aborted) setState((s) => ({ data: s.data, error: toLoadError(err) }));
        },
      ).finally(() => {
        if (!ctrl.signal.aborted) timer = setTimeout(load, POLL_MS);
      });

    void load();
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
  }, [retry]);

  return state;
}
