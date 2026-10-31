// Client for analytic-be. Requests go to /api/*, which next.config.ts rewrites to the backend
// (ANALYTIC_API_URL, default http://localhost:4000), so the browser never needs CORS.

export type Sentiment = 'positive' | 'neutral' | 'negative';
export type Counts = Record<Sentiment, number>;

export interface CategoryNode {
  id: string;
  name: string;
  /** Articles published in the period. */
  articles: number;
  /** Portal keys that contributed articles. */
  sources: string[];
  children?: CategoryNode[];
}

export interface CategoriesResponse {
  days: number;
  periods: number[];
  total: number;
  categories: CategoryNode[];
}

export interface Group {
  id: string;
  name: string;
  articles: number;
  /** Articles with a sentiment; only these are in `counts`. */
  analyzed: number;
  counts: Counts;
}

export interface ArticleCard {
  id: string;
  title: string;
  description: string | null;
  url: string;
  imageUrl: string | null;
  publishedAt: string | null;
  portal: { key: string; name: string };
  category: { id: string; name: string };
  sentiment: { label: Sentiment; score: number; reason: string } | null;
}

export type AnalyzeMode = 'auto' | 'all' | 'none';

export interface AnalysisResponse {
  period: { days: number; from: string; to: string };
  focus: { id: string; name: string; hasChildren: boolean } | null;
  totals: Group;
  breakdown: { by: 'category' | 'source'; rows: Group[] };
  sources: Group[];
  trend: {
    bucketHours: number;
    points: { t: string; counts: Counts; analyzed: number }[];
    series: { key: string; name: string; points: (Counts & { analyzed: number })[] }[];
  };
  articles: ArticleCard[];
  analysis: {
    configured: boolean;
    model: string;
    /** Articles waiting for Gemma (whole queue). */
    pending: number;
    running: boolean;
    /** Queued by this request. */
    queued: number;
    /** Articles in this selection without a sentiment yet. */
    remaining: number;
    lastError: string | null;
  };
  /** Where the articles come from: the db-sample backup. Periods count back from its newest article. */
  dataset: {
    name: string;
    articles: number;
    exportedAt: string | null;
    latestArticleAt: string | null;
  };
}

export class ApiError extends Error {
  /** True when the backend could not be reached at all (not started, wrong port). */
  constructor(
    message: string,
    readonly unreachable = false,
  ) {
    super(message);
  }
}

const NOT_RUNNING = 'The analysis service is not running (analytic-be).';

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let res: Response;
  try {
    res = await fetch(`/api${path}`, {
      ...init,
      headers: { 'content-type': 'application/json', ...init?.headers },
    });
  } catch (err) {
    if (init?.signal?.aborted) throw err;
    throw new ApiError(NOT_RUNNING, true);
  }
  if (!res.ok) {
    const body = await res.text().catch(() => '');
    // The Next proxy answers a bare 500 when the backend is not listening
    if (res.status >= 500 && (!body || body.trim() === 'Internal Server Error')) {
      throw new ApiError(NOT_RUNNING, true);
    }
    // The backend answers errors as JSON: { error: "..." }
    let detail = body.slice(0, 300);
    try {
      detail = (JSON.parse(body) as { error?: string }).error ?? detail;
    } catch {
      // not JSON; keep the text
    }
    throw new ApiError(`Analysis service error ${res.status}${detail ? `: ${detail}` : ''}`);
  }
  return res.json() as Promise<T>;
}

export const getCategories = (days: number, signal?: AbortSignal) =>
  request<CategoriesResponse>(`/analysis/categories?days=${days}`, { signal });

export const getAnalysis = (
  body: { categories: string[]; days: number; analyze: AnalyzeMode },
  signal?: AbortSignal,
) =>
  request<AnalysisResponse>('/analysis', {
    method: 'POST',
    body: JSON.stringify(body),
    signal,
  });

export const total = (c: Counts) => c.positive + c.neutral + c.negative;

/** (positive − negative) / analysed, in −1..1. */
export const netScore = (c: Counts) => {
  const t = total(c);
  return t ? (c.positive - c.negative) / t : 0;
};
