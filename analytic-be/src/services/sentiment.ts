import { config } from '../config'
import { getArticle, recordSentimentFailure, saveSentiments } from '../db'
import { analyzeSentiment } from './gemma'

// After this many failed attempts an article is left unanalysed (until the next restart)
export const MAX_SENTIMENT_ATTEMPTS = 3

// Article ids waiting for analysis, most recently requested first
const queue: string[] = []
const queued = new Set<string>()
let inFlight = 0
let running = false
let analyzed = 0
let failed = 0
let lastError: string | null = null

export function sentimentStatus() {
  return {
    configured: Boolean(config.gemma.apiKey),
    model: config.gemma.model,
    pending: queue.length + inFlight,
    running,
    analyzed,
    failed,
    lastError,
  }
}

/**
 * Puts articles at the front of the queue, so the filter the user just picked is analysed first.
 * Returns how many were not already waiting.
 */
export function enqueue(ids: string[]) {
  if (!config.gemma.apiKey || !ids.length) return 0
  const fresh = ids.filter((id) => !queued.has(id))
  const requested = new Set(ids)
  const rest = queue.filter((id) => !requested.has(id))
  queue.length = 0
  queue.push(...ids, ...rest)
  for (const id of ids) queued.add(id)
  void work()
  return fresh.length
}

async function work() {
  if (running) return
  running = true
  try {
    while (queue.length) {
      const batch = queue.splice(0, config.gemma.batchSize)
      inFlight = batch.length
      try {
        await analyzeBatch(batch)
        lastError = null
      } catch (err) {
        lastError = err instanceof Error ? err.message : String(err)
        console.error('[sentiment]', lastError)
        failed += batch.length
        batch.forEach(recordSentimentFailure)
      } finally {
        for (const id of batch) queued.delete(id)
        inFlight = 0
      }
    }
  } finally {
    running = false
  }
}

async function analyzeBatch(ids: string[]) {
  const docs = ids.map(getArticle).filter((a) => a !== undefined && !a.sentiment)
  if (!docs.length) return

  const results = await analyzeSentiment(
    docs.map((d) => ({ id: d!._id, title: d!.title, description: d!.description, content: d!.content })),
  )
  const now = new Date()
  saveSentiments(
    [...results].map(([id, result]) => ({ id, sentiment: { ...result, model: config.gemma.model, analyzedAt: now } })),
  )
  for (const d of docs) if (!results.has(d!._id)) recordSentimentFailure(d!._id)

  analyzed += results.size
  failed += docs.length - results.size
  console.log(`[sentiment] analysed ${results.size}/${docs.length} (${queue.length} waiting)`)
}
