import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { 
  searchProductsByName, 
  getAllDispensaries, 
  getProductsByDispensary,
  getRecentErrors,
  findSimilarProducts,
  findSimilarProductsById,
  getProductById,
  generateMissingEmbeddings,
  generateAndStoreEmbedding,
  readJsonFile
} from "../db/json_storage.ts"; // Changed to use JSON storage
import { join } from "https://deno.land/std@0.218.2/path/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";

// Constants for JSON files - needed for stats endpoint
const DATA_DIR = "./data";
const PRODUCTS_FILE = join(DATA_DIR, "products.json");
const EMBEDDINGS_FILE = join(DATA_DIR, "embeddings.json");

// Type definitions for stats endpoint
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

// Load environment variables
const env = await load();
const SIMILARITY_THRESHOLD = Number(env.SIMILARITY_THRESHOLD) || 0.7;

const router = new Router();

// API route for product search
router.get("/api/products/search", (ctx) => {
  const searchTerm = ctx.request.url.searchParams.get("q");

  if (!searchTerm) {
    ctx.response.status = 400; // Bad Request
    ctx.response.body = { success: false, error: "Missing search query parameter 'q'" };
    return;
  }

  try {
    const results = searchProductsByName(searchTerm);
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: results };
  } catch (error) {
    console.error("Error searching products:", error);
    ctx.response.status = 500; // Internal Server Error
    ctx.response.body = { success: false, error: "Failed to search products" };
  }
});

// API route for similar products search by text query
router.get("/api/products/similar", async (ctx) => {
  const queryText = ctx.request.url.searchParams.get("q");
  const limitParam = ctx.request.url.searchParams.get("limit");
  const thresholdParam = ctx.request.url.searchParams.get("threshold");
  
  const limit = limitParam ? parseInt(limitParam) : 5;
  const threshold = thresholdParam ? parseFloat(thresholdParam) : SIMILARITY_THRESHOLD;

  if (!queryText) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Missing query parameter 'q'" };
    return;
  }

  try {
    const results = await findSimilarProducts(queryText, limit, threshold);
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: results };
  } catch (error) {
    console.error("Error finding similar products:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to find similar products" };
  }
});

// API route for similar products by product ID
router.get("/api/products/:id/similar", async (ctx) => {
  const productId = ctx.params.id;
  const limitParam = ctx.request.url.searchParams.get("limit");
  const thresholdParam = ctx.request.url.searchParams.get("threshold");
  
  const limit = limitParam ? parseInt(limitParam) : 5;
  const threshold = thresholdParam ? parseFloat(thresholdParam) : SIMILARITY_THRESHOLD;

  if (!productId) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Missing product ID" };
    return;
  }

  try {
    const results = await findSimilarProductsById(parseInt(productId), limit, threshold);
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: results };
  } catch (error) {
    console.error(`Error finding similar products for product ${productId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to find similar products" };
  }
});

// API route to get product by ID
router.get("/api/products/:id", (ctx) => {
  const productId = ctx.params.id;
  
  if (!productId) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Missing product ID" };
    return;
  }
  
  try {
    const product = getProductById(parseInt(productId));
    
    if (!product) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Product not found" };
      return;
    }
    
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: product };
  } catch (error) {
    console.error(`Error fetching product ${productId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to fetch product" };
  }
});

// API route to get all dispensaries
router.get("/api/dispensaries", (ctx) => {
  try {
    const dispensaries = getAllDispensaries();
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: dispensaries };
  } catch (error) {
    console.error("Error fetching dispensaries:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to fetch dispensaries" };
  }
});

// API route to get products by dispensary ID
router.get("/api/dispensaries/:id/products", (ctx) => {
  const dispensaryId = ctx.params.id;
  
  if (!dispensaryId) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Missing dispensary ID" };
    return;
  }
  
  try {
    const products = getProductsByDispensary(parseInt(dispensaryId));
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: products };
  } catch (error) {
    console.error(`Error fetching products for dispensary ${dispensaryId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to fetch products" };
  }
});

// API route to get recent scrape errors
router.get("/api/logs/errors", (ctx) => {
  const limitParam = ctx.request.url.searchParams.get("limit");
  const limit = limitParam ? parseInt(limitParam) : 100;
  
  try {
    const errors = getRecentErrors(limit);
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: errors };
  } catch (error) {
    console.error("Error fetching error logs:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to fetch error logs" };
  }
});

// API route to generate embeddings for products
router.post("/api/embeddings/generate", async (ctx) => {
  const body = ctx.request.body();
  let productId: number | undefined;
  let limit: number | undefined;
  
  if (body.type === "json") {
    try {
      const value = await body.value;
      productId = value.productId;
      limit = value.limit;
    } catch (e) {
      console.log("Error parsing body:", e);
      // Continue with default values if body parsing fails
    }
  }
  
  try {
    let result: { success: boolean; count?: number; message: string };
    
    if (productId) {
      // Generate embedding for a specific product
      const success = await generateAndStoreEmbedding(productId);
      
      if (success) {
        result = { 
          success: true, 
          message: `Successfully generated embedding for product ID ${productId}` 
        };
      } else {
        result = { 
          success: false, 
          message: `Failed to generate embedding for product ID ${productId}` 
        };
      }
    } else {
      // Generate embeddings for products without them
      const count = await generateMissingEmbeddings(limit || 50);
      
      result = { 
        success: true, 
        count, 
        message: `Generated embeddings for ${count} products` 
      };
    }
    
    ctx.response.status = result.success ? 200 : 500;
    ctx.response.body = result;
  } catch (error) {
    console.error("Error generating embeddings:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to generate embeddings" };
  }
});

// API route to get product stats (for embeddings admin page)
router.get("/api/products/stats", async (ctx) => {
  try {
    // In the JSON implementation, we read all the JSON files
    const products = readJsonFile<Product[]>(PRODUCTS_FILE);
    const embeddings = readJsonFile<ProductEmbedding[]>(EMBEDDINGS_FILE);
    
    const totalProducts = products.length;
    const withEmbeddings = embeddings.length;
    
    ctx.response.status = 200;
    ctx.response.body = {
      success: true,
      data: {
        totalProducts,
        withEmbeddings,
        missingEmbeddings: totalProducts - withEmbeddings
      }
    };
  } catch (error) {
    console.error("Error fetching product stats:", error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to fetch product stats" };
  }
});

export default router;