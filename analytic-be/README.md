# analytic-be

Hono + MongoDB service that scrapes Indonesian news portals every hour and stores distinct articles (with portal and category information) for sentiment analysis.

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
cp .env.example .env   # adjust MONGODB_URI etc. if needed
bun run dev            # http://localhost:3000
```

Requires a running MongoDB (default `mongodb://127.0.0.1:27017`, database `news_sentiment`).

## How scraping works

1. A cron job (`SCRAPE_CRON`, default every hour in `Asia/Jakarta`) runs every registered scraper in parallel (each portal limits its own request rate). One run also happens at startup unless `SCRAPE_ON_START=false`.
2. Each portal lists its articles:
   - Portals with a date index are read for today and the previous `SCRAPE_LOOKBACK_DAYS` days.
   - Portals marked `todayOnly` (feeds, sitemaps, or an index without a date filter) are read once; items older than the lookback window (`SCRAPE_LOOKBACK_DAYS + 1` days) are dropped.
   - Video, photo-gallery, infographic, quiz, community/user and sponsored items are filtered out where the listing shows them.
3. URLs already in `articles` (or remembered in `skipped_urls`) are skipped before any request; a unique index on `url` keeps the collection distinct.
4. New articles are fetched (multi-page stories in one request where the portal supports it: `?page=all`, `?showpage=all`, `?single=1`) and cleaned with the shared extractor in `src/lib/html.ts`: ads, "Baca juga"/"Lihat juga" links (block, inline or trailing), captions, editor initials and portal footers are removed, and the dateline ("Jakarta -") is kept with the first paragraph. Only the thumbnail (`og:image`) is stored, not the media.
5. Pages that turn out not to be text articles (e.g. a video page) throw `SkipArticle`; the URL is stored in `skipped_urls` for 14 days so it is not fetched again. Other failures are logged in `scrape_runs` and retried on the next run.

## Collections

- `portals`: `key`, `name`, `url`, `indexUrl`, `lastScrapedAt`
- `categories`: `portalKey`, `name`, `slug`, `parentSlug` (`null` for top level), deduplicated by slug
- `articles`: `url`, `portal { key, name, url }`, `title`, `description`, `content`, `category { name, slug }`, `subcategory`, `tags`, `author`, `editor`, `imageUrl`, `publishedAt`, `wordCount`, `scrapedAt`
- `scrape_runs`: `portalKey`, `trigger`, `status`, `listed`, `inserted`, `skipped`, `ignored`, `failed`, `errors`, `startedAt`, `finishedAt`
- `skipped_urls`: `url`, `portalKey`, `reason`, `createdAt` (expires after 14 days)

## API

| Method | Path                     | Description                                                                                   |
| ------ | ------------------------ | --------------------------------------------------------------------------------------------- |
| GET    | `/portals`               | Portals with their category tree and article counts                                           |
| GET    | `/portals/:key`          | One portal                                                                                    |
| GET    | `/portals/:key/articles` | Articles of one portal (same query options as `/articles`)                                    |
| GET    | `/articles`              | List (no content). Query: `portal` (key, or comma-separated keys), `category`, `subcategory` (slugs), `q`, `page`, `limit` |
| GET    | `/articles/:id`          | Full article including content                                                                |
| POST   | `/scrape/run?portal=key` | Start a scrape now (all portals if `portal` omitted); returns 202                             |
| GET    | `/scrape/runs`           | Recent scrape runs. Query: `portal`, `limit`                                                  |

## Adding a portal

Implement `PortalScraper` (`src/scrapers/types.ts`) in `src/scrapers/<portal>.ts` and add it to the list in `src/scrapers/index.ts`. Reuse `extractBlocks`, `metaReader`, `readJsonLd`, `parseFeed` and the date parsers from `src/lib/html.ts`.
