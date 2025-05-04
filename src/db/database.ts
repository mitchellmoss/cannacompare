import { DB } from "https://deno.land/x/sqlite@v3.1.1/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema, ProductQueryResult } from "../shared/types.ts";
import { 
  getEmbedding, 
  formatProductForEmbedding, 
  serializeEmbedding, 
  deserializeEmbedding, 
  cosineSimilarity 
} from "../shared/embeddings_service.ts";

// Load environment variables
const env = await load();
const DATABASE_PATH = env.DATABASE_PATH || "./dispensary_data.db";
const EMBEDDING_MODEL = env.EMBEDDING_MODEL || "gemini-embedding-exp-03-07";
const SIMILARITY_THRESHOLD = Number(env.SIMILARITY_THRESHOLD) || 0.7;

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
  dbInstance.query("BEGIN TRANSACTION");
  
  try {
    const insertQuery = 
      "INSERT INTO products (dispensary_id, product_name, price, weight_or_size) VALUES (?, ?, ?, ?)";
    
    for (const product of products) {
      dbInstance.query(insertQuery, [
        dispensaryId,
        product.product_name,
        product.price,
        product.weight_or_size || null // Handle optional field
      ]);
    }
    
    dbInstance.query("COMMIT");
    console.log(`Inserted ${products.length} products for dispensary ID ${dispensaryId}`);
  } catch (error) {
    dbInstance.query("ROLLBACK");
    console.error("Error inserting products:", error);
    throw error;
  }
}

/**
 * Clear old products for a dispensary before inserting new ones
 */
export function clearProductsForDispensary(dispensaryId: number): void {
  const dbInstance = getDb();
  dbInstance.query("DELETE FROM products WHERE dispensary_id = ?", [dispensaryId]);
  console.log(`Cleared old products for dispensary ID ${dispensaryId}`);
}

// ---- Embedding Operations ----

/**
 * Generate and store embeddings for a product
 */
export async function generateAndStoreEmbedding(productId: number): Promise<boolean> {
  const dbInstance = getDb();
  
  // Check if product exists
  const productResult = dbInstance.query<[number, string, string | null]>(
    "SELECT id, product_name, weight_or_size FROM products WHERE id = ?",
    [productId]
  );
  
  if (productResult.length === 0) {
    console.error(`Product with ID ${productId} not found`);
    return false;
  }
  
  const [id, productName, weightOrSize] = productResult[0];
  
  // Format product text for embedding
  const productText = formatProductForEmbedding(productName, weightOrSize ?? undefined);
  
  // Generate embedding using the embeddings service
  const embedding = await getEmbedding(productText);
  if (!embedding) {
    console.error(`Failed to generate embedding for product ${productId}`);
    return false;
  }
  
  try {
    const serializedEmbedding = serializeEmbedding(embedding);
    
    // Check if embedding already exists for this product
    const existingResult = dbInstance.query<[number]>(
      "SELECT id FROM product_embeddings WHERE product_id = ?",
      [productId]
    );
    
    if (existingResult.length > 0) {
      // Update existing embedding
      dbInstance.query(
        "UPDATE product_embeddings SET embedding = ?, embedding_model = ?, created_at = datetime('now') WHERE product_id = ?",
        [serializedEmbedding, EMBEDDING_MODEL, productId]
      );
    } else {
      // Insert new embedding
      dbInstance.query(
        "INSERT INTO product_embeddings (product_id, embedding, embedding_model) VALUES (?, ?, ?)",
        [productId, serializedEmbedding, EMBEDDING_MODEL]
      );
    }
    
    return true;
  } catch (error) {
    console.error(`Error storing embedding for product ${productId}:`, error);
    return false;
  }
}

/**
 * Generate embeddings for products without them
 * @param limit - Maximum number of products to process in one batch
 */
export async function generateMissingEmbeddings(limit = 50): Promise<number> {
  const dbInstance = getDb();
  
  // Find products without embeddings
  const productsQuery = `
    SELECT p.id 
    FROM products p 
    LEFT JOIN product_embeddings pe ON p.id = pe.product_id 
    WHERE pe.id IS NULL
    LIMIT ?
  `;
  
  const productsToProcess = dbInstance.query<[number]>(productsQuery, [limit]);
  let successCount = 0;
  
  for (const [productId] of productsToProcess) {
    const success = await generateAndStoreEmbedding(productId);
    if (success) successCount++;
    
    // Small delay to avoid rate limiting
    if (productsToProcess.length > 10) {
      await new Promise(resolve => setTimeout(resolve, 100));
    }
  }
  
  return successCount;
}

