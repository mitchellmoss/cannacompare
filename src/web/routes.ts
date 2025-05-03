import { Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { 
  searchProductsByName, 
  getAllDispensaries, 
  getProductsByDispensary,
  getRecentErrors
} from "../db/json_storage.ts"; // Changed to use JSON storage

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

export default router;