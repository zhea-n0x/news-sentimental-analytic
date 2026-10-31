import { Cron } from 'croner'
import { config } from '../config'
import { scrapeAllPortals } from '../services/scrape'

export function startScheduler() {
  const job = new Cron(
    config.scrapeCron,
    // protect: skip a tick if the previous run is still going
    { name: 'scrape-portals', timezone: config.timezone, protect: true },
    async () => {
      try {
        await scrapeAllPortals('cron')
      } catch (err) {
        console.error('[scheduler] scrape failed', err)
      }
    },
  )
  console.log(`[scheduler] "${config.scrapeCron}" (${config.timezone}), next run ${job.nextRun()?.toISOString()}`)
  return job
}
