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
  regenerateAllEmbeddings,
  readJsonFile,
  getProductEmbedding,
  findSimilarProductsByEmbedding,
  groupProductsByDispensary
} from "../db/json_storage.ts"; // Changed to use JSON storage
import { join } from "https://deno.land/std@0.218.2/path/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { encodeHex } from "https://deno.land/std@0.218.2/encoding/hex.ts";
import { RateLimiter } from "https://deno.land/x/oak_rate_limit@v0.1.1/mod.ts";

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
const env = await load({ allowEmptyValues: true });
const SIMILARITY_THRESHOLD = Number(env.SIMILARITY_THRESHOLD) || 0.7;

// Admin credentials - read from env or use default for development
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "admin_password_change_me";
const ADMIN_PASSWORD_HASH = await hash(ADMIN_PASSWORD); // Use this in production

// Create a rate limiter for login attempts
const loginRateLimiter = RateLimiter({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 10, // 10 requests per windowMs (increasing for development)
  message: { success: false, error: "Too many login attempts, please try again later" },
  headers: true,
  standardHeaders: true,
  // Disable rate limiting in development if needed (remove this in production)
  skip: () => true
});

// Create a session token map
const sessions = new Map();

// Create a rate limiter for the admin API endpoints
const adminApiRateLimiter = RateLimiter({
  windowMs: 10 * 60 * 1000, // 10 minutes
  max: 100, // 100 requests per windowMs
  message: { success: false, error: "Too many requests, please try again later" },
  headers: true,
  standardHeaders: true,
  // Disable rate limiting in development if needed (remove this in production)
  skip: () => true
});

