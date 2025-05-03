Plan for Building a Recurring Cannabis Product Price Scraper with Deno, Firecrawl, and SQLite1. Introduction1.1. Project Overview and GoalsThis document outlines a comprehensive plan for developing a web scraping application designed to collect and analyze product pricing data from cannabis dispensary websites powered by the Dutchie platform. The primary goals are:
Automated Data Collection: Implement a recurring process to scrape product names, prices, weights/sizes, and dispensary information from specified Dutchie-powered websites.
Local Data Storage: Persist the collected data efficiently in a local SQLite database.
Data Accessibility: Provide a simple web interface allowing users to search, view, and compare product prices across different dispensaries stored in the database.
System Architecture: Utilize Deno JS for the core application logic and web server, leverage the Firecrawl API for robust web scraping, employ SQLite for local data management, and optionally integrate Rust for performance-critical sections via Foreign Function Interface (FFI).
Deployment: Host the application and database on a local server for private use.
1.2. Technology Stack Rationale
Deno JS: A modern, secure JavaScript/TypeScript runtime offering built-in tooling, native TypeScript support, and a focus on security, making it suitable for server-side applications and scripting. Its integrated FFI capabilities facilitate interaction with Rust code.
Firecrawl API: A specialized web scraping and crawling service designed to handle complexities like JavaScript rendering, proxies, rate limits, and converting web content into structured data (including Markdown or JSON).1 Its LLM-based extraction capabilities (json format) are particularly relevant for targeting specific data points like pricing from potentially complex HTML structures.2
SQLite: A lightweight, file-based relational database management system ideal for local data storage. It requires minimal setup and is well-supported by Deno libraries.
Rust (Optional): A high-performance, memory-safe systems programming language. Integrating Rust via FFI allows for optimizing computationally intensive tasks if bottlenecks arise in the Deno application. Firecrawl also offers a native Rust SDK.5
Oak (Deno Web Framework): A popular middleware framework for Deno's HTTP server, inspired by Koa, simplifying the creation of web applications and APIs.
1.3. CRITICAL Legal and Ethical ConsiderationsBefore proceeding with the implementation, it is imperative to understand the significant legal and ethical risks associated with scraping Dutchie websites.

Dutchie Terms of Service (ToS): Both the general user ToS 8 and the Developer Terms 9 explicitly prohibit automated access, data mining, scraping, reverse engineering, and unauthorized data aggregation or use. Engaging in these activities constitutes a direct violation of their terms.
Table 1: Summary of Key Prohibitions in Dutchie Terms of Service


Term SourceProhibited ActivityKey Snippet Ref.User ToSData mining, robots, scraping, similar data extraction8, 8User ToSModifying, copying, framing, scraping Service Content8, 8User ToSReverse engineering underlying Software8, 8Developer ToSWeb scraping, web harvesting, web data extraction tools9, 9Developer ToSReverse-engineering Developer Tools or Dutchie services9, 9Developer ToSAggregating/Selling/Transferring Content/Customer Data9, 9Developer ToSAccessing Content/Customer Data outside Developer Tools9, 9Developer ToSCaching/Storing data beyond reasonable/lawful periods9, 9

Consequences of Violation: Violating Dutchie's ToS can lead to severe consequences, including account termination, blocking of the application/IP address, customer notification, and potential legal action for damages or injunctive relief.8
General Web Scraping Legality: While scraping publicly available data is generally considered legal in the US, provided it doesn't cause harm or violate specific laws like the DMCA (Digital Millennium Copyright Act) 10 or breach contract terms (like ToS) 11, the explicit prohibitions in Dutchie's ToS make this specific project highly problematic from a legal standpoint. Scraping copyrighted material without permission can lead to DMCA takedown notices.10 Scraping personal data raises privacy concerns under regulations like GDPR.12
Ethical Considerations: Beyond legality, ethical scraping involves respecting website resources (avoiding excessive requests), not misrepresenting scraped data, and adhering to robots.txt files (though robots.txt is a convention, not legally binding).13 Given Dutchie's explicit stance, proceeding would disregard their stated terms.
Recommendation: Due to the explicit prohibitions in Dutchie's Terms of Service, proceeding with this project carries substantial legal risk. It is strongly advised to seek legal counsel before developing or deploying any application that scrapes Dutchie websites. This plan is provided for technical demonstration purposes only, assuming such legal hurdles could be cleared, which is currently unlikely based on available documentation.2. Prerequisites and Setup2.1. Software Installation
Deno: Install the Deno runtime. Follow the official installation instructions at https://deno.land/#installation. Verify the installation by running deno --version in the terminal.
Rust (Optional): If planning to use Rust for performance-critical parts via FFI, install the Rust toolchain (including rustc and cargo) from https://www.rust-lang.org/tools/install. Verify with rustc --version and cargo --version.
Git: Ensure Git is installed for version control.
2.2. API Keys and Environment Variables
Firecrawl API Key: Sign up for a Firecrawl account at https://www.firecrawl.dev/.1 Obtain an API key from the dashboard.
Environment File (.env): Create a .env file in the project root to store sensitive information like the API key. This prevents hardcoding credentials into the source code.15
Code snippet#.env
FIRECRAWL_API_KEY="fc-YOUR_API_KEY_HERE"
DATABASE_PATH="./dispensary_data.db"
# Add other configurations like target URLs list path, server port, etc.
TARGET_URLS_FILE="./target_dispensaries.json"
SERVER_PORT=8000


