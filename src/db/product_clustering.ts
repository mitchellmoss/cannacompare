/**
 * Product clustering and similarity calculation utilities
 */
import { getDb } from "./database.ts";
import { getProductById } from "./database.ts";
import { getProductEmbedding, calculateSimilarity } from "./embeddings.ts";
import { ProductSchema, SimilarProductResult } from "../shared/types.ts";

// Constants
const SIMILARITY_THRESHOLD = Number(Deno.env.get("SIMILARITY_THRESHOLD") || 0.7);

// In-memory storage for product similarities when SQLite isn't working
const similarityCache: Record<number, { id: number; similarity: number; product_name: string; price: string; weight_or_size?: string; dispensary_name: string }[]> = {};

/**
 * Calculate and store similarities between products in the database
 * @param productId The ID of the source product
 * @param similarProductIds Array of potentially similar product IDs
 * @param similarityThreshold Minimum similarity score (0-1) to store
 */
export async function calculateAndStoreSimilarities(
  productId: number,
  similarProductIds: number[],
  similarityThreshold = SIMILARITY_THRESHOLD
): Promise<void> {
  // Use JSON storage getProductById instead
  const getProduct = (await import("./json_storage.ts")).getProductById;
  
  try {
    const sourceProduct = getProduct(productId);
    
    if (!sourceProduct) {
      throw new Error(`Product with ID ${productId} not found`);
    }
    
    // If source product doesn't have embedding, generate it
    if (!sourceProduct.embedding) {
      try {
        sourceProduct.embedding = await getProductEmbedding(sourceProduct);
        
        // We can't easily update the embedding in JSON storage
        // For now, we'll just keep it in memory
      } catch (error) {
        console.error(`Failed to generate embedding for product ${productId}:`, error);
        return;
      }
    }
    
    // Calculate similarities for each product
    const similarProducts: SimilarProductResult[] = [];
    
    for (const similarId of similarProductIds) {
      // Skip self-comparison
      if (similarId === productId) continue;
      
      const similarProduct = getProduct(similarId);
      if (!similarProduct) continue;
      
      // Generate embedding if missing
      if (!similarProduct.embedding) {
        try {
          similarProduct.embedding = await getProductEmbedding(similarProduct);
          // Can't update JSON storage easily
        } catch (error) {
          console.error(`Failed to generate embedding for product ${similarId}:`, error);
          continue;
        }
      }
      
      // Calculate similarity
      const similarity = calculateSimilarity(
        sourceProduct.embedding, 
        similarProduct.embedding
      );
      
      // Only store if above threshold
      if (similarity >= similarityThreshold) {
        similarProducts.push({
          id: similarId,
          similarity,
          product_name: similarProduct.product_name,
          price: similarProduct.price,
          weight_or_size: similarProduct.weight_or_size,
          dispensary_name: similarProduct.dispensary_name
        });
      }
    }
    
    // Sort by similarity (highest first)
    similarProducts.sort((a, b) => b.similarity - a.similarity);
    
    // Store in cache
    similarityCache[productId] = similarProducts;
    
    // Try to store in database as well if available
    try {
      const db = getDb();
      
      // Begin transaction for bulk inserts
      await db.query("BEGIN TRANSACTION");
      
      // Clear existing similarities for this product
      await db.query(
        "DELETE FROM product_similarities WHERE product_id = ?",
        [productId]
      );
      
      // Insert new similarities
      for (const similar of similarProducts) {
        await db.query(
          "INSERT OR REPLACE INTO product_similarities (product_id, similar_product_id, similarity_score) VALUES (?, ?, ?)",
          [productId, similar.id, similar.similarity]
        );
      }
      
      await db.query("COMMIT");
    } catch (error) {
      console.log("SQLite database error, using in-memory cache only:", error);
    }
  } catch (error) {
    console.error("Error calculating similarities:", error);
    throw error;
  }
}

/**
 * Get similar products for a given product ID from the database
 * @param productId The ID of the product to find similarities for
 * @param limit Maximum number of similar products to return
 * @returns Array of similar products with similarity scores
 */
export async function getSimilarProducts(productId: number, limit = 5): Promise<SimilarProductResult[]> {
  try {
    // First check if we have it in cache
    if (similarityCache[productId] && similarityCache[productId].length > 0) {
      return similarityCache[productId].slice(0, limit);
    }
    
    // Try to get from database
    try {
      const db = getDb();
      
      const query = `
        SELECT 
          ps.similar_product_id as id,
          ps.similarity_score as similarity,
          p.product_name,
          p.price,
          p.weight_or_size,
          d.name as dispensary_name
        FROM product_similarities ps
        JOIN products p ON ps.similar_product_id = p.id
        JOIN dispensaries d ON p.dispensary_id = d.id
        WHERE ps.product_id = ?
        ORDER BY ps.similarity_score DESC
        LIMIT ?
      `;
      
      const results = await db.query(query, [productId, limit]);
      
      if (results && Array.isArray(results) && results.length > 0) {
        const mappedResults = results.map(row => ({
          id: row.id,
          similarity: row.similarity,
          product_name: row.product_name,
          price: row.price,
          weight_or_size: row.weight_or_size,
          dispensary_name: row.dispensary_name
        }));
        
        // Cache the results
        similarityCache[productId] = mappedResults;
        
        return mappedResults;
      }
    } catch (error) {
      console.log("SQLite database error, falling back to in-memory cache:", error);
    }
    
    // Return from cache or empty array
    return similarityCache[productId] || [];
  } catch (error) {
    console.error(`Error getting similar products for ${productId}:`, error);
    return [];
  }
}

/**
 * Compute similarities for all products (full clustering)
 * This is a computationally expensive operation and should be run as a background job
 * @param batchSize Process products in batches of this size to avoid memory issues
 * @param similarityThreshold Minimum similarity score to store
 */
export async function computeAllSimilarities(
  batchSize = 100, 
  similarityThreshold = SIMILARITY_THRESHOLD
): Promise<void> {
  // Use JSON storage search to get all products
  const searchAll = (await import("./json_storage.ts")).searchProductsByName;
  
  const allProducts = searchAll("");
  const productIds = allProducts.map(p => p.id!).filter(id => id !== undefined);
  const totalProducts = productIds.length;
  
  console.log(`Starting similarity computation for ${totalProducts} products`);
  
  // Process in batches
  for (let i = 0; i < productIds.length; i += batchSize) {
    const batchIds = productIds.slice(i, i + batchSize);
    console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(totalProducts/batchSize)}`);
    
    // Process each product in the batch
    for (const productId of batchIds) {
      try {
        await calculateAndStoreSimilarities(
          productId,
          productIds.filter(id => id !== productId), // Compare to all other products
          similarityThreshold
        );
      } catch (error) {
        console.error(`Error processing product ${productId}:`, error);
        // Continue with the next product
      }
    }
  }
  
  console.log("Similarity computation complete");
}