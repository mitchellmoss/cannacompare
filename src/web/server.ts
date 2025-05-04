import { Application, Router } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { compare, hash } from "https://deno.land/x/bcrypt@v0.4.1/mod.ts";
import { encodeHex } from "https://deno.land/std@0.218.2/encoding/hex.ts";
import { setupDatabase, closeDb } from "../db/json_storage.ts"; // Changed to use JSON storage
import apiRouter from "./routes.ts";
import { startSchedulerService } from "../scheduler/startup.ts";

// Load environment variables
const env = await load({ allowEmptyValues: true });
const PORT = parseInt(env.SERVER_PORT || "8000");

const app = new Application({
  // Configure the application
  logErrors: true,
  proxy: false
});

// Logger middleware
app.use(async (ctx, next) => {
  await next();
  const rt = ctx.response.headers.get("X-Response-Time");
  console.log(`${ctx.request.method} ${ctx.request.url} - ${rt}`);
});

// Response time middleware
app.use(async (ctx, next) => {
  const start = Date.now();
  await next();
  const ms = Date.now() - start;
  ctx.response.headers.set("X-Response-Time", `${ms}ms`);
});

// Fix for Content-Type missing error and add debugging
app.use(async (ctx, next) => {
  // Log all requests for debugging
  if (ctx.request.method === "POST") {
    console.log(`POST request to ${ctx.request.url.pathname}`);
    
    // Log headers but don't modify them
    console.log(`Headers: ${JSON.stringify(Object.fromEntries(ctx.request.headers.entries()))}`);
  }
  
  try {
    await next();
  } catch (error) {
    console.error(`Error processing ${ctx.request.method} request to ${ctx.request.url.pathname}:`, error);
    if (!ctx.response.status || ctx.response.status === 404) {
      ctx.response.status = 500;
      ctx.response.type = "application/json";
      ctx.response.body = { 
        success: false, 
        error: "Server error", 
        path: ctx.request.url.pathname 
      };
    }
  }
});

// CORS middleware for development
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type, Authorization, X-Admin-Token");
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204; // No content for OPTIONS requests
    return;
  }
  
  await next();
});

// Special debugging for API routes
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname.startsWith('/api/')) {
    console.log(`==== API REQUEST: ${ctx.request.method} ${ctx.request.url.pathname} ====`);
  }
  
  try {
    await next();
    
    if (ctx.request.url.pathname.startsWith('/api/')) {
      console.log(`==== API RESPONSE FOR ${ctx.request.method} ${ctx.request.url.pathname}: ${ctx.response.status} ====`);
    }
  } catch (error) {
    console.error(`Error in API route ${ctx.request.url.pathname}:`, error);
    
    if (ctx.request.url.pathname.startsWith('/api/')) {
      ctx.response.status = 500;
      ctx.response.type = "application/json";
      ctx.response.body = { 
        success: false, 
        error: "API server error", 
        message: error.message 
      };
    } else {
      await next();
    }
  }
});

// Create a dedicated admin router
const adminRouter = new Router();

// Session storage
const sessions = new Map();

// Admin credentials - read from env or use default for development
const ADMIN_PASSWORD = env.ADMIN_PASSWORD || "admin_password_change_me";
const ADMIN_PASSWORD_HASH = await hash(ADMIN_PASSWORD);