Deno Permissions: Deno requires explicit permissions. The application will need --allow-net (for API calls, web server), --allow-read (for .env, source files, DB file), --allow-write (for DB file, logs), and --allow-env (to read environment variables). If using Rust FFI, --allow-ffi and potentially --unstable (depending on Deno version and FFI features used) will be required.
2.3. Project StructureOrganize the project files logically:/project-root
|--.env                 # Environment variables (API Key, DB path, etc.)
|-- deno.jsonc           # Deno configuration (optional, for tasks, imports)
|-- src/
| |-- scraper/
| | |-- firecrawl_client.ts  # Firecrawl API interaction logic
| | |-- parser.ts          # Data extraction/parsing logic (if needed)
| | |-- main_scraper.ts    # Main scraping orchestration script
| |-- db/
| | |-- schema.sql         # SQL schema definition
| | |-- database.ts        # SQLite connection and query functions
| | |-- setup_db.ts        # Script to initialize the database
| |-- web/
| | |-- server.ts          # Oak web server setup
| | |-- routes.ts          # API endpoint definitions
| | |-- public/            # Static frontend files (HTML, CSS, JS)
| | |-- index.html
| | |-- styles.css
| | |-- script.js
| |-- rust_interop/        # Optional: Rust FFI code
| | |-- src/lib.rs         # Rust library code
| | |-- Cargo.toml         # Rust dependencies
| | |-- rust_bindings.ts   # Deno FFI bindings
| |-- shared/              # Shared types, utilities
| |-- types.ts
|-- target_dispensaries.json # List of target dispensary menu URLs
|-- scrape_log.txt         # Log file for scraping activity/errors
|-- README.md
3. Finding Target Dispensaries3.1. Identifying Dutchie-Powered WebsitesLocating dispensaries that utilize the Dutchie platform is the first step. Several methods can be employed:
Dutchie.com Directory: The primary method is to use the search functionality on the official Dutchie website (https://dutchie.com/).16 Users can search by city, state, zip code, or full address to find dispensaries in a specific area. The site provides lists of dispensaries, potentially filterable by features like "Recreational" or "Medical".18 Dutchie also maintains city-specific pages (e.g., https://dutchie.com/cities) listing dispensaries by state/province and city.20 Brands using Dutchie services are often automatically included in this directory.21
Manual Identification: Examine dispensary websites directly. Look for indicators of Dutchie integration:

iFrame Embedding: Many dispensaries embed the standard Dutchie menu using an HTML iFrame.21 Inspecting the website's source code for an <iframe> element pointing to a dutchie.com domain is a strong indicator.
Dutchie Plus: Newer integrations using "Dutchie Plus" might not use an iFrame but offer a more integrated, customizable menu experience that is directly indexable by search engines.21 Identifying these might require looking for specific URL patterns, branding elements, or network requests to Dutchie APIs during menu interaction.
URL Structure: Check if the online ordering or menu section of a dispensary's website redirects to or is hosted on a dutchie.com subdomain.


3.2. Obtaining Menu URLsOnce a Dutchie-powered dispensary is identified, the specific URL for its product menu needs to be determined. This is often a dedicated page on the dispensary's website (e.g., /menu, /order-online) which contains the embedded iFrame or the Dutchie Plus integration. For sites using the standard iFrame, the target URL for scraping might be the src attribute of the iFrame itself, if direct scraping of the iFrame content is intended (though Firecrawl can often handle the main page URL containing the iFrame).3.3. Limitations and Manual Curation
Programmatic Discovery: Reliably discovering all Dutchie-powered websites programmatically is challenging. The main Dutchie site (https://dutchie.com/cities) provides lists but might not be exhaustive or easily scrapable for direct menu URLs.20 Competitors like Jane, Weedmaps, Leafly, Blaze, and Dispense also exist, meaning not all dispensary sites use Dutchie.21
Manual List: The most practical approach for this project is to manually curate a list of target dispensary menu URLs known to be powered by Dutchie. Store this list in a configuration file (e.g., target_dispensaries.json) for the scraper to read.
JSON// target_dispensaries.json



4. Core Scraping Logic (Firecrawl API)4.1. Firecrawl API OverviewFirecrawl provides several API endpoints (/scrape, /crawl, /map, /search, /extract) to interact with web pages.1 For this project, the /scrape endpoint is the most relevant, as it targets a single URL to extract its content.2 Firecrawl handles complexities like JavaScript rendering (essential for dynamic menus), proxy management, and basic anti-bot measures.24.2. Choosing the Right Endpoint: /scrapeThe /scrape endpoint is suitable for fetching data from a specific menu URL. It takes a URL and returns its content in specified formats.14.3. Handling Dynamic ContentDutchie menus likely rely heavily on JavaScript to load product listings and pricing dynamically. Firecrawl addresses this inherently by using headless browsers.15 Additionally, specific parameters can fine-tune the process 4:
waitFor (milliseconds): Introduce a delay before scraping to allow dynamic elements to load.
actions: Perform interactions like clicking buttons (e.g., "Load More"), scrolling, or waiting for specific CSS selectors to appear before scraping commences. This is crucial if menus require interaction to reveal all products or pricing tiers.1
4.4. Extracting Structured Data (Product Name, Price, Size)Extracting specific data points like product name, price, and size requires targeting the correct HTML elements. Firecrawl offers two main approaches 22:

Option 1: Basic Formats + Deno Parsing (Less Robust, Cheaper):

Use formats: ["markdown"] or formats: ["html"] in the /scrape request.2
Receive the page content as Markdown or HTML.
In Deno (src/scraper/parser.ts), use an HTML parsing library (like deno-dom) to traverse the DOM and extract data based on CSS selectors (e.g., .product-name, .product-price, .product-weight).
Challenge: This is brittle. If Dutchie changes the website structure or CSS class names, the selectors will break, requiring manual updates.23 Identifying the correct selectors requires inspecting the HTML structure of target menus.23 Dutchie's pricing structure can be complex, with tiers based on weight/quantity and potential overrides 25, making simple selector-based extraction difficult.
Cost: 1 Firecrawl credit per page scrape.28



Option 2: JSON Format with LLM Extraction (More Robust, More Expensive):

Use formats: ["json"] along with the jsonOptions parameter in the /scrape request.2
Define a desired JSON structure using jsonOptions.schema or provide a natural language jsonOptions.prompt describing the data to extract (e.g., "Extract all product names, their prices, and available weights/sizes").2
Firecrawl uses an LLM to understand the page content and extract the data according to the schema or prompt, returning a structured JSON object in the llm_extraction field of the response.2
Advantage: This method is more resilient to minor changes in website layout or CSS classes, as the LLM focuses on semantic content rather than specific tags. It can potentially handle complex pricing structures more effectively if prompted correctly.
Cost: 5 Firecrawl credits per page scrape (5x the cost of basic formats).28 This cost difference is a significant factor to consider based on budget and the required robustness.


Recommendation: Start with the JSON Format (Option 2) despite the higher cost, as it offers significantly better robustness against website changes, which are common. The complexity of potential Dutchie pricing tiers 25 further favors an LLM-based approach.4.5. Deno Implementation (firecrawl_client.ts)Use Deno's native fetch API or a Firecrawl client library (if available for Deno, otherwise use fetch) to interact with the Firecrawl /scrape endpoint.TypeScript// src/scraper/firecrawl_client.ts
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";

const env = await load();
const FIRECRAWL_API_KEY = env;
const FIRECRAWL_API_URL = "https://api.firecrawl.dev/v1/scrape";

interface ScrapeParams {
  url: string;
  formats?: string;
  // Add other relevant params: waitFor, actions, location, jsonOptions etc.
  jsonOptions?: {
    schema?: Record<string, unknown>; // Define your Pydantic-like schema structure here
    prompt?: string;
    systemPrompt?: string;
  };
  //... other options based on [4]
}

interface ProductSchema {
  product_name: string;
  price: string; // Consider using number if format is consistent
  weight_or_size?: string;
  // Add other fields as needed
}

interface FirecrawlResponse {
  success: boolean;
  data?: {
    content: string; // For markdown/html
    markdown?: string;
    html?: string;
    llm_extraction?: ProductSchema; // Array if extracting multiple products
    //... other format fields
  };
  error?: string;
  jobId?: string; // For async operations if used
}

// Define the expected structure for LLM extraction
const productExtractionSchema = {
  type: "object",
  properties: {
    products: {
      type: "array",
      items: {
        type: "object",
        properties: {
          product_name: { type: "string", description: "The name of the cannabis product." },
          price: { type: "string", description: "The listed price of the product (e.g., $50.00, $15/g). Include currency symbol if present." },
          weight_or_size: { type: "string", description: "The weight (e.g., 3.5g, 1oz) or size (e.g., 100mg) of the product, if specified." },
          // Add strain_type, brand, category etc. if needed
        },
        required: ["product_name", "price"],
      },
    },
  },
  required: ["products"],
};


export async function scrapeDispensaryMenu(url: string): Promise<ProductSchema | null> {
  if (!FIRECRAWL_API_KEY) {
    console.error("Error: FIRECRAWL_API_KEY not found in environment variables.");
    return null;
  }

  const params: ScrapeParams = {
    url: url,
    formats: ["json"], // Use JSON format for LLM extraction
    jsonOptions: {
      schema: productExtractionSchema, // Use the defined schema
      // Alternatively, use a prompt:
      // prompt: "Extract all product names, prices, and weights/sizes listed on the menu. Return as a JSON list.",
    },
    // Example: Wait 5 seconds for dynamic content
    // waitFor: 5000
  };

  try {
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
      console.error(`Error scraping ${url}: ${response.status} ${response.statusText} - ${errorBody}`);
      // Log error to scrape_log.txt or db
      return null;
    }

    const result: FirecrawlResponse = await response.json();

    if (result.success && result.data?.llm_extraction) {
      // Assuming llm_extraction contains { products: ProductSchema } based on schema
      const extractedData = result.data.llm_extraction as any; // Cast needed based on actual response structure
      if (extractedData && Array.isArray(extractedData.products)) {
         console.log(`Successfully scraped ${extractedData.products.length} products from ${url}`);
         return extractedData.products;
      } else {
         console.warn(`LLM extraction format unexpected for ${url}. Data:`, result.data.llm_extraction);
         return null;
      }
    } else if (!result.success) {
      console.error(`Firecrawl API error for ${url}: ${result.error}`);
      // Log error
      return null;
    } else {
       console.warn(`No LLM extraction data found for ${url}, though request was successful.`);
       return null;
    }

  } catch (error) {
    console.error(`Network or unexpected error scraping ${url}:`, error);
    // Log error
    return null;
  }
}
4.6. Error Handling and LoggingImplement robust error handling:
Check HTTP status codes from Firecrawl.
Parse the Firecrawl JSON response for success: false and log the error message.
Use try...catch blocks for network errors or unexpected issues.
Log all errors encountered during scraping (including the URL that failed) to a file (scrape_log.txt) or a dedicated scrape_log table in the SQLite database for later review. Include timestamps.
4.7. Rate Limits and Cost Management

Rate Limits: Firecrawl imposes rate limits (requests per minute) based on the subscription plan.30 The free tier is limited (e.g., 10 /scrape requests/min).30 Higher tiers offer significantly increased limits.30 Implement delays between requests (await new Promise(resolve => setTimeout(resolve, delayMs));) in the main scraping loop (src/scraper/main_scraper.ts) to stay within the chosen plan's limits. Firecrawl SDKs and some wrappers might offer automatic retry with exponential backoff for rate limit errors.32


Concurrency: Plans also limit concurrent browser sessions.29 Avoid making too many parallel requests. Process target URLs sequentially or in small batches appropriate for the plan's concurrency limit.


Credit Costs: Monitor API credit usage. Scraping with json format costs 5 credits/page, while basic formats cost 1 credit/page.28 Choose the plan (Free, Hobby, Standard, Growth) based on the number of target dispensaries and desired scraping frequency.28 Consider credit packs or auto-recharge if usage fluctuates.28
Table 2: Firecrawl API Credit Costs per Request


Feature/EndpointCredits per UnitSnippet Ref./scrape (basic formats)1 / page28, 29/scrape (with JSON format)5 / page28, 29/crawl (basic formats)1 / page28, 29/crawl (with JSON format)5 / page28, 29/map1 / call28, 29/search1 / page28, 29/extractSeparate Pricing28, 29
**Table 3: Firecrawl Standard Plan Comparison (Rate Limits & Concurrency)**

Plan/scrape RPM/crawl RPM/map RPM/search RPMConcurrent BrowsersSnippet Ref.Free101105230, 29Hobby1001510050530, 29Standard500505002505030, 29Growth50002505000250010030, 29
*(RPM = Requests Per Minute)*
5. Data Storage (SQLite)5.1. Database Schema DesignA simple relational schema is sufficient for storing the scraped product data. Define the schema in src/db/schema.sql.SQL-- src/db/schema.sql

CREATE TABLE IF NOT EXISTS dispensaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- Name from target_dispensaries.json
    menu_url TEXT NOT NULL UNIQUE,
    last_scraped_at DATETIME -- Timestamp of the last successful scrape
);

CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispensary_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    price TEXT NOT NULL, -- Storing as TEXT for flexibility (e.g., "$50", "$15/g")
    weight_or_size TEXT, -- Can be NULL if not specified
    scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp when this specific record was scraped
    FOREIGN KEY (dispensary_id) REFERENCES dispensaries(id) ON DELETE CASCADE
);

-- Optional: Index for faster searching
CREATE INDEX IF NOT EXISTS idx_product_name ON products (product_name);
CREATE INDEX IF NOT EXISTS idx_dispensary_id ON products (dispensary_id);

-- Optional: Log table for scraping errors
CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispensary_id INTEGER, -- Can be NULL if error occurs before identifying dispensary
    url TEXT,
    error_message TEXT NOT NULL,
    log_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dispensary_id) REFERENCES dispensaries(id) ON DELETE SET NULL
);
Table 4: SQLite Database SchemaTable NameColumn NameData TypeConstraintsDescriptiondispensariesidINTEGERPRIMARY KEY AUTOINCREMENTUnique identifier for the dispensarynameTEXTNOT NULL, UNIQUEName of the dispensary (e.g., from config file)menu_urlTEXTNOT NULL, UNIQUEThe URL of the menu that was scrapedlast_scraped_atDATETIMETimestamp of the last successful scrape attempt for this menuproductsidINTEGERPRIMARY KEY AUTOINCREMENTUnique identifier for the product recorddispensary_idINTEGERNOT NULL, FK -> dispensaries(id)Links product to the dispensary it was scraped fromproduct_nameTEXTNOT NULLName of the scraped productpriceTEXTNOT NULLPrice as scraped (flexible format)weight_or_sizeTEXTWeight/size as scraped (e.g., "3.5g", "100mg", can be NULL)scraped_atDATETIMENOT NULL, DEFAULT CURRENT_TIMESTAMPTimestamp when this specific product record was insertedscrape_logidINTEGERPRIMARY KEY AUTOINCREMENTUnique identifier for the log entry(Optional)dispensary_idINTEGERFK -> dispensaries(id)Dispensary associated with the error (if known)urlTEXTURL being scraped when error occurrederror_messageTEXTNOT NULLDescription of the errorlog_timeDATETIMENOT NULL, DEFAULT CURRENT_TIMESTAMPTimestamp when the error was logged5.2. Deno Integration (deno-sqlite)Use the deno-sqlite module for interacting with the SQLite database from Deno. Add it as an import in src/db/database.ts.TypeScript// src/db/database.ts
import { DB } from "https://deno.land/x/sqlite@v3.8/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import type { ProductSchema } from "../shared/types.ts"; // Assuming types defined here

