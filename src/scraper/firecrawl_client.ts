import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema, ScrapeParams, FirecrawlResponse } from "../shared/types.ts";
import { logScrapeError } from "../db/database.ts";

// Load environment variables
const env = await load();
const FIRECRAWL_API_KEY = env.FIRECRAWL_API_KEY;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";

// Define the expected structure for LLM extraction
const productExtractionSchema = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: { 
            type: "string", 
            description: "The name of the cannabis product." 
          },
          price: { 
            type: "string", 
            description: "The listed price of the product (e.g., $50.00, $15/g). Include currency symbol if present." 
          },
          weight_or_size: { 
            type: "string", 
            description: "The weight (e.g., 3.5g, 1oz) or size (e.g., 100mg) of the product, if specified." 
          },
        },
        required: ["product_name", "price"],
      },
    },
  },
  required: ["products"],
};

/**
 * Scrape a dispensary menu using Firecrawl API
 * 
 * @param url The URL of the dispensary menu to scrape
 * @returns Array of products or null if scraping failed
 */
export async function scrapeDispensaryMenu(url: string): Promise<ProductSchema[] | null> {
  if (!FIRECRAWL_API_KEY) {
    const errorMsg = "Error: FIRECRAWL_API_KEY not found in environment variables.";
    console.error(errorMsg);
    logScrapeError(errorMsg, url);
    return null;
  }

  const params: ScrapeParams = {
    url: url,
    formats: ["json"], // Use JSON format for LLM extraction
    waitFor: 5000, // Wait 5 seconds for dynamic content to load
    jsonOptions: {
      schema: productExtractionSchema, // Use the defined schema
      // Alternative approach with natural language prompt:
      // prompt: "Extract all cannabis product names, prices, and weights/sizes listed on this menu page. Return as a structured JSON list.",
    },
  };

  try {
    console.log(`Scraping ${url}...`);
    const response = await fetch(FIRECRAWL_API_URL, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
      },
      body: JSON.stringify(params),
    });

    if (!response.ok) {
      const errorBody = await response.text();
      const errorMsg = `Error scraping ${url}: ${response.status} ${response.statusText} - ${errorBody}`;
      console.error(errorMsg);
      logScrapeError(errorMsg, url);
      return null;
    }

    const result: FirecrawlResponse = await response.json();

    if (result.success && result.data?.llm_extraction) {
      // Assuming llm_extraction contains { products: ProductSchema[] } based on schema
      const extractedData = result.data.llm_extraction as any;
      
      if (extractedData && Array.isArray(extractedData.products)) {
        console.log(`Successfully scraped ${extractedData.products.length} products from ${url}`);
        return extractedData.products;
      } else {
        const errorMsg = `LLM extraction format unexpected for ${url}. Data: ${JSON.stringify(result.data.llm_extraction)}`;
        console.warn(errorMsg);
        logScrapeError(errorMsg, url);
        return null;
      }
    } else if (!result.success) {
      const errorMsg = `Firecrawl API error for ${url}: ${result.error}`;
      console.error(errorMsg);
      logScrapeError(errorMsg, url);
      return null;
    } else {
      const errorMsg = `No LLM extraction data found for ${url}, though request was successful.`;
      console.warn(errorMsg);
      logScrapeError(errorMsg, url);
      return null;
    }
  } catch (error) {
    const errorMsg = `Network or unexpected error scraping ${url}: ${error.message}`;
    console.error(errorMsg);
    logScrapeError(errorMsg, url);
    return null;
  }
}