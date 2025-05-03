import { scrapeDispensaryMenu } from "./firecrawl_client.ts";
import {
  setupDatabase,
  getOrInsertDispensary,
  clearProductsForDispensary,
  insertProducts,
  updateDispensaryScrapeTime,
  logScrapeError,
  closeDb
} from "../db/database.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { TargetDispensary } from "../shared/types.ts";

// Load environment variables
const env = await load();
const TARGET_URLS_FILE = env.TARGET_URLS_FILE || "./target_dispensaries.json";
const REQUEST_DELAY_MS = 5000; // 5 seconds delay between requests (adjust based on rate limits)

/**
 * Main function to orchestrate the scraping process
 */
async function main() {
  console.log("Starting scraper run...");
  setupDatabase(); // Ensure DB schema exists

  let targetDispensaries: TargetDispensary[] = [];
  try {
    const fileContent = await Deno.readTextFile(TARGET_URLS_FILE);
    targetDispensaries = JSON.parse(fileContent);
  } catch (error) {
    console.error(`Failed to read or parse target dispensaries file (${TARGET_URLS_FILE}):`, error);
    return; // Exit if cannot read targets
  }

  if (targetDispensaries.length === 0) {
    console.log("No target dispensaries found in file. Exiting.");
    return;
  }

  console.log(`Found ${targetDispensaries.length} target dispensaries.`);

  for (const target of targetDispensaries) {
    console.log(`\nProcessing: ${target.name} (${target.menu_url})`);
    let dispensaryId: number | undefined;
    try {
      dispensaryId = getOrInsertDispensary(target.name, target.menu_url);

      const products = await scrapeDispensaryMenu(target.menu_url);

      if (products && products.length > 0) {
        // Clear old data and insert new data
        clearProductsForDispensary(dispensaryId);
        insertProducts(dispensaryId, products);
        updateDispensaryScrapeTime(dispensaryId);
        console.log(`Successfully processed ${target.name} - ${products.length} products added`);
      } else {
        console.error(`Failed to scrape data for ${target.name}`);
        logScrapeError(`Scraping failed, no products returned.`, target.menu_url, dispensaryId);
      }
    } catch (error) {
      console.error(`Error processing ${target.name}:`, error);
      logScrapeError(error.message || "Unknown processing error", target.menu_url, dispensaryId);
    }

    // Add delay to respect rate limits before processing next dispensary
    if (targetDispensaries.indexOf(target) < targetDispensaries.length - 1) {
      console.log(`Waiting ${REQUEST_DELAY_MS / 1000}s before next request...`);
      await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }
  }

  closeDb(); // Close the database connection when done
  console.log("\nScraper run finished.");
}

// Add a separate setup function to initialize the database only
export async function setupDbOnly() {
  setupDatabase();
  closeDb();
  console.log("Database setup complete.");
}

// Run the main function if this module is executed directly
if (import.meta.main) {
  main();
}