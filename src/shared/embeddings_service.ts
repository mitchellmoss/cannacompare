/**
 * Gemini embeddings service to generate vectors for product similarity search
 */

import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";

// Load environment variables
const env = await load();
const GOOGLE_API_KEY = env.GOOGLE_API_KEY;
const EMBEDDING_MODEL = env.EMBEDDING_MODEL || "gemini-embedding-exp-03-07";
const DIMENSIONS = env.EMBEDDING_DIMENSIONS ? parseInt(env.EMBEDDING_DIMENSIONS) : 3072;

// Embedding API endpoint with dimensions specification for the experimental model
const EMBEDDING_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${EMBEDDING_MODEL}:embedContent?key=${GOOGLE_API_KEY}`;

// Log configuration status
console.log(`Embedding service configured with model: ${EMBEDDING_MODEL} (${DIMENSIONS} dimensions)`);
if (!GOOGLE_API_KEY) {
  console.warn("Warning: GOOGLE_API_KEY is not set in the environment. Embedding functionality will not work.");
}

/**
 * Interface for Gemini API request
 */
interface EmbeddingRequest {
  model: string;
  content: {
    parts: {
      text: string;
    }[];
  };
  taskType: "RETRIEVAL_DOCUMENT" | "RETRIEVAL_QUERY";
  dimensions?: number; // Optional dimensions parameter for experimental model
}

/**
 * Interface for Gemini API response
 */
interface EmbeddingResponse {
  embedding: {
    values: number[];
  };
}

/**
 * Generate embeddings for a given text string using Google's Gemini API
 * @param text - Text to generate embeddings for
 * @param isQuery - Whether this is a query (true) or document (false)
 * @param retryCount - Number of times to retry if the request fails
 * @returns - Embedding vector as Float32Array or null if error
 */
export async function getEmbedding(
  text: string,
  isQuery = false,
  retryCount = 3
): Promise<Float32Array | null> {
  if (!GOOGLE_API_KEY) {
    console.error("Missing GOOGLE_API_KEY in environment variables");
    return null;
  }

  // Build API request
  const request: EmbeddingRequest = {
    model: EMBEDDING_MODEL,
    content: {
      parts: [{ text }],
    },
    taskType: isQuery ? "RETRIEVAL_QUERY" : "RETRIEVAL_DOCUMENT",
    dimensions: DIMENSIONS, // Request specific dimensions for the experimental model
  };

  // Retry logic with exponential backoff
  for (let attempt = 0; attempt <= retryCount; attempt++) {
    try {
      // Send request to Gemini API
      const response = await fetch(EMBEDDING_API_URL, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify(request),
      });

      // If rate limited (429), wait and retry
      if (response.status === 429) {
        if (attempt < retryCount) {
          const waitTime = Math.pow(2, attempt) * 1000 + Math.random() * 1000;
          console.warn(`Rate limited (429). Retrying in ${Math.round(waitTime/1000)} seconds... (Attempt ${attempt + 1}/${retryCount})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        } else {
          const errorData = await response.text();
          console.error("Rate limit reached and max retries exceeded:", errorData);
          return null;
        }
      }

      if (!response.ok) {
        const errorData = await response.text();
        console.error(`Gemini API error (${response.status}):`, errorData);
        
        // For other errors, retry only if we have attempts remaining
        if (attempt < retryCount) {
          const waitTime = Math.pow(2, attempt) * 1000;
          console.warn(`API error. Retrying in ${Math.round(waitTime/1000)} seconds... (Attempt ${attempt + 1}/${retryCount})`);
          await new Promise(resolve => setTimeout(resolve, waitTime));
          continue; // Retry
        }
        
        return null;
      }

      const data = await response.json() as EmbeddingResponse;
      
      // Convert to Float32Array for efficiency
      return new Float32Array(data.embedding.values);
    } catch (error) {
      console.error(`Error generating embedding (Attempt ${attempt + 1}/${retryCount + 1}):`, error);
      
      // For unexpected errors, retry only if we have attempts remaining
      if (attempt < retryCount) {
        const waitTime = Math.pow(2, attempt) * 1000;
        console.warn(`Unexpected error. Retrying in ${Math.round(waitTime/1000)} seconds...`);
        await new Promise(resolve => setTimeout(resolve, waitTime));
        continue; // Retry
      }
      
      return null;
    }
  }
  
  // If we get here, all retries failed
  return null;
}

/**
 * Format product data for embedding
 * This combines product name and other attributes into a single text
 * that captures the key information for similarity search
 */
export function formatProductForEmbedding(
  productName: string,
  weight?: string
): string {
  let text = productName.trim();
  
  // Add weight/size if available
  if (weight) {
    text += ` ${weight}`;
  }
  
  return text;
}

/**
 * Calculate cosine similarity between two embedding vectors
 * @returns Number between -1 and 1, where 1 is identical, 0 is orthogonal, -1 is opposite
 */
export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  if (a.length !== b.length) {
    throw new Error("Vectors must have the same dimensions");
  }

  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) {
    return 0; // Avoid division by zero
  }

  return dotProduct / (normA * normB);
}

/**
 * Serialize embedding vector to Uint8Array for storage in SQLite BLOB
 */
export function serializeEmbedding(embedding: Float32Array): Uint8Array {
  const buffer = new ArrayBuffer(embedding.length * 4); // 4 bytes per float
  const view = new DataView(buffer);
  
  for (let i = 0; i < embedding.length; i++) {
    view.setFloat32(i * 4, embedding[i], true); // true = little endian
  }
  
  return new Uint8Array(buffer);
}

/**
 * Deserialize Uint8Array from SQLite BLOB back to Float32Array
 */
export function deserializeEmbedding(bytes: Uint8Array): Float32Array {
  const buffer = bytes.buffer;
  const view = new DataView(buffer);
  const length = buffer.byteLength / 4; // 4 bytes per float
  const embedding = new Float32Array(length);
  
  for (let i = 0; i < length; i++) {
    embedding[i] = view.getFloat32(i * 4, true); // true = little endian
  }
  
  return embedding;
}