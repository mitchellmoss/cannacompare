import { main as runScraper } from "../scraper/main_scraper.ts";

/**
 * Force a scraping run regardless of when the last run occurred
 * Useful for manually triggering scrapes outside the standard schedule
 */
async function forceScraperRun(): Promise<void> {
  console.log("Forcing scraper run...");
  
  try {
    // Run the scraper immediately
    await runScraper();
    
    // Don't update the last run time in KV storage
    // This allows the regular scheduler to still operate on its normal schedule
    console.log("Forced scraper run completed successfully.");
  } catch (error) {
    console.error("Error during forced scraper run:", error);
  }
}

// Run this script directly
if (import.meta.main) {
  await forceScraperRun();
}