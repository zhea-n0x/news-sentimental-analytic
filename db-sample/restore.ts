// Restores this backup into a MongoDB database.
// Run from a folder where the `mongodb` package is installed (e.g. analytic-be):
//   bun run <backup-dir>/restore.ts <backup-dir> [mongodb-uri] [database]
import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { BSON, MongoClient } from 'mongodb'

const [dir, uri = 'mongodb://127.0.0.1:27017', dbArg] = process.argv.slice(2)
if (!dir) throw new Error('Usage: bun run restore.ts <backup-dir> [mongodb-uri] [database]')
const manifest = JSON.parse(readFileSync(join(dir, 'manifest.json'), 'utf8'))
const client = new MongoClient(uri)
await client.connect()
const db = client.db(dbArg ?? manifest.database)

for (const [name, info] of Object.entries<any>(manifest.collections)) {
  if (await db.collection(name).estimatedDocumentCount()) {
    throw new Error(`${db.databaseName}.${name} is not empty; restore into an empty database or drop it first`)
  }
  const docs = readFileSync(join(dir, `${name}.json`), 'utf8')
    .split('\n')
    .filter(Boolean)
    .map((line) => BSON.EJSON.parse(line, { relaxed: false }))
  if (docs.length) await db.collection(name).insertMany(docs)
  for (const { key, name: indexName, v, ns, ...options } of info.indexes) {
    if (indexName !== '_id_') await db.collection(name).createIndex(key, { name: indexName, ...options })
  }
  console.log(`${name}: ${docs.length} documents, ${info.indexes.length} indexes`)
}
await client.close()