const env = await load();
const DATABASE_PATH = env |
| "./dispensary_data.db";

let db: DB;

function getDb(): DB {
  if (!db) {
    db = new DB(DATABASE_PATH);
    // Consider enabling WAL mode for better concurrency if the web server writes often
    // db.execute("PRAGMA journal_mode = WAL;");
  }
  return db;
}

export function closeDb(): void {
  if (db) {
    db.close();
  }
}

// Ensure tables exist (call this at application startup)
export function setupDatabase(): void {
  const dbInstance = getDb();
  const schemaSql = Deno.readTextFileSync("./src/db/schema.sql"); // Adjust path if needed
  dbInstance.execute(schemaSql);
  console.log("Database schema initialized/verified.");
}

// ---- Dispensary Operations ----

export function getOrInsertDispensary(name: string, menuUrl: string): number {
    const dbInstance = getDb();
    let dispensaryId: number | undefined;

    // Try to find existing
    const existing = dbInstance.query<[number]>("SELECT id FROM dispensaries WHERE menu_url =?", [menuUrl]);
    if (existing.length > 0) {
        dispensaryId = existing;
    } else {
        // Insert new
        dbInstance.query("INSERT INTO dispensaries (name, menu_url) VALUES (?,?)", [name, menuUrl]);
        // Get the new ID
        const newEntry = dbInstance.query<[number]>("SELECT last_insert_rowid()");
        if (newEntry.length > 0) {
            dispensaryId = newEntry;
        } else {
             throw new Error("Failed to retrieve ID after inserting dispensary.");
        }
    }
    if (dispensaryId === undefined) {
        throw new Error(`Could not get or insert dispensary: ${name}`);
    }
    return dispensaryId;
}

