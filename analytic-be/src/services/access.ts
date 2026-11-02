import { portals, setPortalAccess } from '../db'
import { aiCrawlersDisallowed, assertAllowed, RobotsDisallowedError, RobotsUnavailableError } from '../lib/robots'
import type { PortalScraper } from '../scrapers/types'
import type { PortalAccess } from '../types'

export type AccessCheck = Omit<PortalAccess, 'since'>

/** Re-reads the portal's robots.txt and checks that its index may still be fetched. */
export async function checkPortalAccess({ portal }: PortalScraper): Promise<AccessCheck> {
  const base = { disallowedUrls: [] as string[], aiCrawlersDisallowed: [] as string[], checkedAt: new Date() }
  try {
    await assertAllowed(portal.indexUrl, { refresh: true })
  } catch (err) {
    if (err instanceof RobotsDisallowedError) {
      return { ...base, status: 'disallowed', reason: `robots.txt disallows the index ${err.url}`, disallowedUrls: [err.url] }
    }
    if (err instanceof RobotsUnavailableError) {
      return { ...base, status: err.kind === 'blocked' ? 'blocked' : 'unreachable', reason: err.message }
    }
    throw err
  }

  const ai = await Promise.all([portal.indexUrl, `${portal.url}/`].map((url) => aiCrawlersDisallowed(url)))
  return { ...base, status: 'ok', reason: null, aiCrawlersDisallowed: [...new Set(ai.flat())] }
}

/** Stores the portal's access status (keeping `since` while it is unchanged) and logs every change. */
export async function saveAccess(portalKey: string, access: AccessCheck) {
  const previous = portals.get(portalKey)?.access
  const changed = previous?.status !== access.status
  await setPortalAccess(portalKey, { ...access, since: changed || !previous ? access.checkedAt : previous.since })
  if (changed && (previous || access.status !== 'ok')) {
    console.warn(
      `[access:${portalKey}] ${previous?.status ?? 'unknown'} -> ${access.status}${access.reason ? `: ${access.reason}` : ''}`,
    )
  }
}
