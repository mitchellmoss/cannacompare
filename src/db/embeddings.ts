/**
 * Google Embeddings API integration for product clustering
 */
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema } from "../shared/types.ts";

// Load environment variables
const env = await load();
const GOOGLE_API_KEY = env.GOOGLE_API_KEY;
const EMBEDDINGS_MODEL = env.EMBEDDING_MODEL || "gemini-embedding-exp-03-07";
const EMBEDDINGS_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDINGS_MODEL}:embedContent`;

/**
 * Get text embeddings from Google's Gemini API
 * @param text The text to generate embeddings for
 * @returns An array of floating-point numbers representing the embedding
 */
export async function getEmbeddings(text: string): Promise<number[]> {
  if (!GOOGLE_API_KEY) {
    throw new Error("GOOGLE_API_KEY not found in environment variables");
  }

  try {
    const response = await fetch(`${EMBEDDINGS_API_URL}?key=${GOOGLE_API_KEY}`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        content: {
          parts: [
            { text }
          ]
        },
        taskType: "CLUSTERING"
      })
    });

    if (!response.ok) {
      const errorBody = await response.text();
      throw new Error(`Failed to get embeddings: ${response.status} ${response.statusText} - ${errorBody}`);
    }

    const result = await response.json();
    return result.embedding.values;
  } catch (error) {
    console.error("Error getting embeddings:", error);
    throw error;
  }
}

/**
 * Generate and return embeddings for a product
 * @param product The product to generate embeddings for
 * @returns An array of floating-point numbers representing the embedding
 */
export async function getProductEmbedding(product: ProductSchema): Promise<number[]> {
  // Create a representative text description of the product
  const textToEmbed = `${product.product_name} ${product.weight_or_size || ""}`.trim();
  return await getEmbeddings(textToEmbed);
}

/**
 * Calculate cosine similarity between two embedding vectors
 * @param embedding1 First embedding vector
 * @param embedding2 Second embedding vector
 * @returns Similarity score between 0-1, where 1 is most similar
 */
export function calculateSimilarity(embedding1: number[], embedding2: number[]): number {
  if (embedding1.length !== embedding2.length) {
    throw new Error("Embedding vectors must have the same length");
  }

  // Compute dot product
  let dotProduct = 0;
  let magnitude1 = 0;
  let magnitude2 = 0;

  for (let i = 0; i < embedding1.length; i++) {
    dotProduct += embedding1[i] * embedding2[i];
    magnitude1 += embedding1[i] * embedding1[i];
    magnitude2 += embedding2[i] * embedding2[i];
  }

  magnitude1 = Math.sqrt(magnitude1);
  magnitude2 = Math.sqrt(magnitude2);

  // Prevent division by zero
  if (magnitude1 === 0 || magnitude2 === 0) {
    return 0;
  }

  // Cosine similarity
  return dotProduct / (magnitude1 * magnitude2);
}

/**
 * Find similar products based on embedding similarity
 * @param productEmbedding The embedding of the target product
 * @param productEmbeddings List of product embeddings to compare against
 * @param similarityThreshold Minimum similarity score (0-1) to consider products similar
 * @param maxResults Maximum number of similar products to return
 * @returns Array of product IDs and their similarity scores, sorted by similarity
 */
export function findSimilarProducts(
  productEmbedding: number[],
  productEmbeddings: { id: number; embedding: number[] }[],
  similarityThreshold = 0.7,
  maxResults = 5
): { id: number; similarity: number }[] {
  const similarities = productEmbeddings.map(({ id, embedding }) => ({
    id,
    similarity: calculateSimilarity(productEmbedding, embedding)
  }));

  // Filter by threshold and sort by similarity (highest first)
  return similarities
    .filter(item => item.similarity >= similarityThreshold)
    .sort((a, b) => b.similarity - a.similarity)
    .slice(0, maxResults);
}