export function updateDispensaryScrapeTime(dispensaryId: number): void {
    const dbInstance = getDb();
    dbInstance.query("UPDATE dispensaries SET last_scraped_at = datetime('now') WHERE id =?", [dispensaryId]);
}


// ---- Product Operations ----

export function insertProducts(dispensaryId: number, products: ProductSchema): void {
  if (!products |
| products.length === 0) {
    return; // Nothing to insert
  }
  const dbInstance = getDb();
  // Use a transaction for bulk inserts
  dbInstance.transaction(() => {
    const insertStmt = dbInstance.prepareQuery<[number, string, string, string | null]>(
      "INSERT INTO products (dispensary_id, product_name, price, weight_or_size) VALUES (?,?,?,?)"
    );
    for (const product of products) {
      // Basic validation/sanitization might be needed here
      insertStmt.execute([
          dispensaryId,
          product.product_name,
          product.price,
          product.weight_or_size?? null // Handle optional field
      ]);
    }
    insertStmt.finalize(); // Close the prepared statement
  });
  console.log(`Inserted ${products.length} products for dispensary ID ${dispensaryId}`);
}

// Clear old products for a dispensary before inserting new ones
export function clearProductsForDispensary(dispensaryId: number): void {
    const dbInstance = getDb();
    dbInstance.query("DELETE FROM products WHERE dispensary_id =?", [dispensaryId]);
    console.log(`Cleared old products for dispensary ID ${dispensaryId}`);
}


// ---- Search/Query Operations (for Web UI) ----
export interface ProductQueryResult extends ProductSchema {
    dispensary_name: string;
    scraped_at: string;
}

export function searchProductsByName(searchTerm: string): ProductQueryResult {
    const dbInstance = getDb();
    const query = `
        SELECT
            p.product_name,
            p.price,
            p.weight_or_size,
            p.scraped_at,
            d.name as dispensary_name
        FROM products p
        JOIN dispensaries d ON p.dispensary_id = d.id
        WHERE p.product_name LIKE?
        ORDER BY d.name, p.product_name;
    `;
    // Use '%' wildcards for partial matching
    const results = dbInstance.queryEntries<ProductQueryResult>(query,);
    return results;
}

// ---- Logging Operations ----
export function logScrapeError(errorMessage: string, url?: string, dispensaryId?: number): void {
    const dbInstance = getDb();
    dbInstance.query(
        "INSERT INTO scrape_log (dispensary_id, url, error_message, log_time) VALUES (?,?,?, datetime('now'))",
        [dispensaryId?? null, url?? null, errorMessage]
    );
}

// Add other query functions as needed (e.g., get all products, get products by dispensary)

5.3. Data Insertion Strategy
Identify Dispensary: Before scraping, use getOrInsertDispensary to get the dispensary_id based on the menu_url from the configuration file.
Clear Old Data: Before inserting new data for a dispensary, delete existing product records associated with that dispensary_id using clearProductsForDispensary. This ensures the database reflects the latest scrape.
Bulk Insert: After successfully scraping and parsing products using Firecrawl's JSON extraction (scrapeDispensaryMenu), use insertProducts to add the new records. Employ transactions for efficiency when inserting multiple products.
Update Timestamp: On successful completion of scraping and insertion for a dispensary, update its last_scraped_at timestamp using updateDispensaryScrapeTime.
5.4. Main Scraper Orchestration (main_scraper.ts)This script ties everything together: reading target URLs, calling the scraper, and saving to the DB.TypeScript// src/scraper/main_scraper.ts
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

const env = await load();
const TARGET_URLS_FILE = env |
| "./target_dispensaries.json";
const REQUEST_DELAY_MS = 5000; // 5 seconds delay between requests (adjust based on rate limits)

interface TargetDispensary {
    name: string;
    menu_url: string;
}

async function main() {
    console.log("Starting scraper run...");
    setupDatabase(); // Ensure DB schema exists

    let targetDispensaries: TargetDispensary =;
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

            if (products) {
                // Clear old data and insert new data
                clearProductsForDispensary(dispensaryId);
                insertProducts(dispensaryId, products);
                updateDispensaryScrapeTime(dispensaryId);
                console.log(`Successfully processed ${target.name}`);
            } else {
                console.error(`Failed to scrape data for ${target.name}`);
                // Error logged within scrapeDispensaryMenu or log explicitly here
                logScrapeError(`Scraping failed, no products returned.`, target.menu_url, dispensaryId);
            }

        } catch (error) {
            console.error(`Error processing ${target.name}:`, error);
            logScrapeError(error.message |
| "Unknown processing error", target.menu_url, dispensaryId);
        }

        // Add delay to respect rate limits
        console.log(`Waiting ${REQUEST_DELAY_MS / 1000}s before next request...`);
        await new Promise(resolve => setTimeout(resolve, REQUEST_DELAY_MS));
    }

    closeDb(); // Close the database connection when done
    console.log("\nScraper run finished.");
}

