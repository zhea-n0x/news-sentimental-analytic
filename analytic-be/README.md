# analytic-be

Hono service that serves Indonesian news articles from the local `db-sample` folder, analyses their sentiment with Gemma and serves the results to `analytic-fe`. It does not use MongoDB. The scraper for 12 portals is included but off by default.

## Supported portals

| Key             | Portal        | Listing source                                                      | Category from                         |
| --------------- | ------------- | ------------------------------------------------------------------- | ------------------------------------- |
| `kompas`        | Kompas.com    | `indeks.kompas.com/headline?site=all&date=YYYY-MM-DD` (by date)    | `content_category` meta tags          |
| `cnn-indonesia` | CNN Indonesia | `cnnindonesia.com/indeks/2?date=YYYY/MM/DD&page=N` (by date)       | breadcrumb                            |
| `cnbc-indonesia`| CNBC Indonesia| `cnbcindonesia.com/indeks?date=YYYY/MM/DD&page=N` (by date)        | JSON-LD breadcrumb (no subcategories) |
| `detik`         | detikcom      | official RSS of 10 channels (`{news,finance,hot,...}.detik.com/rss`)| breadcrumb, e.g. `detikFinance / Moneter` |
| `tribunnews`    | Tribunnews    | `tribunnews.com/index-news?page=N` (latest ~200 only)              | breadcrumb                            |
| `liputan6`      | Liputan6.com  | `liputan6.com/{channel}/indeks/YYYY/MM/DD` for 16 channels (by date)| breadcrumb                            |
| `okezone`       | Okezone       | `index.okezone.com/bydate/index/YYYY/MM/DD/{offset}/` (by date)    | `article:section` / `section2` meta   |
| `sindonews`     | SINDOnews     | `sindonews.com/indeks/0/{offset}?t=YYYY-MM-DD` (by date)           | dataLayer channel + breadcrumb        |
| `merdeka`       | Merdeka.com   | news sitemaps of 13 channels (`merdeka.com/{channel}/sitemap.xml`) | analytics channel slugs               |
| `idn-times`     | IDN Times     | `idntimes.com/index?date=YYYY-MM-DD&page=N` (by date)              | `content_category` meta tags          |
| `suara`         | Suara.com     | `suara.com/indeks?page=N` (latest, paged back to the cutoff)       | breadcrumb                            |
| `kumparan`      | kumparan      | news sitemaps of 11 channels (`sitemap_channel_{channel}.xml`)     | JSON-LD breadcrumb (no subcategories) |

Note that `robots.txt` on **kompas.com** disallows AI crawlers (ClaudeBot, anthropic-ai, GPTBot, …) and **tribunnews.com** disallows GPTBot/CCBot. Check whether your use of these sources is permitted.

## Setup

```sh
bun install
cp .env.example .env   # set GEMINI_API_KEY
bun run dev            # http://localhost:4000
```

### Data: db-sample

The data comes from `../db-sample` (`DB_SAMPLE_DIR`), a `mongoexport` backup with one Extended JSON document per line per collection. It is read into memory at startup; there is no database server or MongoDB connection.

- Analysis periods count back from the newest article in the folder, so the snapshot keeps showing its last days instead of going empty over time.
- Gemma's results are appended to `db-sample/sentiments.jsonl` (`SENTIMENT_FILE`), one JSON line per analysed article, and loaded again on the next start. The backup's own files are not changed by analysis.
- If the folder cannot be read, the server still starts and every data route answers `503` with the reason.

### Scraping (optional)

Off unless `SCRAPE_INTO_DB_SAMPLE=true` (the old `SCRAPE_ENABLED` setting is ignored). When on, the scraper runs hourly (and once at startup unless `SCRAPE_ON_START=false`) and writes into `db-sample` itself: new articles and skipped URLs are appended to `articles.json` / `skipped_urls.json`, `portals.json` and `categories.json` are rewritten, runs are appended to `scrape_runs.json`, and `manifest.json` counts are updated. The files stay in `mongoexport` format, so `db-sample/restore.ts` can still load them into MongoDB.

### Sentiment analysis

