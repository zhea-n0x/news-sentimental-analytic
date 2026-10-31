export function cleanText(value: string | null | undefined) {
  return (value ?? '').replace(/\s+/g, ' ').trim()
}

export function slugify(value: string) {
  return cleanText(value)
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

/** Normalized URL used as the unique key for an article: https, no query string or hash. */
export function canonicalUrl(value: string, base?: string) {
  const url = new URL(value, base)
  url.protocol = 'https:'
  url.search = ''
  url.hash = ''
  return url.toString()
}

/** YYYY-MM-DD for today and the previous `lookbackDays` days, in the given timezone. Oldest first. */
export function recentDates(lookbackDays: number, timeZone: string, now = new Date()) {
  const format = new Intl.DateTimeFormat('en-CA', { timeZone, year: 'numeric', month: '2-digit', day: '2-digit' })
  const dates = new Set<string>()
  for (let i = lookbackDays; i >= 0; i--) {
    dates.add(format.format(new Date(now.getTime() - i * 86_400_000)))
  }
  return [...dates]
}

/** Runs `fn` over `items` with at most `limit` calls in flight. */
export async function mapLimit<T, R>(items: T[], limit: number, fn: (item: T) => Promise<R>) {
  const results: R[] = new Array(items.length)
  let next = 0
  const worker = async () => {
    while (next < items.length) {
      const index = next++
      results[index] = await fn(items[index]!)
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  return results
}

/** Runs `fn` for each channel in turn; a failing channel is logged and skipped unless every channel fails. */
export async function forEachChannel(channels: string[], fn: (channel: string) => Promise<void>) {
  const errors: unknown[] = []
  for (const channel of channels) {
    try {
      await fn(channel)
    } catch (err) {
      errors.push(err)
      console.warn(`[scrape] channel "${channel}" failed: ${err instanceof Error ? err.message : String(err)}`)
    }
  }
  if (errors.length && errors.length === channels.length) throw errors[0]
}
