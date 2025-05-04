import { Application } from "https://deno.land/x/oak@v12.6.1/mod.ts";
import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { setupDatabase, closeDb } from "../db/json_storage.ts"; // Changed to use JSON storage
import apiRouter from "./routes.ts";

// Load environment variables
const env = await load();
const PORT = parseInt(env.SERVER_PORT || "8000");

const app = new Application();

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

// Fix for Content-Type missing error - add a content type if missing for POST requests
app.use(async (ctx, next) => {
  if (ctx.request.method === "POST" && !ctx.request.headers.get("content-type")) {
    ctx.request.headers.set("content-type", "application/json");
    console.log("Added missing Content-Type header to POST request");
  }
  await next();
});

// CORS middleware for development
app.use(async (ctx, next) => {
  ctx.response.headers.set("Access-Control-Allow-Origin", "*");
  ctx.response.headers.set("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  ctx.response.headers.set("Access-Control-Allow-Headers", "Content-Type");
  
  if (ctx.request.method === "OPTIONS") {
    ctx.response.status = 204; // No content for OPTIONS requests
    return;
  }
  
  await next();
});

// API Routes
app.use(apiRouter.routes());
app.use(apiRouter.allowedMethods());

// Static file serving (for frontend)
app.use(async (ctx, next) => {
  try {
    await ctx.send({
      root: `${Deno.cwd()}/src/web/public`,
      index: "index.html",
    });
  } catch {
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
app.addEventListener("listen", ({ hostname, port, secure }) => {
  console.log(
    `Web server listening on: ${secure ? "https://" : "http://"}${hostname ?? "localhost"}:${port}`
  );
  console.log(`- API available at: http://localhost:${port}/api/`);
  console.log(`- Frontend available at: http://localhost:${port}/`);
  console.log(`- Embeddings Management: http://localhost:${port}/embeddings.html`);
});

// Graceful shutdown
globalThis.addEventListener("unload", () => {
  console.log("Closing data connections...");
  closeDb();
});

// Start the server
await app.listen({ port: PORT });