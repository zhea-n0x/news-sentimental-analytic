// Reading and writing the db-sample folder: a mongoexport backup with one canonical Extended JSON
// document per line in <collection>.json, plus manifest.json. Writes keep that format, so the folder
// stays restorable into MongoDB with db-sample/restore.ts.
import { appendFileSync, existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { EJSON, ObjectId, type Document } from 'bson'

export interface Manifest {
  database: string
  createdAt?: string
  collections: Record<string, { documents: number; indexes?: unknown[] }>
}

const fileOf = (dir: string, name: string) => join(dir, `${name}.json`)

/** Documents of one collection with plain JS values: numbers, Dates, and `_id` as a hex string. */
export function readCollection(dir: string, name: string): Document[] {
  const path = fileOf(dir, name)
  if (!existsSync(path)) return []
  return readFileSync(path, 'utf8')
    .split('\n')
    .filter((line) => line.trim())
    .map((line) => {
      const doc = EJSON.parse(line, { relaxed: true }) as Document
      if (doc._id instanceof ObjectId) doc._id = doc._id.toHexString()
      return doc
    })
}

/** One line of canonical Extended JSON, the format mongoexport writes. */
function toLine(doc: Document) {
  const { _id, ...rest } = doc
  const id = typeof _id === 'string' && ObjectId.isValid(_id) ? new ObjectId(_id) : (_id ?? new ObjectId())
  return EJSON.stringify({ _id: id, ...rest }, { relaxed: false })
}

export function appendDocuments(dir: string, name: string, docs: Document[]) {
  if (docs.length) appendFileSync(fileOf(dir, name), docs.map(toLine).join('\n') + '\n')
}

/** Replaces a whole collection file (write to a temp file, then rename, so a crash never leaves half a file). */
export function rewriteCollection(dir: string, name: string, docs: Document[]) {
  const path = fileOf(dir, name)
  writeFileSync(`${path}.tmp`, docs.map(toLine).join('\n') + (docs.length ? '\n' : ''))
  renameSync(`${path}.tmp`, path)
}

export function readManifest(dir: string): Manifest | null {
  const path = join(dir, 'manifest.json')
  return existsSync(path) ? (JSON.parse(readFileSync(path, 'utf8')) as Manifest) : null
}

/** Keeps manifest.json's document counts in step with the files after writes. */
export function updateManifestCounts(dir: string, counts: Record<string, number>) {
  const manifest = readManifest(dir)
  if (!manifest) return
  for (const [name, documents] of Object.entries(counts)) {
    if (manifest.collections[name]) manifest.collections[name].documents = documents
  }
  const path = join(dir, 'manifest.json')
  writeFileSync(`${path}.tmp`, JSON.stringify(manifest, null, 2) + '\n')
  renameSync(`${path}.tmp`, path)
}