if (import.meta.main) {
    main();
}
6. Web Interface (Deno/Oak)6.1. Backend Server Setup (server.ts)Use the Oak framework to create a simple HTTP server.TypeScript// src/web/server.ts
import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { setupDatabase, closeDb } from "../db/database.ts";
import apiRouter from "./routes.ts"; // Import API routes

const env = await load();
const PORT = parseInt(env |
| "8000");

const app = new Application();

// Logger middleware
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
});

// Timing middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

// API Routes
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// Static file serving (for frontend)
app.use(async (ctx, next) => {
    try {
        await ctx.send({
            root: `${Deno.cwd()}/src/web/public`, // Adjust path if needed
            index: "index.html",
        });
    } catch {
        await next(); // If file not found, pass to next middleware (or 404)
    }
});


// Initialize DB on start
setupDatabase();

app.addEventListener("listen", ({ hostname, port, secure }) => {
  console.log(
    `Web server listening on: ${secure? "https://" : "http://"}${hostname?? "localhost"}:${port}`
  );
});

// Graceful shutdown
globalThis.addEventListener("unload", () => {
    console.log("Closing database connection...");
    closeDb();
});

await app.listen({ port: PORT });

6.2. API Endpoints (routes.ts)Define API endpoints to interact with the database.TypeScript// src/web/routes.ts
import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { searchProductsByName } from "../db/database.ts"; // Import DB functions

const router = new Router();

// Example: Search products by name
router.get("/api/products/search", (ctx) => {
  const searchTerm = ctx.request.url.searchParams.get("q");

  if (!searchTerm) {
    ctx.response.status = 400; // Bad Request
    ctx.response.body = { error: "Missing search query parameter 'q'" };
    return;
  }

  try {
    const results = searchProductsByName(searchTerm);
    ctx.response.status = 200;
    ctx.response.body = { data: results };
  } catch (error) {
    console.error("Error searching products:", error);
    ctx.response.status = 500; // Internal Server Error
    ctx.response.body = { error: "Failed to search products" };
  }
});

// Add more endpoints as needed (e.g., get all dispensaries, get products by dispensary ID)
// router.get("/api/dispensaries", (ctx) => {... });

export default router;

6.3. Basic Frontend (public/index.html, public/script.js)Create a simple HTML page with JavaScript to fetch and display data from the backend API.HTML<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Dispensary Price Comparator</title>
    <link rel="stylesheet" href="styles.css">
</head>
<body>
    <h1>Dispensary Product Search</h1>
    <input type="text" id="searchInput" placeholder="Search for products...">
    <button id="searchButton">Search</button>

    <h2>Results</h2>
    <table id="resultsTable">
        <thead>
            <tr>
                <th>Product Name</th>
                <th>Price</th>
                <th>Size/Weight</th>
                <th>Dispensary</th>
                <th>Scraped At</th>
            </tr>
        </thead>
        <tbody id="resultsBody">
            </tbody>
    </table>

    <script src="script.js"></script>
</body>
</html>
JavaScript// src/web/public/script.js
const searchInput = document.getElementById('searchInput');
const searchButton = document.getElementById('searchButton');
const resultsBody = document.getElementById('resultsBody');

async function performSearch() {
    const query = searchInput.value.trim();
    if (!query) {
        resultsBody.innerHTML = '<tr><td colspan="5">Please enter a search term.</td></tr>';
        return;
    }

    resultsBody.innerHTML = '<tr><td colspan="5">Searching...</td></tr>';

    try {
        const response = await fetch(`/api/products/search?q=${encodeURIComponent(query)}`);
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const result = await response.json();

        if (result.error) {
             resultsBody.innerHTML = `<tr><td colspan="5">Error: ${result.error}</td></tr>`;
        } else if (result.data && result.data.length > 0) {
            displayResults(result.data);
        } else {
            resultsBody.innerHTML = '<tr><td colspan="5">No products found matching your search.</td></tr>';
        }
    } catch (error) {
        console.error('Search failed:', error);
        resultsBody.innerHTML = `<tr><td colspan="5">Failed to fetch results. See console for details.</td></tr>`;
    }
}

function displayResults(products) {
    resultsBody.innerHTML = ''; // Clear previous results
    products.forEach(product => {
        const row = resultsBody.insertRow();
        row.insertCell().textContent = product.product_name |
| 'N/A';
        row.insertCell().textContent = product.price |
| 'N/A';
        row.insertCell().textContent = product.weight_or_size |
| 'N/A';
        row.insertCell().textContent = product.dispensary_name |
| 'N/A';
        row.insertCell().textContent = product.scraped_at? new Date(product.scraped_at).toLocaleString() : 'N/A';
    });
}

searchButton.addEventListener('click', performSearch);
searchInput.addEventListener('keypress', (event) => {
    if (event.key === 'Enter') {
        performSearch();
    }
});

// Initial empty state
resultsBody.innerHTML = '<tr><td colspan="5">Enter a search term above.</td></tr>';

