import { config } from '../config'

// Next moment each site may be requested again
const nextSlot = new Map<string, number>()
// Crawl-delay (ms) announced in a site's robots.txt
const crawlDelays = new Map<string, number>()

/** Groups the subdomains of one site under one key: news.detik.com -> detik.com, www.viva.co.id -> viva.co.id */
export function siteOf(url: string) {
  const parts = new URL(url).hostname.split('.')
  const secondLevel = parts.at(-2) ?? ''
  const countryTld = (parts.at(-1) ?? '').length === 2
  const keep = parts.length > 2 && countryTld && /^(co|ac|or|go|my|web|sch|net)$/.test(secondLevel) ? 3 : 2
  return parts.slice(-keep).join('.')
}

export function setCrawlDelay(url: string, delayMs: number) {
  const site = siteOf(url)
  crawlDelays.set(site, Math.max(delayMs, crawlDelays.get(site) ?? 0))
}

/**
 * Waits until `url`'s site may be requested again. Requests to one site are spaced out by the configured
 * interval plus random jitter, whatever the caller's concurrency; other sites are not affected.
 */
export async function waitForTurn(url: string) {
  const site = siteOf(url)
  const gap = Math.max(config.requestIntervalMs, crawlDelays.get(site) ?? 0) + Math.random() * config.requestJitterMs
  const now = Date.now()
  const slot = Math.max(now, nextSlot.get(site) ?? 0)
  nextSlot.set(site, slot + gap)
  if (slot > now) await Bun.sleep(slot - now)
}
