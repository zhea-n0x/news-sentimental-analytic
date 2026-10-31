import { config } from '../config'
import { assertAllowed } from './robots'
import { waitForTurn } from './throttle'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
    // From a Retry-After header on 429/503
    readonly retryAfterMs: number | null = null,
  ) {
    super(`HTTP ${status} for ${url}`)
  }
}

export class BlockedError extends Error {
  constructor(readonly url: string) {
    super(`Blocked by bot protection (challenge page) for ${url}`)
  }
}

interface FetchOptions {
  retries?: number
  timeoutMs?: number
}

/** Like fetchHtml, but a 404 returns null (some index pages 404 past the last page). */
export async function fetchPage(url: string, options?: FetchOptions) {
  try {
    return await fetchHtml(url, options)
  } catch (err) {
    if (err instanceof HttpError && err.status === 404) return null
    throw err
  }
}

/**
 * GETs a page politely: robots.txt must allow it (RobotsDisallowedError otherwise), requests to the same
 * site are spaced out, and 429/503 responses are retried after the server's Retry-After.
 */
export async function fetchHtml(url: string, { retries = 2, timeoutMs = 15_000 }: FetchOptions = {}) {
  await assertAllowed(url)
  const headers = { 'User-Agent': config.userAgent, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' }

  for (let attempt = 0; ; attempt++) {
    try {
      await waitForTurn(url)
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      // Bot-protection challenges (AWS WAF answers 202 with an empty body) are not content; never try to bypass them
      if (res.headers.get('x-amzn-waf-action') || res.headers.get('cf-mitigated')) {
        throw new BlockedError(url)
      }
      if (!res.ok) throw new HttpError(res.status, url, parseRetryAfter(res.headers.get('retry-after')))
      return await res.text()
    } catch (err) {
      // 4xx (other than 429) and bot challenges will not fix themselves, so do not retry them
      const permanent =
        err instanceof BlockedError || (err instanceof HttpError && err.status < 500 && err.status !== 429)
      if (permanent || attempt >= retries) throw err
      const retryAfter = err instanceof HttpError ? err.retryAfterMs : null
      await Bun.sleep(Math.min(retryAfter ?? 2000 * 2 ** attempt, 60_000))
    }
  }
}

function parseRetryAfter(value: string | null) {
  if (!value) return null
  const seconds = Number(value)
  if (Number.isFinite(seconds)) return seconds * 1000
  const date = Date.parse(value)
  return Number.isNaN(date) ? null : Math.max(0, date - Date.now())
}
