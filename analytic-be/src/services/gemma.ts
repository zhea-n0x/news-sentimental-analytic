import { config } from '../config'
import { cleanText } from '../lib/utils'
import type { SentimentLabel } from '../types'

const LABELS: SentimentLabel[] = ['positive', 'neutral', 'negative']
const MAX_ATTEMPTS = 4

export interface SentimentInput {
  id: string
  title: string
  description: string | null
  content: string
}

export interface SentimentOutput {
  label: SentimentLabel
  score: number
  reason: string
}

export class GemmaError extends Error {
  constructor(
    message: string,
    readonly status?: number,
  ) {
    super(message)
  }
}

// Conservative estimate for Indonesian text, so the budget errs on the side of fitting
const CHARS_PER_TOKEN = 3
// Tokens kept free in the context for the instructions, titles, summaries and the reply
const RESERVED_TOKENS = 2048

/** Characters of article text one request can carry: what fits Ollama's context window, unlimited for the API. */
function textBudget() {
  const { provider, ollamaNumCtx } = config.gemma
  return provider === 'ollama' ? Math.max(0, ollamaNumCtx - RESERVED_TOKENS) * CHARS_PER_TOKEN : Infinity
}

/** Splits the budget across articles: short ones are sent whole, longer ones share what is left equally. */
function excerptLimits(lengths: number[], excerptChars: number, budget: number) {
  const limits = lengths.map(() => 0)
  const shortestFirst = lengths.map((_, i) => i).sort((a, b) => lengths[a]! - lengths[b]!)
  let remaining = budget
  shortestFirst.forEach((i, k) => {
    limits[i] = Math.min(lengths[i]!, excerptChars, Math.floor(remaining / (lengths.length - k)))
    remaining -= limits[i]!
  })
  return limits
}

export function buildPrompt(items: SentimentInput[], excerptChars = config.gemma.excerptChars, budget = textBudget()) {
  const texts = items.map((item) => cleanText(item.content))
  const limits = excerptLimits(
    texts.map((t) => t.length),
    excerptChars,
    budget,
  )
  const articles = items
    .map((item, i) => {
      const excerpt = texts[i]!.slice(0, limits[i])
      return [
        `### a${i + 1}`,
        `Title: ${cleanText(item.title)}`,
        item.description ? `Summary: ${cleanText(item.description)}` : null,
        excerpt ? `Text: ${excerpt}` : null,
      ]
        .filter(Boolean)
        .join('\n')
    })
    .join('\n\n')

  return `You are a sentiment analyst for Indonesian news. For each article below, judge the overall sentiment of the news it reports: is it good news, bad news, or neither, for the people, organisations or public it is about?

- "positive": achievements, growth, recovery, help, agreements, good outcomes.
- "negative": crime, disasters, accidents, conflict, losses, scandals, harm, bad outcomes.
- "neutral": factual announcements, schedules, explainers, mixed or no clear tone.

Answer with ONLY a JSON array (no markdown, no other text), one object per article in the same order:
[{"id": "a1", "label": "positive" | "neutral" | "negative", "score": number from -1 (very negative) to 1 (very positive), "reason": "at most 15 words in English"}]

Articles:

${articles}`
}

/** Extracts the per-article results from the model's reply. Unknown or malformed entries are dropped. */
export function parseReply(text: string, count: number): Map<number, SentimentOutput> {
  const results = new Map<number, SentimentOutput>()
  const start = text.indexOf('[')
  const end = text.lastIndexOf(']')
  if (start < 0 || end <= start) return results

  let parsed: unknown
  try {
    parsed = JSON.parse(text.slice(start, end + 1))
  } catch {
    return results
  }
  if (!Array.isArray(parsed)) return results

  parsed.forEach((entry, position) => {
    if (!entry || typeof entry !== 'object') return
    const { id, label, score, reason } = entry as Record<string, unknown>
    const index = typeof id === 'string' && /^a\d+$/.test(id) ? Number(id.slice(1)) - 1 : position
    const normalized = typeof label === 'string' ? label.trim().toLowerCase() : ''
    if (index < 0 || index >= count || !LABELS.includes(normalized as SentimentLabel)) return
    const numeric = Number(score)
    const fallback = normalized === 'positive' ? 0.5 : normalized === 'negative' ? -0.5 : 0
    results.set(index, {
      label: normalized as SentimentLabel,
      score: Number.isFinite(numeric) ? Math.max(-1, Math.min(1, numeric)) : fallback,
      reason: typeof reason === 'string' ? cleanText(reason).slice(0, 200) : '',
    })
  })
  return results
}