Add basic CSS in public/styles.css for presentation.7. Rust Integration (Optional Performance Optimization)7.1. RationaleWhile Deno (V8) is generally performant, if specific data processing tasks within the scraper (e.g., complex text analysis, heavy computations on scraped data before insertion, although less likely with LLM extraction) become bottlenecks, Rust can offer bare-metal speed.7.2. Foreign Function Interface (FFI) ApproachDeno's FFI allows calling functions from native dynamic libraries (.so on Linux, .dylib on macOS, .dll on Windows) compiled from languages like Rust.

Rust Code (src/rust_interop/src/lib.rs):

Define functions using extern "C" and #[no_mangle] to ensure C-compatible linkage.
Use C-compatible types (e.g., *const c_char for strings, primitive numbers).
Example: A hypothetical function to process scraped JSON data (though LLM extraction reduces the need for complex client-side parsing).
Rust// src/rust_interop/src/lib.rs
use std::os::raw::{c_char};
use std::ffi::{CString, CStr};

// Example: Simple string processing function
#[no_mangle]
pub extern "C" fn process_product_name(name_ptr: *const c_char) -> *mut c_char {
    let c_str = unsafe { CStr::from_ptr(name_ptr) };
    let name = match c_str.to_str() {
        Err(_) => "Error decoding name",
        Ok(string) => string,
    };

    let processed_name = format!("Processed: {}", name.to_uppercase());

    // IMPORTANT: Allocate memory that Deno can free later
    let c_string = CString::new(processed_name).unwrap();
    c_string.into_raw() // Deno needs to call a corresponding free function
}

// IMPORTANT: Provide a function to free memory allocated in Rust
#[no_mangle]
pub extern "C" fn free_rust_string(ptr: *mut c_char) {
    if!ptr.is_null() {
        unsafe {
            let _ = CString::from_raw(ptr); // Takes ownership and frees memory when dropped
        }
    }
}


Build the Rust code into a dynamic library: cargo build --release (library will be in target/release/).



Deno Code (src/rust_interop/rust_bindings.ts):

Load the library using Deno.dlopen.
Define function signatures matching the Rust exports.
Handle data marshalling (JS string -> Uint8Array -> Rust pointer; Rust pointer -> JS string).
Crucially, manage memory: Call the Rust free_rust_string function after using the string returned by process_product_name.

TypeScript// src/rust_interop/rust_bindings.ts
// --- Conceptual Example --- Requires --allow-ffi and potentially --unstable ---

// Determine library path based on OS
let libPath = "";
const libName = "librust_interop"; // Matches Cargo.toml name
switch (Deno.build.os) {
    case "windows":
        libPath = `./target/release/${libName}.dll`;
        break;
    case "darwin": // macOS
        libPath = `./target/release/${libName}.dylib`;
        break;
    case "linux":
        libPath = `./target/release/${libName}.so`;
        break;
    default:
         throw new Error(`Unsupported OS: ${Deno.build.os}`);
}

let dynamicLib: Deno.DynamicLibrary<{
    process_product_name: { parameters: ["buffer"], result: "pointer" };
    free_rust_string: { parameters: ["pointer"], result: "void" };
}> | null = null;

try {
    dynamicLib = Deno.dlopen(libPath, {
        process_product_name: { parameters: ["buffer"], result: "pointer" },
        free_rust_string: { parameters: ["pointer"], result: "void" },
    });
} catch (e) {
    console.error("Failed to load Rust library. Ensure it's compiled (cargo build --release).", e);
    // Fallback to JS implementation or handle error appropriately
}


export function callRustProcessor(productName: string): string | null {
    if (!dynamicLib) return `JS Fallback: ${productName.toUpperCase()}`; // Or throw error

    const encodedName = new TextEncoder().encode(productName + "\0"); // Null-terminate C strings
    const resultPtr = dynamicLib.symbols.process_product_name(encodedName);

    if (resultPtr === null) {
        console.error("Rust function returned null pointer.");
        return null;
    }

    // Read the C string from the pointer
    const resultView = new Deno.UnsafePointerView(resultPtr);
    const resultString = resultView.getCString();

    // IMPORTANT: Free the memory allocated by Rust
    dynamicLib.symbols.free_rust_string(resultPtr);

    return resultString;
}

// Remember to close the library when the application exits if needed
// globalThis.addEventListener("unload", () => {
//     dynamicLib?.close();
// });


7.3. Alternative: Firecrawl Rust SDKIf the core scraping logic itself is complex or if a Rust-centric workflow is preferred, consider using the official Firecrawl Rust SDK.5
Installation: Add firecrawl = "^1.0" and tokio = { version = "^1", features = ["full"] } to Cargo.toml.7
Initialization: let app = FirecrawlApp::new("fc-YOUR_API_KEY").expect("Failed initialization");.7
Usage (scrape_url):
Rustuse firecrawl::{FirecrawlApp, scrape::{ScrapeFormats, ScrapeOptions}};
use tokio; // Ensure tokio runtime for async

