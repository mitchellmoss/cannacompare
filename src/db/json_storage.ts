/**
 * Simple JSON file-based storage implementation
 * Used as an alternative to SQLite due to compatibility issues
 */

import { load } from "https://deno.land/std@0.218.2/dotenv/mod.ts";
import { ProductSchema, ProductQueryResult } from "../shared/types.ts";
import { ensureDir } from "https://deno.land/std@0.218.2/fs/ensure_dir.ts";
import { join } from "https://deno.land/std@0.218.2/path/mod.ts";

// Load environment variables
const env = await load();
const DATA_DIR = "./data";
const DISPENSARIES_FILE = join(DATA_DIR, "dispensaries.json");
const PRODUCTS_FILE = join(DATA_DIR, "products.json");
const ERRORS_FILE = join(DATA_DIR, "errors.json");

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
function readJsonFile<T>(filePath: string): T {
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
  
  writeJsonFile(PRODUCTS_FILE, filteredProducts);
  console.log(`Cleared old products for dispensary ID ${dispensaryId}`);
}

// Search/Query Operations
export function searchProductsByName(searchTerm: string): ProductQueryResult[] {
  const products = readJsonFile<Product[]>(PRODUCTS_FILE);
  const dispensaries = readJsonFile<Dispensary[]>(DISPENSARIES_FILE);
  
  const lowerSearchTerm = searchTerm.toLowerCase();
  const results = products
    .filter(p => p.product_name.toLowerCase().includes(lowerSearchTerm))
    .map(p => {
      const dispensary = dispensaries.find(d => d.id === p.dispensary_id);
      return {
        product_name: p.product_name,
        price: p.price,
        weight_or_size: p.weight_or_size,
        scraped_at: p.scraped_at,
        dispensary_name: dispensary?.name || 'Unknown'
      };
    });
  
  return results;
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