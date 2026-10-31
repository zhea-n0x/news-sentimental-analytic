const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36'

export class HttpError extends Error {
  constructor(
    readonly status: number,
    readonly url: string,
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

export async function fetchHtml(url: string, { retries = 2, timeoutMs = 15_000 }: FetchOptions = {}) {
  const headers = { 'User-Agent': USER_AGENT, 'Accept-Language': 'id-ID,id;q=0.9,en;q=0.8' }

  for (let attempt = 0; ; attempt++) {
    try {
      const res = await fetch(url, { headers, signal: AbortSignal.timeout(timeoutMs) })
      // Bot-protection challenges (AWS WAF answers 202 with an empty body) are not content; never try to bypass them
      if (res.headers.get('x-amzn-waf-action') || res.headers.get('cf-mitigated')) {
        throw new BlockedError(url)
      }
      if (!res.ok) throw new HttpError(res.status, url)
      return await res.text()
    } catch (err) {
      // 4xx (other than 429) and bot challenges will not fix themselves, so do not retry them
      const permanent =
        err instanceof BlockedError || (err instanceof HttpError && err.status < 500 && err.status !== 429)
      if (permanent || attempt >= retries) throw err
      await Bun.sleep(1000 * 2 ** attempt)
    }
  }
}
