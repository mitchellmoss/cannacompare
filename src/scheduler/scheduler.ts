import { main as runScraper } from "../scraper/main_scraper.ts";

interface LastRunRecord {
  lastRunTimestamp: number;
}

const STORAGE_KEY = "dutchie_scraper_last_run";
const TWENTY_FOUR_HOURS_MS = 24 * 60 * 60 * 1000;

/**
 * Get the last run time from persistent storage
 * This uses localStorage-like API that works in Deno
 */
async function getLastRunTime(): Promise<LastRunRecord | null> {
  try {
    const kv = await Deno.openKv();
    const lastRunEntry = await kv.get([STORAGE_KEY]);
    await kv.close();
    
    if (lastRunEntry.value) {
      return lastRunEntry.value as LastRunRecord;
    }
    return null;
  } catch (error) {
    console.error("Failed to get last run time:", error);
    return null;
  }
}

/**
 * Save the current timestamp as the last run time
 */
async function saveLastRunTime(): Promise<void> {
  try {
    const kv = await Deno.openKv();
    await kv.set([STORAGE_KEY], { lastRunTimestamp: Date.now() });
    await kv.close();
  } catch (error) {
    console.error("Failed to save last run time:", error);
  }
}

/**
 * Check if it's time to run the scraper again (once per day)
 */
async function shouldRunScraper(): Promise<boolean> {
  const lastRun = await getLastRunTime();
  if (!lastRun) {
    return true; // First run
  }
  
  const now = Date.now();
  const timeSinceLastRun = now - lastRun.lastRunTimestamp;
  
  return timeSinceLastRun >= TWENTY_FOUR_HOURS_MS;
}

/**
 * Runs the scraper if it's time
 * @returns true if the scraper was run, false otherwise
 */
export async function runScraperIfNeeded(): Promise<boolean> {
  const shouldRun = await shouldRunScraper();
  if (shouldRun) {
    console.log("Starting daily scraper run...");
    await runScraper();
    await saveLastRunTime();
    console.log("Daily scraper run completed and timestamp saved.");
    return true;
  }
  
  const lastRun = await getLastRunTime();
  if (lastRun) {
    const nextRunTime = new Date(lastRun.lastRunTimestamp + TWENTY_FOUR_HOURS_MS);
    console.log(`Scraper already ran recently. Next run scheduled for: ${nextRunTime.toLocaleString()}`);
  }
  
  return false;
}

/**
 * Main scheduler function that checks if the scraper should run
 * This could be called at server startup and periodically
 */
export async function checkAndRunScheduler(): Promise<void> {
  await runScraperIfNeeded();
}

// Run directly if this module is executed as main
if (import.meta.main) {
  checkAndRunScheduler();
}