// Basic admin login route
adminRouter.post("/api/admin/login", async (ctx) => {
  console.log("==== DIRECT ADMIN LOGIN HANDLER EXECUTING ====");
  
  try {
    let password = "";
    
    // Try to get password from request body
    if (ctx.request.hasBody) {
      const body = ctx.request.body();
      const bodyType = body.type;
      console.log("Request body type:", bodyType);
      
      if (bodyType === "json") {
        try {
          const value = await body.value;
          password = value.password || "";
          console.log("Got password from JSON body, length:", password.length);
        } catch (e) {
          console.error("Error parsing JSON body:", e);
        }
      } else if (bodyType === "form" || bodyType === "form-data") {
        try {
          const formData = await body.value;
          password = formData.get("password") || "";
          console.log("Got password from form data, length:", password.length);
        } catch (e) {
          console.error("Error parsing form data:", e);
        }
      }
    }
    
    // Try to get password from URL params as fallback
    if (!password) {
      password = ctx.request.url.searchParams.get("password") || "";
      if (password) {
        console.log("Got password from URL params, length:", password.length);
      }
    }
    
    if (!password) {
      console.error("No password provided");
      ctx.response.status = 400;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Password required" };
      return;
    }
    
    // Simple direct match first for debugging
    const directMatch = (password === ADMIN_PASSWORD);
    console.log("Direct password match?", directMatch);
    
    // Then bcrypt for security
    const passwordValid = directMatch || await compare(password, ADMIN_PASSWORD_HASH);
    console.log("Password valid?", passwordValid);
    
    if (passwordValid) {
      // Create session token
      const tokenData = `admin-${Date.now()}-${Math.random()}`;
      const tokenBytes = new TextEncoder().encode(tokenData);
      const hashBuffer = await crypto.subtle.digest("SHA-256", tokenBytes);
      const tokenHash = encodeHex(hashBuffer);
      
      console.log("New token created:", tokenHash.slice(0, 10) + "...");
      
      // Store token
      sessions.set(tokenHash, {
        created: Date.now(),
        expires: Date.now() + (24 * 60 * 60 * 1000) // 24 hours
      });
      
      console.log("Sessions after login:", sessions.size);
      
      // Set cookie
      ctx.cookies.set("admin_token", tokenHash, {
        httpOnly: true,
        maxAge: 24 * 60 * 60, // 24 hours in seconds
        path: "/"
      });
      
      // Return success
      ctx.response.status = 200;
      ctx.response.type = "application/json";
      ctx.response.body = {
        success: true,
        message: "Login successful",
        token: tokenHash
      };
      
      console.log("Login successful");
    } else {
      console.log("Invalid password");
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Invalid password" };
    }
  } catch (error) {
    console.error("Admin login error:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, error: "Login error: " + error.message };
  }
});

// Auth check endpoint
adminRouter.get("/api/admin/check-auth", async (ctx) => {
  console.log("Admin check-auth called");
  try {
    // Get token from cookie, header or URL param
    const authHeader = ctx.request.headers.get("Authorization");
    const tokenHeader = ctx.request.headers.get("X-Admin-Token");
    const cookieToken = ctx.cookies.get("admin_token");
    
    let token = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (tokenHeader) {
      token = tokenHeader;
    } else if (cookieToken) {
      token = cookieToken;
    }
    
    console.log("Token found:", token ? "yes" : "no");
    console.log("Active sessions:", sessions.size);
    
    if (!token) {
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, authenticated: false, error: "No token provided" };
      return;
    }
    
    // Check if token exists
    if (!sessions.has(token)) {
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, authenticated: false, error: "Invalid token" };
      return;
    }
    
    // Check if token is expired
    const session = sessions.get(token);
    if (session.expires < Date.now()) {
      sessions.delete(token);
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, authenticated: false, error: "Token expired" };
      return;
    }
    
    // Refresh session expiry
    session.expires = Date.now() + (24 * 60 * 60 * 1000); // Extend by 24 hours
    sessions.set(token, session);
    
    // Token is valid
    ctx.response.status = 200;
    ctx.response.type = "application/json";
    ctx.response.body = { success: true, authenticated: true };
  } catch (error) {
    console.error("Auth check error:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, authenticated: false, error: "Auth check error: " + error.message };
  }
});

