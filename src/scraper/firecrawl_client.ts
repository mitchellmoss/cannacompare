/**
 * Firecrawl API client for scraping dispensary menus
 */
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema, ScrapeParams, FirecrawlResponse } from "../shared/types.ts";
import { logScrapeError } from "../db/json_storage.ts"; // Changed to use JSON storage
import { parseHtml } from "./html_parser.ts"; // Import the HTML parser
import { fallbackScrape, shouldUseFallback } from "./fallback_scraper.ts"; // Import fallback scraper

// Load environment variables
const env = await load();
const FIRECRAWL_API_KEY = env.FIRECRAWL_API_KEY;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";
const USE_CHEAPER_FORMAT = true; // Set to true to use HTML format instead of more expensive JSON format

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
 * Scrape a dispensary menu using Firecrawl API with fallback mechanisms
 * 
 * @param url The URL of the dispensary menu to scrape
 * @param useFirecrawl Optional flag to override and use Firecrawl regardless of other settings
 * @returns Array of products or null if scraping failed
 */
export async function scrapeDispensaryMenu(url: string, useFirecrawl = true): Promise<ProductSchema[] | null> {
  // Check if we should use fallback scraper instead of Firecrawl
  if (!useFirecrawl || shouldUseFallback(url)) {
    console.log(`Using fallback scraper for ${url} instead of Firecrawl API`);
    return fallbackScrape(url);
  }
  
  if (!FIRECRAWL_API_KEY) {
    const errorMsg = "Error: FIRECRAWL_API_KEY not found in environment variables.";
    console.error(errorMsg);
    logScrapeError(errorMsg, url);
    return null;
  }

  const params: ScrapeParams = {
    url: url,
    formats: USE_CHEAPER_FORMAT ? ["html"] : ["json"], // Use HTML format if cheaper format is enabled
    waitFor: 15000, // Wait 15 seconds for dynamic content to load (increased from 5s due to timeout issues)
    // Add additional parameters to help with complex sites
    actions: [
      // Scroll down to ensure lazy-loaded content is visible
      { type: "scroll", distance: 500 },
      { type: "wait", milliseconds: 1000 },
      { type: "scroll", distance: 500 },
      { type: "wait", milliseconds: 1000 },
      // Scroll once more to ensure all content is loaded
      { type: "scroll", distance: 500 }
    ],
  };
  
  // Only add JSON options if using JSON format
  if (!USE_CHEAPER_FORMAT) {
    params.jsonOptions = {
      schema: productExtractionSchema,
    };
  }

  try {
    console.log(`Scraping ${url}...`);
    console.log(`Using ${USE_CHEAPER_FORMAT ? 'HTML' : 'JSON/LLM'} format for extraction`);
    console.log(`Request parameters: ${JSON.stringify({
      ...params,
      url: params.url,
      formats: params.formats,
      waitFor: params.waitFor
    })}`);
    
    // Add a longer timeout for the fetch operation
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 60000); // 60 second timeout
    
    let response;
    
    // First try/catch block just for the fetch operation
    try {
      response = await fetch(FIRECRAWL_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
        },
        body: JSON.stringify(params),
        signal: controller.signal
      });
      clearTimeout(timeout);
      
      console.log(`Response status: ${response.status} ${response.statusText}`);
    } catch (fetchError) {
      clearTimeout(timeout);
      if (fetchError.name === 'AbortError') {
        const timeoutMsg = `Fetch operation timed out after 60 seconds for ${url}`;
        console.error(timeoutMsg);
        logScrapeError(timeoutMsg, url);
        return fallbackScrape(url);
      }
      // If it's not an abort error, throw it to the outer catch
      throw fetchError;
    }
    
    // Check if response is not OK (error status code)
    if (!response.ok) {
      const errorBody = await response.text();
      console.log(`Error response body: ${errorBody}`);
      const errorMsg = `Error scraping ${url}: ${response.status} ${response.statusText} - ${errorBody}`;
      console.error(errorMsg);
      
      // Handle specific error cases
      if (response.status === 402) {
        const paymentMsg = "Firecrawl API requires credits to perform this request. Please upgrade your plan at https://firecrawl.dev/pricing";
        console.error(paymentMsg);
        logScrapeError(paymentMsg, url);
        return null; // Don't use fallback for payment issues
      } 
      else if (response.status === 500 || response.status === 502 || response.status === 503 || response.status === 504) {
        const serverErrorMsg = `Firecrawl server error (${response.status}). This may be due to timeout, rate limiting, or site complexity. Trying fallback scraper.`;
        console.error(serverErrorMsg);
        logScrapeError(`${serverErrorMsg} Details: ${errorBody}`, url);
        
        // Try the fallback scraper when Firecrawl has server errors
        console.log("Attempting fallback scraper due to Firecrawl server error...");
        return fallbackScrape(url);
      } 
      else if (response.status === 400) {
        const badRequestMsg = `Bad request to Firecrawl API. This may be due to invalid parameters. Trying with simplified parameters...`;
        console.error(badRequestMsg);
        logScrapeError(`${badRequestMsg} Details: ${errorBody}`, url);
        
        // Try again with simplified parameters
        console.log("Retrying with simplified parameters...");
        // Create a simplified version of the parameters without actions
        const simplifiedParams: ScrapeParams = {
          url: url,
          formats: USE_CHEAPER_FORMAT ? ["html"] : ["json"],
          waitFor: 20000, // Longer wait time instead of actions
        };
        
        if (!USE_CHEAPER_FORMAT) {
          simplifiedParams.jsonOptions = {
            schema: productExtractionSchema,
          };
        }
        
        try {
          const retryResponse = await fetch(FIRECRAWL_API_URL, {
            method: "POST",
            headers: {
              "Content-Type": "application/json",
              "Authorization": `Bearer ${FIRECRAWL_API_KEY}`,
            },
            body: JSON.stringify(simplifiedParams),
          });
          
          if (!retryResponse.ok) {
            console.error("Simplified parameters still failed. Falling back to direct scraper.");
            return fallbackScrape(url);
          }
          
          const retryResult: FirecrawlResponse = await retryResponse.json();
          
          if (USE_CHEAPER_FORMAT && retryResult.success && retryResult.data?.html) {
            console.log("Processing HTML content from simplified request...");
            const products = parseHtml(retryResult.data.html);
            
            if (products && products.length > 0) {
              console.log(`Successfully extracted ${products.length} products from HTML with simplified parameters`);
              return products;
            }
          } else if (retryResult.success && retryResult.data?.llm_extraction) {
            const extractedData = retryResult.data.llm_extraction as any;
            
            if (extractedData && Array.isArray(extractedData.products)) {
              console.log(`Successfully scraped ${extractedData.products.length} products using simplified parameters`);
              return extractedData.products;
            }
          }
          
          // If we get here, both attempts failed - try fallback
          console.log("Simplified parameters didn't yield valid results. Falling back to direct scraper.");
          return fallbackScrape(url);
          
        } catch (retryError) {
          console.error("Error during retry with simplified parameters:", retryError);
          return fallbackScrape(url);
        }
      } 
      else if (response.status === 429) {
        const rateLimitMsg = "Rate limit exceeded. Consider reducing request frequency or upgrading your Firecrawl plan.";
        console.error(rateLimitMsg);
        logScrapeError(rateLimitMsg, url);
        
        // Also try fallback for rate limiting
        console.log("Attempting fallback scraper due to rate limiting...");
        return fallbackScrape(url);
      } 
      else {
        logScrapeError(errorMsg, url);
        
        // For any other error, try fallback as well
        console.log("Attempting fallback scraper due to unexpected error...");
        return fallbackScrape(url);
      }
    }
    
    // If we get here, the response was successful
    // Process the response
    const result: FirecrawlResponse = await response.json();
    
    if (USE_CHEAPER_FORMAT && result.success && result.data?.html) {
      // Parse the HTML content using our HTML parser
      console.log("Processing HTML content with parser...");
      const products = parseHtml(result.data.html);
      
      if (products && products.length > 0) {
        console.log(`Successfully extracted ${products.length} products from HTML`);
        return products;
      } else {
        const errorMsg = "HTML parsing did not return any products. HTML content may not match expected patterns.";
        console.error(errorMsg);
        logScrapeError(errorMsg, url);
        console.log("Trying fallback scraper due to HTML parsing issues...");
        return fallbackScrape(url);
      }
    } else if (result.success && result.data?.llm_extraction) {
      // Using JSON format with LLM extraction
      const extractedData = result.data.llm_extraction as any;
      
      if (extractedData && Array.isArray(extractedData.products)) {
        console.log(`Successfully scraped ${extractedData.products.length} products from ${url}`);
        return extractedData.products;
      } else {
        const errorMsg = `LLM extraction format unexpected for ${url}. Data: ${JSON.stringify(result.data.llm_extraction)}`;
        console.warn(errorMsg);
        logScrapeError(errorMsg, url);
        console.log("Trying fallback scraper due to LLM extraction issues...");
        return fallbackScrape(url);
      }
    } else if (!result.success) {
      const errorMsg = `Firecrawl API error for ${url}: ${result.error}`;
      console.error(errorMsg);
      logScrapeError(errorMsg, url);
      console.log("Trying fallback scraper due to unsuccessful API response...");
      return fallbackScrape(url);
    } else {
      const errorMsg = `No data found for ${url}, though request was successful.`;
      console.warn(errorMsg);
      logScrapeError(errorMsg, url);
      console.log("Trying fallback scraper due to missing data...");
      return fallbackScrape(url);
    }
    
  } catch (error) {
    // This outer catch handles any errors in the whole process
    // Provide more detailed error logging
    const errorName = error.name || 'Unknown';
    const errorMessage = error.message || 'No error message available';
    const errorStack = error.stack ? `\nStack: ${error.stack}` : '';
    
    const errorMsg = `Network or unexpected error scraping ${url}: [${errorName}] ${errorMessage}${errorStack}`;
    console.error(errorMsg);
    
    // Add more context to the error log
    let detailedMsg = `Failed to scrape ${url} - Error type: ${errorName}`;
    
    if (errorName === 'TypeError' && errorMessage.includes('JSON')) {
      detailedMsg += ' - Possible invalid JSON response from Firecrawl API';
    } else if (errorName === 'TypeError' && errorMessage.includes('fetch')) {
      detailedMsg += ' - Network fetch operation failed';
    } else if (errorName === 'AbortError') {
      detailedMsg += ' - Request timed out or was aborted';
    }
    
    logScrapeError(`${detailedMsg}. Original error: ${errorMessage}`, url);
    
    // Try fallback for any error
    console.log("Trying fallback scraper due to unexpected error...");
    return fallbackScrape(url);
  }
}