// Spaces requests out to stay within GEMMA_RPM
let nextSlot = 0
async function waitForSlot() {
  const interval = 60_000 / config.gemma.requestsPerMinute
  const now = Date.now()
  const at = Math.max(now, nextSlot)
  nextSlot = at + interval
  if (at > now) await Bun.sleep(at - now)
}

/** Seconds the API asks us to wait, from a 429 body's RetryInfo ("retryDelay": "23s"). */
function retryDelayMs(body: string) {
  const match = body.match(/"retryDelay"\s*:\s*"(\d+(?:\.\d+)?)s"/)
  return match ? Number(match[1]) * 1000 : null
}

// Gemma 4 thinks before answering unless told not to; turned off if the API rejects the setting
let sendThinkingConfig = true

/** One reply from the local Ollama server (no rate limit; a CPU-only machine can take minutes per batch). */
async function generateOllama(prompt: string): Promise<string> {
  const { ollamaUrl, ollamaNumCtx, model } = config.gemma

  for (let attempt = 1; ; attempt++) {
    const res = await fetch(`${ollamaUrl}/api/chat`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        model,
        messages: [{ role: 'user', content: prompt }],
        stream: false,
        think: false,
        options: { temperature: 0, num_ctx: ollamaNumCtx },
      }),
      signal: AbortSignal.timeout(600_000),
    }).catch((err: unknown) => {
      if (attempt >= MAX_ATTEMPTS) {
        throw new GemmaError(`Ollama request to ${ollamaUrl} failed (is \`ollama serve\` running?): ${String(err)}`)
      }
      return null
    })

    if (res?.ok) {
      const data = (await res.json()) as { message?: { content?: string }; prompt_eval_count?: number }
      // Ollama silently cuts prompts longer than the context window, which can drop the instructions
      if ((data.prompt_eval_count ?? 0) >= ollamaNumCtx) {
        console.warn(`[sentiment] prompt filled the ${ollamaNumCtx}-token context and was cut; raise OLLAMA_NUM_CTX`)
      }
      return data.message?.content ?? ''
    }

    const body = res ? await res.text() : ''
    // 404 means the model is not pulled; retrying will not help
    const retryable = !res || res.status >= 500
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new GemmaError(`Ollama ${res?.status ?? 'network error'}: ${body.slice(0, 300)}`, res?.status)
    }
    await Bun.sleep(2 ** attempt * 1000)
  }
}

async function generate(prompt: string): Promise<string> {
  if (config.gemma.provider === 'ollama') return generateOllama(prompt)
  const { apiKey, model } = config.gemma
  if (!apiKey) throw new GemmaError('GEMINI_API_KEY is not set')

  for (let attempt = 1; ; attempt++) {
    await waitForSlot()
    const res = await fetch(`${config.gemma.apiUrl}/models/${model}:generateContent`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-goog-api-key': apiKey },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0,
          ...(sendThinkingConfig ? { thinkingConfig: { thinkingLevel: 'minimal' } } : {}),
        },
      }),
      signal: AbortSignal.timeout(120_000),
    }).catch((err: unknown) => {
      if (attempt >= MAX_ATTEMPTS) throw new GemmaError(`Gemma request failed: ${String(err)}`)
      return null
    })

    if (res?.ok) {
      const data = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string; thought?: boolean }[] } }[]
      }
      const parts = data.candidates?.[0]?.content?.parts ?? []
      return parts
        .filter((p) => !p.thought)
        .map((p) => p.text ?? '')
        .join('')
    }

    const body = res ? await res.text() : ''
    if (res?.status === 400 && sendThinkingConfig && /thinking/i.test(body)) {
      sendThinkingConfig = false
      continue
    }
    const retryable = !res || res.status === 429 || res.status >= 500
    if (!retryable || attempt >= MAX_ATTEMPTS) {
      throw new GemmaError(`Gemma API ${res?.status ?? 'network error'}: ${body.slice(0, 300)}`, res?.status)
    }
    await Bun.sleep(retryDelayMs(body) ?? 2 ** attempt * 2000)
  }
}

/** Sentiment for each article, keyed by its id. Articles the model skipped are missing. */
export async function analyzeSentiment(items: SentimentInput[]): Promise<Map<string, SentimentOutput>> {
  const reply = await generate(buildPrompt(items))
  const byIndex = parseReply(reply, items.length)
  return new Map([...byIndex].map(([index, result]) => [items[index]!.id, result]))
}
