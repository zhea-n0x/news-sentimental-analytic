import { config } from '../config'
import { articles, getArticle, recordSentimentFailure, saveSentiments, withContent, type CachedArticle } from '../db'
import { analyzeSentiment } from './gemma'
import * as queue from './queue'

// After this many failed attempts an article is left unanalysed (until the next restart)
export const MAX_SENTIMENT_ATTEMPTS = 3

// Pause after a failed batch or while Redis is unreachable, doubling up to the maximum; a good batch resets it
const MIN_BACKOFF_MS = 5_000
const MAX_BACKOFF_MS = 300_000
// How often an empty queue is looked at again (a newly queued article also wakes the worker at once)
const IDLE_MS = 10_000

let started = false
// Whether the queue has been recovered and filled since Redis (re)connected
let prepared = false
let inFlight = 0
let analyzed = 0
let failed = 0
let lastError: string | null = null
let wake: (() => void) | null = null

const message = (err: unknown) => (err instanceof Error ? err.message : String(err))
const fmt = (n: number) => n.toLocaleString('en-US')
const needsAnalysis = (a: CachedArticle | undefined) =>
  a !== undefined && !a.sentiment && (a.sentimentAttempts ?? 0) < MAX_SENTIMENT_ATTEMPTS

/** Waits `ms`, or until wake() is called. */
const idle = (ms: number) =>
  new Promise<void>((resolve) => {
    const timer = setTimeout(done, ms)
    function done() {
      clearTimeout(timer)
      wake = null
      resolve()
    }
    wake = done
  })

function articleCounts() {
  let done = 0
  let gaveUp = 0
  for (const a of articles) {
    if (a.sentiment) done++
    else if ((a.sentimentAttempts ?? 0) >= MAX_SENTIMENT_ATTEMPTS) gaveUp++
  }
  return { total: articles.length, analyzed: done, unanalyzed: articles.length - done, gaveUp }
}

export async function sentimentStatus() {
  return {
    configured: config.gemma.configured,
    provider: config.gemma.provider,
    model: config.gemma.model,
    // A batch is with Gemma right now
    running: inFlight > 0,
    // Ids waiting in Redis plus the batch in progress (null while Redis cannot be reached)
    pending: ((await queue.length()) ?? 0) + inFlight,
    // Every article loaded, analysed or not; gaveUp failed MAX_SENTIMENT_ATTEMPTS times
    articles: articleCounts(),
    // Since the server started
    session: { analyzed, failed },
    redis: { connected: queue.isConnected(), url: queue.redisLabel },
    lastError,
  }
}

/** Connects to Redis, prepares the queue and starts the worker. Waits for the first connection attempt only. */
export async function startSentimentWorker() {
  if (started || !config.gemma.configured) return
  started = true
  await prepare().catch(() => {})
  void work()
}

/**
 * Puts a newly saved article on top of the queue, so it is analysed next. Never throws: an article that
 * cannot be queued is logged and picked up the next time the queue is filled.
 */
export async function enqueueArticle(id: string) {
  // Until the queue is prepared, filling it covers this article too
  if (!prepared) return
  try {
    await queue.push(id)
    wake?.()
  } catch (err) {
    console.warn(`[sentiment] could not queue article ${id}: ${message(err)}`)
  }
}

/** Moves an interrupted batch back on top and, when the queue is empty, fills it with every unanalysed article. */
async function prepare() {
  try {
    await queue.connect()
    const recovered = await queue.recover()
    const unanalysed = articles
      .filter(needsAnalysis)
      .sort((a, b) => (b.publishedAt?.getTime() ?? 0) - (a.publishedAt?.getTime() ?? 0))
      .map((a) => a._id)
    const filled = await queue.fillIfEmpty(unanalysed)
    prepared = true
    if (lastError?.startsWith('Redis')) lastError = null
    const pending = await queue.length()
    console.log(
      `[sentiment] queue ready at ${queue.redisLabel}: ${pending} waiting` +
        (filled ? `, filled with ${filled} unanalysed articles` : '') +
        (recovered ? `, ${recovered} from an interrupted batch` : ''),
    )
  } catch (err) {
    lastError = `Redis at ${queue.redisLabel}: ${message(err)}`
    console.warn(`[sentiment] ${lastError}; retrying in the background`)
    throw err
  }
}

async function work() {
  let backoff = 0
  const pause = () => {
    backoff = Math.min(MAX_BACKOFF_MS, backoff ? backoff * 2 : MIN_BACKOFF_MS)
    return Bun.sleep(backoff)
  }

  for (;;) {
    try {
      if (!prepared) await prepare()
      const batch = await queue.take(config.gemma.batchSize)
      if (!batch.length) {
        await idle(IDLE_MS)
        continue
      }
      if (await analyzeBatch(batch)) backoff = 0
      else await pause()
    } catch {
      // Redis: prepare() logged it, or the connection dropped mid-batch (the batch is recovered on reconnect)
      if (prepared) {
        prepared = false
        lastError = `Redis at ${queue.redisLabel}: connection lost`
        console.warn(`[sentiment] ${lastError}`)
      }
      await pause()
    }
  }
}

/** Analyses one batch and settles it in the queue. Returns false when the request to Gemma failed. */
async function analyzeBatch(ids: string[]) {
  const pending = ids.filter((id) => needsAnalysis(getArticle(id)))
  let missed: string[] = []
  let ok = true
  inFlight = pending.length
  try {
    if (pending.length) missed = await analyze(pending)
    lastError = null
  } catch (err) {
    lastError = message(err)
    console.error('[sentiment]', lastError)
    missed = pending
    ok = false
  } finally {
    inFlight = 0
  }
  missed.forEach(recordSentimentFailure)
  failed += missed.length
  // Failed articles get another try after everything else, up to MAX_SENTIMENT_ATTEMPTS
  await queue.finish(missed.filter((id) => needsAnalysis(getArticle(id))))
  return ok
}

/** Sends articles to Gemma and saves the results. Returns the ids the model gave no result for. */
async function analyze(ids: string[]) {
  const docs = await withContent(ids)
  const started = performance.now()
  const { results, promptChars } = await analyzeSentiment(
    docs.map((d) => ({ id: d._id, title: d.title, description: d.description, content: d.content })),
  )
  const seconds = ((performance.now() - started) / 1000).toFixed(1)
  const now = new Date()
  await saveSentiments(
    [...results].map(([id, result]) => ({ id, sentiment: { ...result, model: config.gemma.model, analyzedAt: now } })),
  )
  analyzed += results.size

  // Text is the article as stored; the prompt is what was sent, with long texts trimmed to fit the context
  const textChars = docs.reduce((sum, d) => sum + d.content.length, 0)
  console.log(
    `[sentiment] analysed ${results.size}/${docs.length} in ${seconds}s: ` +
      `prompt ${fmt(promptChars)} chars, article text ${fmt(textChars)} chars (${await queue.length()} waiting)`,
  )
  // for (const d of docs) {
  //   const result = results.get(d._id)
  //   const verdict = result ? `${result.label} ${result.score.toFixed(2)}` : 'no result'
  //   console.log(`[sentiment]   ${d._id} ${verdict.padEnd(14)} ${fmt(d.content.length).padStart(7)} chars  ${d.title.slice(0, 80)}`)
  // }
  return docs.filter((d) => !results.has(d._id)).map((d) => d._id)
}