// Auth middleware
const authMiddleware = async (ctx, next) => {
  try {
    // Get token from multiple possible sources
    const authHeader = ctx.request.headers.get("Authorization");
    const customTokenHeader = ctx.request.headers.get("X-Admin-Token");
    const cookieToken = ctx.cookies.get("admin_token");
    
    let token = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (customTokenHeader) {
      token = customTokenHeader;
    } else if (cookieToken) {
      token = cookieToken;
    }
    
    // Check if token exists and is valid
    if (!token) {
      console.log("Auth middleware: No token provided");
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Authentication required" };
      return;
    }
    
    // Check if token is in active sessions
    if (!sessions.has(token)) {
      console.log("Auth middleware: Invalid token");
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Invalid authentication token" };
      return;
    }
    
    // Check if session has expired
    const session = sessions.get(token);
    if (session.expires < Date.now()) {
      console.log("Auth middleware: Expired token");
      sessions.delete(token);
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Authentication expired" };
      return;
    }
    
    // Authentication successful, refresh session
    session.expires = Date.now() + (24 * 60 * 60 * 1000); // Extend for another 24 hours
    sessions.set(token, session);
    
    // Continue to the protected endpoint
    await next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, error: "Authentication error" };
  }
};

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
  const crossDispensaryParam = ctx.request.url.searchParams.get("crossDispensary");
  
  const limit = limitParam ? parseInt(limitParam) : 5;
  const threshold = thresholdParam ? parseFloat(thresholdParam) : SIMILARITY_THRESHOLD;
  const crossDispensary = crossDispensaryParam === "true";

  if (!productId) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Missing product ID" };
    return;
  }

  try {
    // Modify the findSimilarProductsById function to pass the crossDispensary parameter
    const product = getProductById(parseInt(productId));
    if (!product) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Product not found" };
      return;
    }
    
    // Get product embedding
    const productEmbedding = getProductEmbedding(parseInt(productId));
    if (!productEmbedding) {
      ctx.response.status = 400;
      ctx.response.body = { 
        success: false, 
        error: "No embedding found for this product. Please generate embeddings first." 
      };
      return;
    }
    
    // For cross-dispensary comparison, we want to exclude the original dispensary
    // if crossDispensary is true
    const results = crossDispensary 
      ? findSimilarProductsByEmbedding(
          productEmbedding, 
          limit, 
          threshold, 
          parseInt(productId), 
          true,
          product.dispensary_id // Exclude the original dispensary
        )
      : findSimilarProductsByEmbedding(
          productEmbedding, 
          limit, 
          threshold, 
          parseInt(productId)
        );
    
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: results };
  } catch (error) {
    console.error(`Error finding similar products for product ${productId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to find similar products" };
  }
});

// API route for cross-dispensary product comparison
router.get("/api/products/:id/compare-across-dispensaries", async (ctx) => {
  const productId = ctx.params.id;
  const limitParam = ctx.request.url.searchParams.get("limit");
  const thresholdParam = ctx.request.url.searchParams.get("threshold");
  
  const limit = limitParam ? parseInt(limitParam) : 10; // Higher default limit for comparison
  const threshold = thresholdParam ? parseFloat(thresholdParam) : SIMILARITY_THRESHOLD;

  if (!productId) {
    ctx.response.status = 400;
    ctx.response.body = { success: false, error: "Missing product ID" };
    return;
  }

  try {
    // Get the original product
    const originalProduct = getProductById(parseInt(productId));
    if (!originalProduct) {
      ctx.response.status = 404;
      ctx.response.body = { success: false, error: "Product not found" };
      return;
    }
    
    // Get product embedding
    const productEmbedding = getProductEmbedding(parseInt(productId));
    if (!productEmbedding) {
      ctx.response.status = 400;
      ctx.response.body = { 
        success: false, 
        error: "No embedding found for this product. Please generate embeddings first." 
      };
      return;
    }
    
    // Find similar products from other dispensaries
    const similarProducts = findSimilarProductsByEmbedding(
      productEmbedding,
      limit,
      threshold,
      parseInt(productId),
      true, // Enable cross-dispensary mode
      originalProduct.dispensary_id // Exclude the original dispensary
    );
    
    // Group similar products by dispensary
    const groupedByDispensary = groupProductsByDispensary(similarProducts);
    
    // Add the original product for reference
    const result = {
      original_product: originalProduct,
      similar_by_dispensary: Object.values(groupedByDispensary)
    };
    
    ctx.response.status = 200;
    ctx.response.body = { success: true, data: result };
  } catch (error) {
    console.error(`Error comparing products across dispensaries for product ${productId}:`, error);
    ctx.response.status = 500;
    ctx.response.body = { success: false, error: "Failed to compare products across dispensaries" };
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

// API route to generate embeddings for products is now defined below with auth middleware

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

// ==================== ADMIN ROUTES ====================

// Admin login endpoint - rate limited to prevent brute force
router.post("/api/admin/login", loginRateLimiter, async (ctx) => {
  console.log("=== ADMIN LOGIN HANDLER EXECUTED ===");
  try {
    // More detailed logging for debugging
    console.log("Headers:", Object.fromEntries(ctx.request.headers.entries()));
    
    // Get the raw request body for debugging
    const rawBodyStream = ctx.request.originalRequest.getBody();
    const rawBody = rawBodyStream ? new TextDecoder().decode(rawBodyStream) : null;
    console.log("Raw request body:", rawBody);
    
    let password = "";
    
    // Try to parse the raw body directly if available
    if (rawBody) {
      try {
        const parsedBody = JSON.parse(rawBody);
        password = parsedBody.password;
        console.log("Successfully parsed raw body JSON");
      } catch (rawParseErr) {
        console.error("Failed to parse raw body as JSON:", rawParseErr);
      }
    }
    
    // If we couldn't get the password from raw body, try the standard approach
    if (!password) {
      const body = ctx.request.body();
      console.log("Body type:", body.type);
      
      if (body.type === "json") {
        try {
          const value = await body.value;
          console.log("Received login request body type:", typeof value);
          
          // Handle both object and string parsing scenarios
          if (typeof value === 'string') {
            try {
              const parsed = JSON.parse(value);
              password = parsed.password;
              console.log("Parsed JSON string to get password");
            } catch (parseErr) {
              console.error("Failed to parse JSON string:", parseErr);
            }
          } else if (typeof value === 'object' && value !== null) {
            password = value.password;
            console.log("Extracted password from object");
          }
        } catch (e) {
          console.error("Error parsing login body:", e);
        }
      } else if (body.type === "form" || body.type === "form-data") {
        try {
          const formData = await body.value;
          password = formData.get("password") || "";
          console.log("Extracted password from form data");
        } catch (formError) {
          console.error("Error parsing form data:", formError);
        }
      }
    }
    
    // Try URL params as a last resort
    if (!password) {
      password = ctx.request.url.searchParams.get("password") || "";
      if (password) {
        console.log("Extracted password from URL params");
      }
    }
    
    // Log password length but not content for security
    console.log("Password received, length:", password ? password.length : 0);
    
    if (!password) {
      console.error("Password is empty or undefined");
      ctx.response.status = 400;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Password cannot be empty" };
      return;
    }
    
    console.log("Admin password hash from env:", ADMIN_PASSWORD_HASH.slice(0, 10) + "...");
    console.log("Admin password from env is:", ADMIN_PASSWORD);
    
    // For testing purposes, directly compare with the unhashed password first
    const directMatch = password === ADMIN_PASSWORD;
    console.log("Direct password match?", directMatch);
    
    // For production, use bcrypt compare
    const passwordValid = directMatch || await compare(password, ADMIN_PASSWORD_HASH);
    console.log("Password valid?", passwordValid);
    
    if (passwordValid) {
      // Create a session token
      const tokenData = `admin-${Date.now()}-${Math.random()}`;
      const tokenBytes = new TextEncoder().encode(tokenData);
      const hashBuffer = await crypto.subtle.digest("SHA-256", tokenBytes);
      const tokenHash = encodeHex(hashBuffer);
      
      console.log("Generated token hash:", tokenHash.slice(0, 10) + "...");
      
      // Store the token in the session map with a 24-hour expiry
      sessions.set(tokenHash, {
        created: Date.now(),
        expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      });
      
      // Set the token as a cookie
      ctx.cookies.set("admin_token", tokenHash, {
        httpOnly: true,
        maxAge: 24 * 60 * 60, // 24 hours in seconds
        path: "/"
      });
      
      // Check sessions after setting
      console.log("Active sessions after login:", sessions.size);
      console.log("Session keys:", [...sessions.keys()].map(k => k.substring(0, 10) + "..."));
      
      const responseBody = { 
        success: true, 
        message: "Login successful",
        token: tokenHash // Also include token in response for programmatic API access
      };
      
      console.log("Sending successful login response");
      ctx.response.status = 200;
      ctx.response.type = "application/json";
      ctx.response.body = responseBody;
    } else {
      console.log("Invalid password provided");
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Invalid password" };
    }
  } catch (error) {
    console.error("Login error:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, error: "Login failed: " + error.message };
  } finally {
    console.log("=== ADMIN LOGIN HANDLER FINISHED ===");
  }
});

// Authentication check endpoint
router.get("/api/admin/check-auth", async (ctx) => {
  console.log("Auth check called");
  
  try {
    // Get token from either Authorization header, cookie, or localStorage via a custom header
    const authHeader = ctx.request.headers.get("Authorization");
    const customTokenHeader = ctx.request.headers.get("X-Admin-Token");
    const cookieToken = ctx.cookies.get("admin_token");
    
    let token = null;
    let tokenSource = "none";
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
      tokenSource = "Authorization header";
    } else if (customTokenHeader) {
      token = customTokenHeader;
      tokenSource = "X-Admin-Token header";
    } else if (cookieToken) {
      token = cookieToken;
      tokenSource = "cookie";
    }
    
    console.log("Token found from:", tokenSource);
    
    if (!token) {
      console.log("No token in request");
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, authenticated: false, error: "No authentication token" };
      return;
    }
    
    // Clean up any expired sessions
    cleanupExpiredSessions();
    
    // Debug session info
    console.log("Active sessions:", sessions.size);
    if (sessions.size > 0) {
      console.log("Session keys:", [...sessions.keys()].map(k => k.substring(0, 10) + "..."));
    }
    
    // Check if token exists in sessions
    if (!sessions.has(token)) {
      console.log("Token not found in active sessions");
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, authenticated: false, error: "Invalid token" };
      return;
    }
    
    const session = sessions.get(token);
    console.log("Session found:", session);
    
    // Check if session has expired
    if (session.expires < Date.now()) {
      console.log("Session has expired");
      sessions.delete(token);
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, authenticated: false, error: "Session expired" };
      return;
    }
    
    // Update expiry time on successful check to implement sliding expiration
    session.expires = Date.now() + (24 * 60 * 60 * 1000); // Extend for another 24 hours
    sessions.set(token, session);
    
    // Refresh the cookie as well
    ctx.cookies.set("admin_token", token, {
      httpOnly: true,
      maxAge: 24 * 60 * 60, // 24 hours in seconds
      path: "/"
    });
    
    console.log("Authentication successful, session extended");
    ctx.response.status = 200;
    ctx.response.type = "application/json";
    ctx.response.body = { success: true, authenticated: true };
  } catch (error) {
    console.error("Error in check-auth endpoint:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, authenticated: false, error: "Server error: " + error.message };
  }
});

// Admin logout endpoint
router.post("/api/admin/logout", async (ctx) => {
  console.log("Logout endpoint called");
  
  try {
    // Get token from either Authorization header or cookie
    const authHeader = ctx.request.headers.get("Authorization");
    const cookieToken = ctx.cookies.get("admin_token");
    
    let token = null;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
      console.log("Token from Authorization header");
    } else if (cookieToken) {
      token = cookieToken;
      console.log("Token from cookie");
    }
    
    console.log("Token found:", token ? "yes" : "no");
    
    if (token) {
      // Remove the session
      sessions.delete(token);
      console.log("Session deleted");
      
      // Clear the cookie
      ctx.cookies.delete("admin_token");
      console.log("Cookie deleted");
    } else {
      console.log("No token to logout");
    }
    
    ctx.response.status = 200;
    ctx.response.type = "application/json";
    ctx.response.body = { success: true, message: "Logged out successfully" };
    console.log("Logout successful");
  } catch (error) {
    console.error("Error in logout endpoint:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, error: "Server error: " + error.message };
  }
});

// Clean up expired sessions - this would be called by a scheduler in a production app
// For simplicity, we'll just do it manually when a check-auth request is made
const cleanupExpiredSessions = () => {
  const now = Date.now();
  for (const [token, session] of sessions.entries()) {
    if (session.expires < now) {
      sessions.delete(token);
    }
  }
};

// Apply authMiddleware to protected embeddings endpoints
// This means the embeddings API routes are now protected behind the admin login
router.post("/api/embeddings/generate", authMiddleware, adminApiRateLimiter, async (ctx) => {
  const body = ctx.request.body();
  let productId: number | undefined;
  let limit: number | undefined;
  let processAll = false;
  let regenerateAll = false;
  
  if (body.type === "json") {
    try {
      const value = await body.value;
      productId = value.productId;
      limit = value.limit;
      processAll = value.processAll === true;
      regenerateAll = value.regenerateAll === true;
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
    } else if (regenerateAll) {
      // Regenerate embeddings for ALL products (even those with existing embeddings)
      const count = await regenerateAllEmbeddings(limit || 1000, processAll);
      
      result = { 
        success: true, 
        count, 
        message: processAll 
          ? `Regenerated embeddings for all ${count} products with the new model`
          : `Regenerated embeddings for ${count} products with the new model` 
      };
    } else {
      // Generate embeddings for products without them
      const count = await generateMissingEmbeddings(limit || 1000, processAll);
      
      result = { 
        success: true, 
        count, 
        message: processAll 
          ? `Generated embeddings for all ${count} products without embeddings`
          : `Generated embeddings for ${count} products` 
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

// Export the router with all its routes
export default router;