#[tokio::main]
async fn main() -> Result<(), Box<dyn std::error::Error>> {
    let api_key = std::env::var("FIRECRAWL_API_KEY").expect("FIRECRAWL_API_KEY not set");
    let app = FirecrawlApp::new(&api_key)?; // Use Result for error handling

    // Define options, e.g., request JSON format with schema (schema definition not shown here)
    let options = ScrapeOptions {
       formats: vec!.into(),
       json_options: Some(firecrawl::scrape::JsonOptions {
           // Define schema or prompt here
           schema: Some(serde_json::json!({ /* Your JSON Schema */ })),
          ..Default::default()
       }),
      ..Default::default()
    };

    let scrape_result = app.scrape_url("https://firecrawl.dev", options).await; // Use target URL

    match scrape_result {
        Ok(data) => {
            if let Some(extraction) = data.llm_extraction {
                // Process the extracted JSON data (extraction is serde_json::Value)
                println!("LLM Extraction: {}", extraction);
            } else {
                println!("Scrape successful, but no LLM extraction data found.");
            }
        }
        Err(e) => eprintln!("Scrape failed: {}", e),
    }
    Ok(())
}

Reference: 7
In this scenario, Deno might simply orchestrate the execution of the compiled Rust binary or communicate with a separate Rust service via IPC or HTTP.
8. Scheduling and Deployment8.1. Recurring ExecutionTo run the scraper periodically:
Method 1: System Cron (Recommended): On Linux or macOS, configure a cron job to execute the main scraper script at regular intervals (e.g., daily at 2 AM). This is robust for background tasks.
Bash# Example cron entry (edit with 'crontab -e')
# Runs daily at 2:00 AM
0 2 * * * /path/to/deno run --allow-net --allow-read --allow-write --allow-env /path/to/project-root/src/scraper/main_scraper.ts >> /path/to/project-root/scrape_cron.log 2>&1

Ensure Deno's path is correct and necessary permissions are granted. Redirecting output (>>... 2>&1) captures logs.
Method 2: Deno setInterval: If the Deno web server (server.ts) runs continuously, setInterval could trigger the scraping function within the server process. However, this is less reliable; if the server crashes or restarts, the schedule is interrupted. Not recommended for critical background jobs.
Frequency Considerations: Balance data freshness needs against Firecrawl API costs (credits) and rate limits. Scraping too frequently increases costs and risks hitting limits. Scraping infrequently might lead to stale pricing data. Daily or twice-daily runs might be a reasonable starting point.
8.2. Running the Web ServerTo keep the web interface accessible:
Process Manager: Use a process manager like pm2 (which has Deno support via pm2 start server.ts --interpreter deno -- run --allow-net --allow-read --allow-env) or configure a systemd service unit on Linux. These tools ensure the server process restarts automatically if it crashes and runs persistently in the background.
Manual Start: For simple local testing, run deno run --allow-net --allow-read --allow-env src/web/server.ts.
8.3. Local Deployment Steps
Server Setup: Ensure the target local server (Linux, macOS, or Windows) has Deno (and Rust, if using FFI) installed.
Clone Repository: Clone the project code onto the server using Git.
Configuration: Create the .env file on the server with the correct Firecrawl API key and database path. Place the target_dispensaries.json file.
Database Initialization: Run the database setup script once: deno run --allow-read --allow-write src/db/setup_db.ts.
Build Rust (if applicable): Run cargo build --release in the src/rust_interop directory.
Configure Cron: Set up the cron job as described in 8.1 to run src/scraper/main_scraper.ts.
Configure Process Manager: Set up pm2 or systemd to run src/web/server.ts.
Firewall: Ensure the server's firewall allows incoming connections on the specified port (e.g., 8000) if access from other machines on the local network is desired.
9. Conclusion and Recommendations9.1. SummaryThis plan details the architecture and implementation steps for creating a recurring web scraping application using Deno, Firecrawl API, and SQLite to gather and compare cannabis product prices from Dutchie-powered websites. It covers finding target sites, leveraging Firecrawl's JSON extraction for robust data capture, storing data locally in SQLite, providing a basic web interface with Oak, optionally optimizing with Rust FFI, and deploying the system locally with scheduled execution.9.2. CRITICAL Reiteration of Risks and RecommendationThe most significant barrier to this project is the legal and contractual restrictions imposed by Dutchie. Their Terms of Service explicitly prohibit scraping and automated data extraction.8 Proceeding with this project directly violates these terms and carries substantial legal risks, including potential termination of service and legal action.Recommendation: Do not proceed with scraping Dutchie websites without obtaining explicit written permission from Dutchie or consulting with legal counsel specializing in technology agreements and data scraping. This technical plan should be considered purely hypothetical unless these legal constraints are demonstrably overcome. Exploring alternative data sources or APIs, if available and permissible, is strongly advised.9.3. Monitoring and Maintenance
Firecrawl Credits: Regularly monitor API credit consumption via the Firecrawl dashboard or potentially through API wrappers that track usage 32 to avoid unexpected costs or service interruptions. Adjust scraping frequency or plan based on usage.
Scraping Logs: Check the scrape_log table or file frequently for errors. Investigate recurring failures for specific URLs.
Website Changes: Even with LLM extraction, major website redesigns can break scraping. Periodically review target sites and test the scraper's output.
Dependencies: Keep Deno, Oak, deno-sqlite, and other dependencies updated using Deno's tooling (deno cache --reload).
9.4. Future EnhancementsIf the legal hurdles were overcome and the basic application is functional, potential future enhancements include:
Advanced Frontend: Implement more sophisticated UI features like filtering by dispensary/category/brand, sorting by price, charting price trends over time.
User Features: Add user accounts to save favorite products or searches.
Price Alerts: Develop a system to notify users of price drops for specific products.
Broader Data Sources: Extend the scraper to support other (legally permissible) dispensary platforms or data sources.
Advanced Firecrawl Features: Explore Firecrawl's /crawl endpoint for discovering and scraping entire sites 3, /map for site structure analysis 3, /search for targeted web searches 35, or batch scraping for efficiency.2
