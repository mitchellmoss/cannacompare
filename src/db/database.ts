import { DB } from "https://deno.land/x/sqlite@v3.8/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema, ProductQueryResult } from "../shared/types.ts";

// Load environment variables
const env = await load();
const DATABASE_PATH = env.DATABASE_PATH || "./dispensary_data.db";

// Database singleton instance
let db: DB;

/**
 * Get database instance (creates if it doesn't exist)
 */
function getDb(): DB {
  if (!db) {
    db = new DB(DATABASE_PATH);
    // Enable WAL mode for better concurrency if the web server writes often
    // db.execute("PRAGMA journal_mode = WAL;");
  }
  return db;
}

/**
 * Close the database connection
 */
export function closeDb(): void {
  if (db) {
    db.close();
    db = undefined as unknown as DB;
  }
}

/**
 * Set up the database schema
 */
export function setupDatabase(): void {
  const dbInstance = getDb();
  const schemaSql = Deno.readTextFileSync("./src/db/schema.sql");
  dbInstance.execute(schemaSql);
  console.log("Database schema initialized/verified.");
}

// ---- Dispensary Operations ----

/**
 * Get an existing dispensary or create a new one
 */
export function getOrInsertDispensary(name: string, menuUrl: string): number {
  const dbInstance = getDb();
  let dispensaryId: number;

  // Try to find existing
  const existing = dbInstance.query<[number]>(
    "SELECT id FROM dispensaries WHERE menu_url = ?",
    [menuUrl]
  );
  
  if (existing.length > 0) {
    dispensaryId = existing[0][0];
  } else {
    // Insert new
    dbInstance.query(
      "INSERT INTO dispensaries (name, menu_url) VALUES (?, ?)",
      [name, menuUrl]
    );
    
    // Get the new ID
    const newEntry = dbInstance.query<[number]>("SELECT last_insert_rowid()");
    if (newEntry.length > 0) {
      dispensaryId = newEntry[0][0];
    } else {
      throw new Error("Failed to retrieve ID after inserting dispensary.");
    }
  }
  
  return dispensaryId;
}

/**
 * Update the last scraped timestamp for a dispensary
 */
export function updateDispensaryScrapeTime(dispensaryId: number): void {
  const dbInstance = getDb();
  dbInstance.query(
    "UPDATE dispensaries SET last_scraped_at = datetime('now') WHERE id = ?",
    [dispensaryId]
  );
}

// ---- Product Operations ----

/**
 * Insert multiple products for a dispensary
 */
export function insertProducts(dispensaryId: number, products: ProductSchema[]): void {
  if (!products || products.length === 0) {
    return; // Nothing to insert
  }
  
  const dbInstance = getDb();
  
  // Use a transaction for bulk inserts
  dbInstance.transaction(() => {
    const insertStmt = dbInstance.prepareQuery<[number, string, string, string | null]>(
      "INSERT INTO products (dispensary_id, product_name, price, weight_or_size) VALUES (?, ?, ?, ?)"
    );
    
    for (const product of products) {
      insertStmt.execute([
        dispensaryId,
        product.product_name,
        product.price,
        product.weight_or_size || null // Handle optional field
      ]);
    }
    
    insertStmt.finalize(); // Close the prepared statement
  });
  
  console.log(`Inserted ${products.length} products for dispensary ID ${dispensaryId}`);
}

/**
 * Clear old products for a dispensary before inserting new ones
 */
export function clearProductsForDispensary(dispensaryId: number): void {
  const dbInstance = getDb();
  dbInstance.query("DELETE FROM products WHERE dispensary_id = ?", [dispensaryId]);
  console.log(`Cleared old products for dispensary ID ${dispensaryId}`);
}

// ---- Search/Query Operations (for Web UI) ----

/**
 * Search products by name
 */
export function searchProductsByName(searchTerm: string): ProductQueryResult[] {
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
    WHERE p.product_name LIKE ?
    ORDER BY d.name, p.product_name
  `;
  
  // Use '%' wildcards for partial matching
  const results = dbInstance.queryEntries<ProductQueryResult>(
    query, 
    [`%${searchTerm}%`]
  );
  
  return results;
}

/**
 * Get all dispensaries
 */
export function getAllDispensaries() {
  const dbInstance = getDb();
  return dbInstance.queryEntries(
    "SELECT id, name, menu_url, last_scraped_at FROM dispensaries ORDER BY name"
  );
}

/**
 * Get products by dispensary ID
 */
export function getProductsByDispensary(dispensaryId: number): ProductQueryResult[] {
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
    WHERE p.dispensary_id = ?
    ORDER BY p.product_name
  `;
  
  return dbInstance.queryEntries<ProductQueryResult>(query, [dispensaryId]);
}

// ---- Logging Operations ----

/**
 * Log scraping errors
 */
export function logScrapeError(errorMessage: string, url?: string, dispensaryId?: number): void {
  const dbInstance = getDb();
  dbInstance.query(
    "INSERT INTO scrape_log (dispensary_id, url, error_message) VALUES (?, ?, ?)",
    [dispensaryId || null, url || null, errorMessage]
  );
}

/**
 * Get recent scrape errors
 */
export function getRecentErrors(limit = 100) {
  const dbInstance = getDb();
  return dbInstance.queryEntries(
    `SELECT 
      s.id, 
      s.error_message, 
      s.url, 
      s.log_time, 
      d.name as dispensary_name 
    FROM scrape_log s
    LEFT JOIN dispensaries d ON s.dispensary_id = d.id
    ORDER BY s.log_time DESC
    LIMIT ?`,
    [limit]
  );
}