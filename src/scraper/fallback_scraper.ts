/**
 * Fallback scraper for when Firecrawl API has issues
 * This module provides simpler direct HTTP scraping functionality
 */
import { ProductSchema } from "../shared/types.ts";
import { parseHtml } from "./html_parser.ts";
import { logScrapeError } from "../db/json_storage.ts";

/**
 * Scrape a dispensary menu directly without using Firecrawl API
 * Used as a fallback when Firecrawl returns errors
 * 
 * @param url The URL of the dispensary menu to scrape
 * @returns Array of products or null if scraping failed
 */
export async function fallbackScrape(url: string): Promise<ProductSchema[] | null> {
  console.log(`Attempting fallback scrape for ${url}...`);
  
  try {
    // Simple fetch with browser-like headers to avoid being blocked
    const response = await fetch(url, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/91.0.4472.114 Safari/537.36",
        "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8",
        "Accept-Language": "en-US,en;q=0.5",
        "Cache-Control": "no-cache",
        "Pragma": "no-cache",
      },
      // Set a timeout for the request
      signal: AbortSignal.timeout(30000),
    });
    
    if (!response.ok) {
      const errorMsg = `Fallback scrape failed: ${response.status} ${response.statusText}`;
      console.error(errorMsg);
      logScrapeError(errorMsg, url);
      return null;
    }
    
    // Get the HTML content
    const html = await response.text();
    
    // Use our HTML parser to extract products
    console.log(`Parsing HTML content from fallback scrape...`);
    const products = parseHtml(html);
    
    if (products && products.length > 0) {
      console.log(`Fallback scrape successfully extracted ${products.length} products from ${url}`);
      return products;
    } else {
      const errorMsg = `Fallback scrape did not find any products in HTML content from ${url}`;
      console.warn(errorMsg);
      logScrapeError(errorMsg, url);
      return null;
    }
  } catch (error) {
    const errorMsg = `Error in fallback scrape for ${url}: ${error.message}`;
    console.error(errorMsg);
    logScrapeError(errorMsg, url);
    return null;
  }
}

/**
 * Check if a URL should use the fallback scraper
 * This helps determine when to bypass Firecrawl API
 * 
 * @param url The URL to check
 * @returns True if fallback should be used
 */
export function shouldUseFallback(url: string): boolean {
  // Add logic here to determine when to use fallback
  // For example, based on previous errors or specific domains
  
  // For now, we'll use a simple approach based on URL patterns
  // Some sites may work better with direct scraping
  const fallbackPatterns = [
    // Add specific URL patterns here if needed
  ];
  
  return fallbackPatterns.some(pattern => url.includes(pattern));
}