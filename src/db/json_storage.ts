/**
 * Simple JSON file-based storage implementation
 * Used as an alternative to SQLite due to compatibility issues
 */

import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema, ProductQueryResult } from "../shared/types.ts";
import { ensureDir } from "https://deno.land/std@0.218.2/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.218.2/path/mod.ts";
import { 
  getEmbedding, 
  formatProductForEmbedding, 
  cosineSimilarity 
} from "../shared/embeddings_service.ts";

// Load environment variables
const env = await load();
const DATA_DIR = "./data";
const DISPENSARIES_FILE = join(DATA_DIR, "dispensaries.json");
const PRODUCTS_FILE = join(DATA_DIR, "products.json");
const ERRORS_FILE = join(DATA_DIR, "errors.json");
const EMBEDDINGS_FILE = join(DATA_DIR, "embeddings.json");
const EMBEDDING_MODEL = env.EMBEDDING_MODEL || "gemini-embedding-exp-03-07";
const SIMILARITY_THRESHOLD = Number(env.SIMILARITY_THRESHOLD) || 0.7;

// Data structure
interface Dispensary {
  id: number;
  name: string;
  menu_url: string;
  last_scraped_at?: string;
}

interface Product {
  id: number;
  dispensary_id: number;
  product_name: string;
  price: string;
  weight_or_size?: string;
  scraped_at: string;
}

interface ProductEmbedding {
  id: number;
  product_id: number;
  embedding: number[];
  embedding_model: string;
  created_at: string;
}

interface ErrorLog {
  id: number;
  dispensary_id?: number;
  url?: string;
  error_message: string;
  log_time: string;
}

// Make sure data directory exists
await ensureDir(DATA_DIR);

/**
 * Initialize the data files if they don't exist
 */
export function setupDatabase(): void {
  try {
    // Create dispensaries file if it doesn't exist
    try {
      Deno.statSync(DISPENSARIES_FILE);
    } catch {
      Deno.writeTextFileSync(DISPENSARIES_FILE, JSON.stringify([], null, 2));
    }

    // Create products file if it doesn't exist
    try {
      Deno.statSync(PRODUCTS_FILE);
    } catch {
      Deno.writeTextFileSync(PRODUCTS_FILE, JSON.stringify([], null, 2));
    }

    // Create embeddings file if it doesn't exist
    try {
      Deno.statSync(EMBEDDINGS_FILE);
    } catch {
      Deno.writeTextFileSync(EMBEDDINGS_FILE, JSON.stringify([], null, 2));
    }

    // Create errors file if it doesn't exist
    try {
      Deno.statSync(ERRORS_FILE);
    } catch {
      Deno.writeTextFileSync(ERRORS_FILE, JSON.stringify([], null, 2));
    }

    console.log("JSON database storage initialized.");
  } catch (error) {
    console.error("Error setting up JSON storage:", error);
    throw error;
  }
}

/**
 * Close database (not needed for JSON storage)
 */
export function closeDb(): void {
  // No connections to close
}

// Helper functions
export function readJsonFile<T>(filePath: string): T {
  const content = Deno.readTextFileSync(filePath);
  return JSON.parse(content) as T;
}

function writeJsonFile<T>(filePath: string, data: T): void {
  Deno.writeTextFileSync(filePath, JSON.stringify(data, null, 2));
}

function getCurrentTimestamp(): string {
  return new Date().toISOString();
}

function getNextId<T extends { id: number }>(items: T[]): number {
  if (items.length === 0) return 1;
  return Math.max(...items.map(item => item.id)) + 1;
}

// Dispensary Operations
export function getOrInsertDispensary(name: string, menuUrl: string): number {
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  
  // Check if dispensary already exists
  const existing = dispensaries.find(d => d.menu_url === menuUrl);
  if (existing) {
    return existing.id;
  }
  
  // Create new dispensary
  const newId = getNextId(dispensaries);
  const newDispensary: Dispensary = {
    id: newId,
    name,
    menu_url: menuUrl
  };
  
  dispensaries.push(newDispensary);
  writeJsonFile(DISPENSARIES_FILE, dispensaries);
  
  return newId;
}

