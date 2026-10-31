# news_sentiment backup

Backup of the local MongoDB database `news_sentiment` (MongoDB 8.3) taken 2026-10-31 14:38 WIB.

| File | Contents |
| --- | --- |
| `articles.json` | 3647 scraped articles |
| `categories.json` | 470 portal categories / subcategories |
| `portals.json` | 12 news portals |
| `scrape_runs.json` | 242 scrape run logs |
| `skipped_urls.json` | 60 non-article URLs remembered by the scraper |
| `manifest.json` | document counts and index definitions per collection |
| `restore.ts` | restore script (documents + indexes) |

Each `.json` file has one document per line in canonical MongoDB Extended JSON (the `mongoexport` format), so ObjectIds and dates keep their types.

## Restore

With Bun, from a folder that has the `mongodb` package installed (e.g. `analytic-be`):

```sh
bun run <backup-dir>/restore.ts <backup-dir>                                   # into news_sentiment on localhost
bun run <backup-dir>/restore.ts <backup-dir> mongodb://host:27017 other_db_name # elsewhere
```

Or with MongoDB Database Tools, one collection at a time (indexes are recreated by the app on startup):

```sh
mongoimport --uri mongodb://127.0.0.1:27017 --db news_sentiment --collection articles --file articles.json
```

For other purposes the files can be read directly: every line is a JSON document.
