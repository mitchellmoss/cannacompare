import { checkAndRunScheduler } from "./scheduler.ts";

// How often to check for scheduler trigger (every hour)
const CHECK_INTERVAL_MS = 60 * 60 * 1000;

/**
 * Start the scheduler service
 * - Runs the scraper if needed on startup
 * - Sets up a periodic check to run again if 24 hours have passed
 */
export async function startSchedulerService(): Promise<void> {
  console.log("Starting scheduler service...");
  
  // Run immediately at startup
  await checkAndRunScheduler();
  
  // Set up periodic check
  setInterval(async () => {
    console.log("Running scheduled check...");
    await checkAndRunScheduler();
  }, CHECK_INTERVAL_MS);
  
  console.log(`Scheduler service started. Will check every ${CHECK_INTERVAL_MS / (60 * 1000)} minutes.`);
}

// Run directly if this module is executed as main
if (import.meta.main) {
  startSchedulerService();
}