// Logout endpoint
adminRouter.post("/api/admin/logout", async (ctx) => {
  console.log("Admin logout called");
  try {
    // Get token from various sources
    const authHeader = ctx.request.headers.get("Authorization");
    const tokenHeader = ctx.request.headers.get("X-Admin-Token");
    const cookieToken = ctx.cookies.get("admin_token");
    
    let token = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (tokenHeader) {
      token = tokenHeader;
    } else if (cookieToken) {
      token = cookieToken;
    }
    
    if (token) {
      // Remove session
      sessions.delete(token);
      console.log("Session removed");
    }
    
    // Clear cookie
    ctx.cookies.delete("admin_token");
    
    // Return success
    ctx.response.status = 200;
    ctx.response.type = "application/json";
    ctx.response.body = { success: true, message: "Logged out successfully" };
  } catch (error) {
    console.error("Logout error:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, error: "Logout error: " + error.message };
  }
});

// Auth middleware for protected routes
const authMiddleware = async (ctx, next) => {
  try {
    // Get token from cookie, header or URL param
    const authHeader = ctx.request.headers.get("Authorization");
    const tokenHeader = ctx.request.headers.get("X-Admin-Token");
    const cookieToken = ctx.cookies.get("admin_token");
    
    let token = null;
    
    if (authHeader && authHeader.startsWith("Bearer ")) {
      token = authHeader.replace("Bearer ", "");
    } else if (tokenHeader) {
      token = tokenHeader;
    } else if (cookieToken) {
      token = cookieToken;
    }
    
    if (!token || !sessions.has(token)) {
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Authentication required" };
      return;
    }
    
    // Check if token is expired
    const session = sessions.get(token);
    if (session.expires < Date.now()) {
      sessions.delete(token);
      ctx.response.status = 401;
      ctx.response.type = "application/json";
      ctx.response.body = { success: false, error: "Session expired" };
      return;
    }
    
    // Continue to protected route
    await next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    ctx.response.status = 500;
    ctx.response.type = "application/json";
    ctx.response.body = { success: false, error: "Auth error" };
  }
};

// Create embeddings management route
adminRouter.post("/api/embeddings/generate", authMiddleware, async (ctx) => {
  console.log("Protected embeddings generate endpoint called");
  
  // Forward to the API router - we just protect this route with auth
  // The actual implementation is in the apiRouter
  await apiRouter.routes()(ctx);
});

// Add the stats endpoint to make sure it doesn't redirect
adminRouter.get("/api/products/stats", async (ctx) => {
  // Allow this endpoint without auth for the admin page
  console.log("Stats endpoint called");
  await apiRouter.routes()(ctx);
});

// Use admin router first
console.log("Registering admin routes");
app.use(adminRouter.routes());
app.use(adminRouter.allowedMethods());

// Then use API router
console.log("Registering API routes");
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// Redirect for old embeddings page to new admin page
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/embeddings.html") {
    ctx.response.redirect("/admin");
    return;
  }
  await next();
});

// Admin page handler
app.use(async (ctx, next) => {
  if (ctx.request.url.pathname === "/admin") {
    console.log("Admin route requested - serving admin.html");
    try {
      await ctx.send({
        path: "admin.html",
        root: `${Deno.cwd()}/src/web/public`,
      });
      return;
    } catch (error) {
      console.error("Error serving admin page:", error);
      // Continue to next middleware if there's an error
    }
  }
  
  if (ctx.request.url.pathname === "/admin-test") {
    console.log("Admin test route requested - serving admin-test.html");
    try {
      await ctx.send({
        path: "admin-test.html",
        root: `${Deno.cwd()}/src/web/public`,
      });
      return;
    } catch (error) {
      console.error("Error serving admin test page:", error);
      // Continue to next middleware if there's an error
    }
  }
  
  await next();
});

// Main static file serving (for frontend)
app.use(async (ctx, next) => {
  let pathName = ctx.request.url.pathname;
  
  // Skip API routes - this is a safeguard to make sure API endpoints are never
  // treated as static file requests
  if (pathName.startsWith("/api/")) {
    console.log(`Skipping static file handling for API route: ${pathName}`);
    await next();
    return;
  }
  
  console.log(`Handling static file request: ${pathName}`);
  
  // Handle root path
  if (pathName === "/") {
    pathName = "/index.html";
  }
  
  try {
    await ctx.send({
      root: `${Deno.cwd()}/src/web/public`,
      path: pathName.replace(/^\//, ""), // Remove leading slash if present
      index: "index.html",
    });
    console.log(`Successfully served: ${pathName}`);
  } catch (error) {
    console.log(`Static file not found: ${pathName}`, error);
    await next(); // If file not found, pass to next middleware
  }
});

// 404 handler
app.use((ctx) => {
  ctx.response.status = 404;
  ctx.response.body = { success: false, error: "Not Found" };
});

// Initialize storage on start
setupDatabase();

// Add event listener for server startup
app.addEventListener("listen", async ({ hostname, port, secure }) => {
  console.log(
    `Web server listening on: ${secure ? "https://" : "http://"}${hostname ?? "localhost"}:${port}`
  );
  console.log(`- API available at: http://localhost:${port}/api/`);
  console.log(`- Frontend available at: http://localhost:${port}/`);
  console.log(`- Admin Dashboard: http://localhost:${port}/admin`);
  
  // Start the scheduler service after the server is up
  await startSchedulerService();
});

// Graceful shutdown
globalThis.addEventListener("unload", () => {
  console.log("Closing data connections...");
  closeDb();
});

// Start the server
await app.listen({ port: PORT });