// The analysis queue: article ids in a Redis list used as a stack (LIFO), so the newest articles are analysed first.
//
// - The head of the list is the top of the stack. The scraper pushes each new article there once it is saved.
// - The worker moves a batch from the head to a processing list (LMOVE, one id at a time, so no id is ever in
//   neither list). The processing list is cleared once the batch is saved; ids left in it by a restart are moved
//   back to the head at the next start.
// - One worker per queue key: run a second backend against the same Redis with its own ANALYSIS_QUEUE_KEY.
import { RedisClient } from 'bun'
import { config } from '../config'

const QUEUE = config.analysisQueueKey
const PROCESSING = `${QUEUE}:processing`
// Ids per RPUSH when filling the queue
const CHUNK = 1000

// Reconnecting is left to the worker, and commands fail at once while disconnected instead of piling up
const client = new RedisClient(config.redisUrl, {
  connectionTimeout: config.redisConnectTimeoutMs,
  autoReconnect: false,
  enableOfflineQueue: false,
})

// Credentials in the URL are not logged
export const redisLabel = config.redisUrl.replace(/\/\/[^@/]*@/, '//<credentials>@')

export const isConnected = () => client.connected

export async function connect() {
  if (!client.connected) await client.connect()
}

/** Ids waiting, or null while Redis cannot be reached. */
export async function length(): Promise<number | null> {
  if (!client.connected) return null
  return client.send('LLEN', [QUEUE]).catch(() => null)
}

/** Puts an id on top of the stack. */
export async function push(id: string) {
  await client.send('LPUSH', [QUEUE, id])
}

/** Moves ids a restart left in the processing list back on top, in the order they were taken. Returns how many. */
export async function recover() {
  let moved = 0
  while (await client.send('LMOVE', [PROCESSING, QUEUE, 'RIGHT', 'LEFT'])) moved++
  return moved
}

/** Fills an empty queue with `ids` (newest first, so the newest ends up on top). Returns how many were added. */
export async function fillIfEmpty(ids: string[]) {
  if ((await client.send('LLEN', [QUEUE])) > 0) return 0
  // RPUSH keeps the order: the first id ends up at the head
  for (let i = 0; i < ids.length; i += CHUNK) await client.send('RPUSH', [QUEUE, ...ids.slice(i, i + CHUNK)])
  return ids.length
}

/** Takes up to `count` ids from the top into the processing list. */
export async function take(count: number) {
  const ids: string[] = []
  while (ids.length < count) {
    const id: string | null = await client.send('LMOVE', [QUEUE, PROCESSING, 'LEFT', 'RIGHT'])
    if (!id) break
    ids.push(id)
  }
  return ids
}

/** Settles the batch in the processing list: `retry` goes to the bottom of the queue, the rest is dropped. */
export async function finish(retry: string[]) {
  if (retry.length) await client.send('RPUSH', [QUEUE, ...retry])
  await client.send('DEL', [PROCESSING])
}
