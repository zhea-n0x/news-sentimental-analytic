import { cnbcIndonesiaScraper } from './cnbc-indonesia'
import { cnnIndonesiaScraper } from './cnn-indonesia'
import { detikScraper } from './detik'
import { idnTimesScraper } from './idn-times'
import { kompasScraper } from './kompas'
import { kumparanScraper } from './kumparan'
import { liputan6Scraper } from './liputan6'
import { merdekaScraper } from './merdeka'
import { okezoneScraper } from './okezone'
import { sindonewsScraper } from './sindonews'
import { suaraScraper } from './suara'
import { tribunnewsScraper } from './tribunnews'
import type { PortalScraper } from './types'

// Register new portals here
export const scrapers: PortalScraper[] = [
  kompasScraper,
  cnnIndonesiaScraper,
  cnbcIndonesiaScraper,
  detikScraper,
  tribunnewsScraper,
  liputan6Scraper,
  okezoneScraper,
  sindonewsScraper,
  merdekaScraper,
  idnTimesScraper,
  suaraScraper,
  kumparanScraper,
]

export function getScraper(key: string) {
  return scrapers.find((scraper) => scraper.portal.key === key)
}