export function updateDispensaryScrapeTime(dispensaryId: number): void {
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  const index = dispensaries.findIndex(d => d.id === dispensaryId);
  
  if (index !== -1) {
    dispensaries[index].last_scraped_at = getCurrentTimestamp();
    writeJsonFile(DISPENSARIES_FILE, dispensaries);
  }
}

// Product Operations
export function insertProducts(dispensaryId: number, productsData: ProductSchema[]): void {
  if (!productsData || productsData.length === 0) {
    return;
  }
  
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const timestamp = getCurrentTimestamp();
  let nextId = getNextId(products);
  
  const newProducts = productsData.map(p => {
    const product: Product = {
      id: nextId++,
      dispensary_id: dispensaryId,
      product_name: p.product_name,
      price: p.price,
      weight_or_size: p.weight_or_size,
      scraped_at: timestamp
    };
    return product;
  });
  
  products.push(...newProducts);
  writeJsonFile(PRODUCTS_FILE, products);
  
  console.log(`Inserted ${newProducts.length} products for dispensary ID ${dispensaryId}`);
}

export function clearProductsForDispensary(dispensaryId: number): void {
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const filteredProducts = products.filter(p => p.dispensary_id !== dispensaryId);
  
  // Also clear any associated embeddings
  const embeddings = readJsonFile<ProductEmbedding[]>(EMBEDDINGS_FILE);
  const productIds = products
    .filter(p => p.dispensary_id === dispensaryId)
    .map(p => p.id);
  
  const filteredEmbeddings = embeddings.filter(e => !productIds.includes(e.product_id));
  
  writeJsonFile(PRODUCTS_FILE, filteredProducts);
  writeJsonFile(EMBEDDINGS_FILE, filteredEmbeddings);
  
  console.log(`Cleared old products for dispensary ID ${dispensaryId}`);
}

// Embedding Operations
/**
 * Generate and store embeddings for a product
 */
