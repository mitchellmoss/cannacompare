/**
 * Types for the cannabis product scraper
 */

// Target dispensary information
export interface TargetDispensary {
  name: string;
  menu_url: string;
}

// Product data structure returned from scraper
export interface ProductSchema {
  product_name: string;
  price: string; // Stored as string for flexibility (e.g., "$50.00", "$15/g")
  weight_or_size?: string; // Optional field (e.g., "3.5g", "1oz", "100mg")
}

// Enhanced product info with dispensary data for UI
export interface ProductQueryResult extends ProductSchema {
  dispensary_name: string;
  scraped_at: string;
}

// Action types for Firecrawl
export type FirecrawlAction = 
  | { type: "scroll"; distance: number }
  | { type: "wait"; milliseconds: number }
  | { type: "click"; selector: string }
  | { type: "write"; selector: string; text: string }
  | { type: "press"; key: string }
  | { type: "executeJavascript"; script: string };

// Firecrawl API parameters
export interface ScrapeParams {
  url: string;
  formats?: string[];
  waitFor?: number;
  actions?: FirecrawlAction[];
  jsonOptions?: {
    schema?: Record<string, unknown>;
    prompt?: string;
    systemPrompt?: string;
  };
}

// Firecrawl API response
export interface FirecrawlResponse {
  success: boolean;
  data?: {
    content?: string;
    markdown?: string;
    html?: string;
    llm_extraction?: any; // This will be cast to the appropriate type
  };
  error?: string;
  jobId?: string;
}