'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  ApiError,
  getAnalysis,
  getCategories,
  type AnalysisResponse,
  type AnalyzeMode,
  type CategoriesResponse,
} from '@/lib/api';
import { indexTaxonomy, type TaxonomyIndex } from '@/lib/taxonomy';

// While Gemma is working, re-read the dashboard this often
const POLL_MS = 4000;

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
 * Dashboard for a filter selection. The first request queues unanalysed articles with Gemma
 * (`mode`); while the queue is busy the dashboard is re-read without queueing more.
 */
export function useAnalysis(categories: string[], days: number, mode: AnalyzeMode, nonce: number) {
  const key = `${days}|${[...categories].sort().join(',')}|${mode}|${nonce}`;
  const [state, setState] = useState<Loaded<AnalysisResponse>>({ key: '', data: null, error: null });

  useEffect(() => {
    const ctrl = new AbortController();
    let timer: ReturnType<typeof setTimeout> | undefined;

    const load = (analyze: AnalyzeMode) =>
      getAnalysis({ categories, days, analyze }, ctrl.signal).then(
        (data) => {
          setState({ key, data, error: null });
          if (data.analysis.pending > 0) timer = setTimeout(() => load('none'), POLL_MS);
        },
        (err) => {
          if (!ctrl.signal.aborted) setState((s) => ({ key, data: s.data, error: toLoadError(err) }));
        },
      );

    void load(mode);
    return () => {
      ctrl.abort();
      clearTimeout(timer);
    };
    // `key` covers categories, days, mode and nonce
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  return { data: state.data, error: state.error, loading: state.key !== key };
}