export async function generateAndStoreEmbedding(productId: number): Promise<boolean> {
  // Check if product exists
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const product = products.find(p => p.id === productId);
  
  if (!product) {
    console.error(`Product with ID ${productId} not found`);
    return false;
  }
  
  // Format product text for embedding
  const productText = formatProductForEmbedding(product.product_name, product.weight_or_size);
  
  // Generate embedding using the embeddings service
  const embedding = await getEmbedding(productText);
  if (!embedding) {
    console.error(`Failed to generate embedding for product ${productId}`);
    return false;
  }
  
  try {
    const embeddings = readJsonFile<ProductEmbedding[]>(EMBEDDINGS_FILE);
    
    // Convert Float32Array to regular array for JSON storage
    const embeddingArray = Array.from(embedding);
    
    // Check if embedding already exists for this product
    const existingIndex = embeddings.findIndex(e => e.product_id === productId);
    
    if (existingIndex !== -1) {
      // Update existing embedding
      embeddings[existingIndex] = {
        ...embeddings[existingIndex],
        embedding: embeddingArray,
        embedding_model: EMBEDDING_MODEL,
        created_at: getCurrentTimestamp()
      };
    } else {
      // Insert new embedding
      const newEmbedding: ProductEmbedding = {
        id: getNextId(embeddings),
        product_id: productId,
        embedding: embeddingArray,
        embedding_model: EMBEDDING_MODEL,
        created_at: getCurrentTimestamp()
      };
      
      embeddings.push(newEmbedding);
    }
    
    writeJsonFile(EMBEDDINGS_FILE, embeddings);
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
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const embeddings = readJsonFile<ProductEmbedding[]>(EMBEDDINGS_FILE);
  
  // Find products without embeddings
  const productsWithEmbeddings = new Set(embeddings.map(e => e.product_id));
  const productsToProcess = products
    .filter(p => !productsWithEmbeddings.has(p.id))
    .slice(0, limit);
  
  let successCount = 0;
  
  for (const product of productsToProcess) {
    const success = await generateAndStoreEmbedding(product.id);
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
  const embeddings = readJsonFile<ProductEmbedding[]>(EMBEDDINGS_FILE);
  const embedding = embeddings.find(e => e.product_id === productId);
  
  if (!embedding) {
    return null;
  }
  
  return new Float32Array(embedding.embedding);
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
): (ProductQueryResult & { id: number })[] {
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  const embeddings = readJsonFile<ProductEmbedding[]>(EMBEDDINGS_FILE);
  
  // Calculate similarity scores
  type ProductWithScore = ProductQueryResult & { id: number; score: number };
  const productsWithScores: ProductWithScore[] = [];
  
  for (const embedding of embeddings) {
    // Skip the original product if we're looking for similar products to an existing one
    if (excludeProductId && embedding.product_id === excludeProductId) {
      continue;
    }
    
    const product = products.find(p => p.id === embedding.product_id);
    if (!product) continue;
    
    const dispensary = dispensaries.find(d => d.id === product.dispensary_id);
    if (!dispensary) continue;
    
    const productEmbedding = new Float32Array(embedding.embedding);
    const score = cosineSimilarity(targetEmbedding, productEmbedding);
    
    if (score >= threshold) {
      productsWithScores.push({
        id: product.id,
        product_name: product.product_name,
        price: product.price,
        weight_or_size: product.weight_or_size,
        scraped_at: product.scraped_at,
        dispensary_name: dispensary.name,
        score
      });
    }
  }
  
  // Sort by similarity score (highest first) and take the top results
  productsWithScores.sort((a, b) => b.score - a.score);
  
  // Take top results but keep the id property
  return productsWithScores.slice(0, limit).map(({ score, ...product }) => product);
}

// Search/Query Operations
export function searchProductsByName(searchTerm: string): (ProductQueryResult & { id: number })[] {
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  
  const lowerSearchTerm = searchTerm.toLowerCase();
  const results = products
    .filter(p => p.product_name.toLowerCase().includes(lowerSearchTerm))
    .map(p => {
      const dispensary = dispensaries.find(d => d.id === p.dispensary_id);
      return {
        id: p.id,
        product_name: p.product_name,
        price: p.price,
        weight_or_size: p.weight_or_size,
        scraped_at: p.scraped_at,
        dispensary_name: dispensary?.name || 'Unknown'
      };
    });
  
  return results;
}

/**
 * Get product by ID with full details
 */
export function getProductById(productId: number): (ProductQueryResult & { id: number }) | null {
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  
  const product = products.find(p => p.id === productId);
  if (!product) return null;
  
  const dispensary = dispensaries.find(d => d.id === product.dispensary_id);
  if (!dispensary) return null;
  
  return {
    id: product.id,
    product_name: product.product_name,
    price: product.price,
    weight_or_size: product.weight_or_size,
    scraped_at: product.scraped_at,
    dispensary_name: dispensary.name
  };
}

export function getAllDispensaries() {
  return readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
}

export function getProductsByDispensary(dispensaryId: number): ProductQueryResult[] {
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  
  const dispensary = dispensaries.find(d => d.id === dispensaryId);
  if (!dispensary) return [];
  
  return products
    .filter(p => p.dispensary_id === dispensaryId)
    .map(p => ({
      product_name: p.product_name,
      price: p.price,
      weight_or_size: p.weight_or_size,
      scraped_at: p.scraped_at,
      dispensary_name: dispensary.name
    }));
}

// Logging Operations
export function logScrapeError(errorMessage: string, url?: string, dispensaryId?: number): void {
  const errors = readJsonFile<ErrorLog[]>(ERRORS_FILE);
  
  const newError: ErrorLog = {
    id: getNextId(errors),
    dispensary_id: dispensaryId,
    url,
    error_message: errorMessage,
    log_time: getCurrentTimestamp()
  };
  
  errors.push(newError);
  writeJsonFile(ERRORS_FILE, errors);
}

export function getRecentErrors(limit = 100) {
  const errors = readJsonFile<ErrorLog[]>(ERRORS_FILE);
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  
  return errors
    .sort((a, b) => new Date(b.log_time).getTime() - new Date(a.log_time).getTime())
    .slice(0, limit)
    .map(e => {
      const dispensary = e.dispensary_id 
        ? dispensaries.find(d => d.id === e.dispensary_id) 
        : undefined;
      
      return {
        ...e,
        dispensary_name: dispensary?.name
      };
    });
}