Articles are classified as positive, neutral or negative by Gemma (`GEMMA_MODEL`, default `gemma-4-26b-a4b-it`) through the Gemini API; create a key in [Google AI Studio](https://aistudio.google.com/apikey) and set `GEMINI_API_KEY`.

Analysis runs on demand: when the frontend asks for a filter (`POST /analysis`), the newest articles in that selection without a sentiment are queued (`ANALYSIS_QUEUE_LIMIT`, default 100). A single worker sends them in batches of `GEMMA_BATCH_SIZE` (title, summary and the first `GEMMA_EXCERPT_CHARS` characters of text), spaced to `GEMMA_RPM` requests per minute, retrying rate-limit and server errors. Results (`label`, `score`, `reason`, `model`, `analyzedAt`) are saved to `sentiments.jsonl`, so each article is analysed once. Articles the model fails on are retried at most 3 times per run of the server.

### Unified categories

Each portal names its sections differently, so `src/taxonomy.ts` maps every `portal:category/subcategory` onto one tree of 13 categories (Nasional, Internasional, Regional, Ekonomi & Bisnis, Teknologi & Sains, Hiburan, Olahraga, Gaya Hidup, Otomotif, Edukasi, Religi, Cek Fakta, Opini & Riset) with sub-categories, e.g. detik `detikFinance / Bursa dan Valas`, Liputan6 `Saham` and CNBC `Market` all become `ekonomi/pasar-modal`. Anything no rule matches lands in `lainnya`; add a rule when a portal introduces a new section.

## How scraping works

1. A cron job (`SCRAPE_CRON`, default every hour in `Asia/Jakarta`) runs every registered scraper in parallel (each portal limits its own request rate). One run also happens at startup unless `SCRAPE_ON_START=false`.
2. Each portal lists its articles:
   - Portals with a date index are read for today and the previous `SCRAPE_LOOKBACK_DAYS` days.
   - Portals marked `todayOnly` (feeds, sitemaps, or an index without a date filter) are read once; items older than the lookback window (`SCRAPE_LOOKBACK_DAYS + 1` days) are dropped.
   - Video, photo-gallery, infographic, quiz, community/user and sponsored items are filtered out where the listing shows them.
3. URLs already in `articles` (or remembered in `skipped_urls`) are skipped before any request; a unique index on `url` keeps the collection distinct.
4. New articles are fetched (multi-page stories in one request where the portal supports it: `?page=all`, `?showpage=all`, `?single=1`) and cleaned with the shared extractor in `src/lib/html.ts`: ads, "Baca juga"/"Lihat juga" links (block, inline or trailing), captions, editor initials and portal footers are removed, and the dateline ("Jakarta -") is kept with the first paragraph. Only the thumbnail (`og:image`) is stored, not the media.
5. Pages that turn out not to be text articles (e.g. a video page) throw `SkipArticle`; the URL is stored in `skipped_urls` for 14 days so it is not fetched again. Other failures are logged in `scrape_runs` and retried on the next run.

## Data files (db-sample)

- `articles.json`: `url`, `portal { key, name, url }`, `title`, `description`, `content`, `category { name, slug }`, `subcategory`, `tags`, `author`, `editor`, `imageUrl`, `publishedAt`, `wordCount`, `scrapedAt`
- `portals.json`: `key`, `name`, `url`, `indexUrl`, `lastScrapedAt`
- `categories.json`: `portalKey`, `name`, `slug`, `parentSlug` (`null` for top level)
- `scrape_runs.json`: `portalKey`, `trigger`, `status`, `listed`, `inserted`, `skipped`, `ignored`, `failed`, `errors`, `startedAt`, `finishedAt`
- `skipped_urls.json`: `url`, `portalKey`, `reason`, `createdAt`
- `sentiments.jsonl` (written by this service): `articleId`, `label`, `score`, `reason`, `model`, `analyzedAt`

## API

| Method | Path                     | Description                                                                                   |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------- |
| GET    | `/portals`               | Portals with their category tree and article counts                                           |
| GET    | `/portals/:key`          | One portal                                                                                    |
| GET    | `/portals/:key/articles` | Articles of one portal (same query options as `/articles`)                                    |
| GET    | `/articles`              | List (no content). Query: `portal` (key, or comma-separated keys), `category`, `subcategory` (slugs), `q`, `page`, `limit` |
| GET    | `/articles/:id`          | Full article including content                                                                |
| POST   | `/scrape/run?portal=key` | Start a scrape now (all portals if `portal` omitted); returns 202. `409` while `SCRAPE_INTO_DB_SAMPLE` is off |
| GET    | `/scrape/runs`           | Recent scrape runs. Query: `portal`, `limit`                                                  |
| GET    | `/analysis/categories`   | Unified category tree with article counts and portals. Query: `days` (1, 3, 7, 30)            |
| POST   | `/analysis`              | Dashboard for a filter (see below)                                                            |
| GET    | `/analysis/status`       | Analysis queue progress                                                                       |

### `POST /analysis`

Body: `{ "categories": ["olahraga", "ekonomi/energi"], "days": 7, "analyze": "auto" }`. `categories` are unified ids (a root selects all its sub-categories; empty means everything). `analyze` is `auto` (queue the newest unanalysed articles), `all` (up to 1000) or `none` (read only).

Returns totals, a breakdown (by root category, by sub-category when one root is selected, or by portal when one sub-category is selected), per-portal counts, a sentiment trend (2 h to 1 day buckets in WIB, overall plus the 3 largest portals), 12 recent articles spread across portals, `analysis { pending, queued, remaining, configured, lastError }` and `dataset { name, articles, exportedAt, latestArticleAt }`. Only analysed articles count towards sentiment; poll with `analyze: "none"` while `pending` is above zero.

## Adding a portal

Implement `PortalScraper` (`src/scrapers/types.ts`) in `src/scrapers/<portal>.ts` and add it to the list in `src/scrapers/index.ts`. Reuse `extractBlocks`, `metaReader`, `readJsonLd`, `parseFeed` and the date parsers from `src/lib/html.ts`.