/**
 * Get embedding for a product by ID
 */
export function getProductEmbedding(productId: number): Float32Array | null {
  const dbInstance = getDb();
  
  const result = dbInstance.query<[Uint8Array]>(
    "SELECT embedding FROM product_embeddings WHERE product_id = ?",
    [productId]
  );
  
  if (result.length === 0) {
    return null;
  }
  
  return deserializeEmbedding(result[0][0]);
}

/**
 * Find similar products based on a query text
 * @param queryText - Text to find similar products to
 * @param limit - Maximum number of similar products to return
 * @param threshold - Similarity threshold (0-1)
 */
export async function findSimilarProducts(
  queryText: string,
  limit = 5,
  threshold = SIMILARITY_THRESHOLD
): Promise<ProductQueryResult[]> {
  // Generate embedding for the query
  const queryEmbedding = await getEmbedding(queryText, true);
  if (!queryEmbedding) {
    console.error("Failed to generate query embedding");
    return [];
  }
  
  return findSimilarProductsByEmbedding(queryEmbedding, limit, threshold);
}

/**
 * Find similar products to an existing product
 */
export async function findSimilarProductsById(
  productId: number,
  limit = 5,
  threshold = SIMILARITY_THRESHOLD
): Promise<ProductQueryResult[]> {
  // Get the product's embedding
  const productEmbedding = getProductEmbedding(productId);
  if (!productEmbedding) {
    console.error(`No embedding found for product ${productId}`);
    return [];
  }
  
  return findSimilarProductsByEmbedding(productEmbedding, limit, threshold, productId);
}

/**
 * Helper function to find similar products using an embedding
 */
export function findSimilarProductsByEmbedding(
  targetEmbedding: Float32Array,
  limit = 5,
  threshold = SIMILARITY_THRESHOLD,
  excludeProductId?: number
): ProductQueryResult[] {
  const dbInstance = getDb();

  // Get all product embeddings
  const query = `
    SELECT 
      pe.product_id,
      pe.embedding,
      p.product_name,
      p.price,
      p.weight_or_size,
      p.scraped_at,
      d.name as dispensary_name
    FROM product_embeddings pe
    JOIN products p ON pe.product_id = p.id
    JOIN dispensaries d ON p.dispensary_id = d.id
  `;
  
  const results = dbInstance.query<[number, Uint8Array, string, string, string | null, string, string]>(query);
  
  // Calculate similarity scores
  type ProductWithScore = ProductQueryResult & { score: number };
  const productsWithScores: ProductWithScore[] = [];
  
  for (const [productId, embeddingBytes, productName, price, weightOrSize, scrapedAt, dispensaryName] of results) {
    // Skip the original product if we're looking for similar products to an existing one
    if (excludeProductId && productId === excludeProductId) {
      continue;
    }
    
    const embedding = deserializeEmbedding(embeddingBytes);
    const score = cosineSimilarity(targetEmbedding, embedding);
    
    if (score >= threshold) {
      productsWithScores.push({
        product_name: productName,
        price,
        weight_or_size: weightOrSize ?? undefined,
        scraped_at: scrapedAt,
        dispensary_name: dispensaryName,
        score
      });
    }
  }
  
  // Sort by similarity score (highest first) and take the top results
  productsWithScores.sort((a, b) => b.score - a.score);
  
  // Remove the score property from the results
  return productsWithScores.slice(0, limit).map(({ score, ...product }) => product);
}

// ---- Search/Query Operations (for Web UI) ----

/**
 * Search products by name
 */
export function searchProductsByName(searchTerm: string): ProductQueryResult[] {
  const dbInstance = getDb();
  const query = `
    SELECT
      p.id,
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
  const results = dbInstance.queryEntries<ProductQueryResult & { id: number }>(
    query, 
    [`%${searchTerm}%`]
  );
  
  // Remove the id property from the results to match the ProductQueryResult interface
  return results.map(({ id, ...product }) => product);
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

/**
 * Get product by ID with full details
 */
export function getProductById(productId: number): (ProductQueryResult & { id: number }) | null {
  const dbInstance = getDb();
  const query = `
    SELECT
      p.id,
      p.product_name,
      p.price,
      p.weight_or_size,
      p.scraped_at,
      d.name as dispensary_name
    FROM products p
    JOIN dispensaries d ON p.dispensary_id = d.id
    WHERE p.id = ?
  `;
  
  const results = dbInstance.queryEntries<ProductQueryResult & { id: number }>(query, [productId]);
  return results.length > 0 ? results[0] : null;
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