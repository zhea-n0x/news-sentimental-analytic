import robotsParser from 'robots-parser'
import { config } from '../config'
import { setCrawlDelay, waitForTurn } from './throttle'

type Robots = ReturnType<typeof robotsParser>

interface RobotsEntry {
  robots: Robots | null
  // Why robots.txt could not be used: behind a bot challenge, or unreachable (5xx / network error)
  problem: { kind: 'blocked' | 'unreachable'; message: string } | null
  fetchedAt: number
}

// Re-read at most every 30 minutes, so every hourly run sees the current file
const TTL_MS = 30 * 60_000
const cache = new Map<string, Promise<RobotsEntry>>()

// Well-known AI crawler tokens. Our requests are matched against the "*" group; these are only reported
// so you can see when a portal opts out of AI crawlers specifically.
const AI_CRAWLERS = [
  'ClaudeBot', 'Claude-User', 'Claude-SearchBot', 'anthropic-ai', 'GPTBot', 'ChatGPT-User', 'OAI-SearchBot',
  'CCBot', 'Google-Extended', 'PerplexityBot', 'Bytespider', 'cohere-ai', 'meta-externalagent',
]

export class RobotsDisallowedError extends Error {
  constructor(readonly url: string) {
    super(`Disallowed by robots.txt: ${url}`)
  }
}

export class RobotsUnavailableError extends Error {
  constructor(
    readonly origin: string,
    readonly kind: 'blocked' | 'unreachable',
    reason: string,
  ) {
    super(`robots.txt of ${origin} ${kind === 'blocked' ? 'is behind a bot challenge' : 'is unreachable'}: ${reason}`)
  }
}

async function load(origin: string): Promise<RobotsEntry> {
  const url = `${origin}/robots.txt`
  const fetchedAt = Date.now()
  try {
    await waitForTurn(url)
    const res = await fetch(url, { headers: { 'User-Agent': config.userAgent }, signal: AbortSignal.timeout(10_000) })
    if (res.headers.get('x-amzn-waf-action') || res.headers.get('cf-mitigated')) {
      return { robots: null, problem: { kind: 'blocked', message: `HTTP ${res.status} challenge` }, fetchedAt }
    }
    // RFC 9309: a missing robots.txt (4xx) allows everything; a server error must be treated as "disallow all"
    if (res.status >= 400 && res.status < 500) return { robots: robotsParser(url, ''), problem: null, fetchedAt }
    if (!res.ok) return { robots: null, problem: { kind: 'unreachable', message: `HTTP ${res.status}` }, fetchedAt }

    const robots = robotsParser(url, await res.text())
    const crawlDelay = robots.getCrawlDelay(config.userAgent)
    if (crawlDelay) setCrawlDelay(url, crawlDelay * 1000)
    return { robots, problem: null, fetchedAt }
  } catch (err) {
    return { robots: null, problem: { kind: 'unreachable', message: (err as Error).message }, fetchedAt }
  }
}

export async function getRobots(origin: string, { refresh = false } = {}) {
  const cached = cache.get(origin)
  if (cached && !refresh && Date.now() - (await cached).fetchedAt < TTL_MS) return cached
  const entry = load(origin)
  cache.set(origin, entry)
  return entry
}

/** Throws unless robots.txt allows our user agent to fetch `url`. */
export async function assertAllowed(url: string, options?: { refresh?: boolean }) {
  const { origin } = new URL(url)
  const { robots, problem } = await getRobots(origin, options)
  if (!robots) throw new RobotsUnavailableError(origin, problem?.kind ?? 'unreachable', problem?.message ?? 'unknown')
  if (robots.isDisallowed(url, config.userAgent)) throw new RobotsDisallowedError(url)
}

/** AI crawler tokens that `url`'s robots.txt shuts out while still allowing other crawlers. */
export async function aiCrawlersDisallowed(url: string) {
  const { robots } = await getRobots(new URL(url).origin)
  if (!robots || robots.isDisallowed(url, '*')) return []
  return AI_CRAWLERS.filter((token) => robots.isDisallowed(url, token))
}
