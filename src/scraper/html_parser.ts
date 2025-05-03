/**
 * HTML parser for Dutchie dispensary menus
 * Using deno-dom to parse the HTML and extract product information
 */
import { DOMParser, Element } from "https://deno.land/x/deno_dom@v0.1.45/deno-dom-wasm.ts";
import { ProductSchema } from "../shared/types.ts";

/**
 * Parse HTML content to extract product information from Dutchie menus
 * 
 * @param htmlContent The HTML content of the dispensary menu page
 * @returns Array of products or null if parsing failed
 */
export function parseHtml(htmlContent: string): ProductSchema[] | null {
  if (!htmlContent) {
    console.error("No HTML content provided for parsing");
    return null;
  }

  try {
    const products: ProductSchema[] = [];
    const document = new DOMParser().parseFromString(htmlContent, "text/html");
    
    if (!document) {
      console.error("Failed to parse HTML document");
      return null;
    }

    // Common selectors for Dutchie menu products
    // Note: These selectors may need adjustment based on specific Dutchie menu structure
    const productElements = document.querySelectorAll(".product-card, .product-container, [data-testid='product-card']");
    
    if (!productElements || productElements.length === 0) {
      // Try alternative selectors if standard ones don't match
      const alternativeElements = document.querySelectorAll(
        ".menu-item, .dutchie-product, .product-tile, article, .product-item, [data-testid*='product']"
      );
      
      if (!alternativeElements || alternativeElements.length === 0) {
        console.warn("No product elements found in HTML");
        return extractProductsFallback(document);
      }
      
      // Use alternative elements if found
      productElements.forEach = Array.prototype.forEach;
      productElements.forEach((element: Element) => {
        const product = extractProductDataFromElement(element);
        if (product) {
          products.push(product);
        }
      });
    } else {
      // Use standard elements
      productElements.forEach = Array.prototype.forEach;
      productElements.forEach((element: Element) => {
        const product = extractProductDataFromElement(element);
        if (product) {
          products.push(product);
        }
      });
    }

    // If no products found with direct method, try a more aggressive approach
    if (products.length === 0) {
      return extractProductsFallback(document);
    }

    console.log(`Successfully parsed ${products.length} products from HTML`);
    return products;
  } catch (error) {
    console.error("Error parsing HTML:", error);
    return null;
  }
}

/**
 * Extract product data from a single product element
 * 
 * @param element The DOM element representing a product
 * @returns ProductSchema object or null if extraction failed
 */
function extractProductDataFromElement(element: Element): ProductSchema | null {
  try {
    // Try multiple potential selectors for each field
    const productName = 
      getTextContent(element.querySelector(".name, .product-name, .title, h3, [data-testid*='name']")) ||
      getTextContent(element.querySelector("h2, h3, h4")) ||
      "";
    
    const priceElement = 
      element.querySelector(".price, .product-price, [data-testid*='price']") ||
      element.querySelector("span:contains('$'), div:contains('$')");
    
    let price = priceElement ? getTextContent(priceElement) : "";
    
    // Extract price with regex if direct selector didn't work
    if (!price || !price.includes("$")) {
      price = extractPriceFromText(element.textContent);
    }
    
    const weightElement = 
      element.querySelector(".weight, .size, .product-weight, .product-size") ||
      element.querySelector("span:contains('g'), span:contains('oz'), span:contains('mg')");
    
    let weightOrSize = weightElement ? getTextContent(weightElement) : "";
    
    // Extract weight/size with regex if direct selector didn't work
    if (!weightOrSize) {
      weightOrSize = extractWeightFromText(element.textContent);
    }
    
    // Only return if we have at least a product name and price
    if (productName && price) {
      return {
        product_name: productName.trim(),
        price: price.trim(),
        weight_or_size: weightOrSize ? weightOrSize.trim() : undefined
      };
    }
    
    return null;
  } catch (error) {
    console.warn("Error extracting product data from element:", error);
    return null;
  }
}

/**
 * Extract product information using a more aggressive approach
 * This is a fallback when standard selectors don't work
 * 
 * @param document The parsed HTML document
 * @returns Array of products or empty array if extraction failed
 */
function extractProductsFallback(document: Document): ProductSchema[] {
  const products: ProductSchema[] = [];
  
  try {
    // Look for price patterns in the entire document
    const allElements = document.querySelectorAll("div, span, p");
    
    // Set to track processed elements to avoid duplicates
    const processedElements = new Set<Element>();
    
    allElements.forEach = Array.prototype.forEach;
    allElements.forEach((element: Element) => {
      if (processedElements.has(element)) return;
      
      const text = element.textContent;
      
      // Check if element likely contains a product with price
      if (text.includes("$") && text.length > 10 && text.length < 500) {
        const price = extractPriceFromText(text);
        
        if (price) {
          // Look for a possible product name in this element or nearby elements
          let productName = "";
          let weightOrSize = extractWeightFromText(text);
          
          // First try to find the product name in current element text
          // Remove price and weight information to isolate name
          productName = text
            .replace(/\$\d+(\.\d+)?/g, "") // Remove price
            .replace(/\b\d+(\.\d+)?\s*(g|gram|oz|ounce|mg|ml)\b/gi, "") // Remove weight
            .replace(/\s+/g, " ") // Normalize whitespace
            .trim();
          
          // If the sanitized text is too short, it's probably not a good product name
          if (productName.length < 3) {
            // Try parent or previous sibling for product name
            const parent = element.parentElement;
            const previousSibling = element.previousElementSibling;
            
            if (parent && !processedElements.has(parent)) {
              const parentText = parent.textContent.replace(text, "").trim();
              if (parentText.length > 3 && parentText.length < 100) {
                productName = parentText;
                processedElements.add(parent);
              }
            } else if (previousSibling && !processedElements.has(previousSibling)) {
              productName = previousSibling.textContent.trim();
              if (productName.length > 3 && productName.length < 100) {
                processedElements.add(previousSibling);
              } else {
                productName = "";
              }
            }
          }
          
          // Only add if we found a reasonable product name
          if (productName && productName.length > 3) {
            products.push({
              product_name: productName,
              price,
              weight_or_size: weightOrSize || undefined
            });
            
            // Mark this element as processed
            processedElements.add(element);
          }
        }
      }
    });
    
    console.log(`Fallback extraction found ${products.length} potential products`);
    return products;
  } catch (error) {
    console.error("Error in fallback extraction:", error);
    return [];
  }
}

/**
 * Safely get text content from an element
 * 
 * @param element The DOM element or null
 * @returns The text content or empty string
 */
function getTextContent(element: Element | null): string {
  if (!element) return "";
  return element.textContent.trim();
}

/**
 * Extract price from text using regex
 * 
 * @param text The text to extract price from
 * @returns Extracted price or empty string
 */
function extractPriceFromText(text: string): string {
  // Match patterns like $50, $50.00, $15/g, etc.
  const priceMatch = text.match(/\$\d+(\.\d+)?(\s*\/\s*\d*\.?\d*\s*[a-z]+)?/i);
  return priceMatch ? priceMatch[0] : "";
}

/**
 * Extract weight or size information from text using regex
 * 
 * @param text The text to extract weight/size from
 * @returns Extracted weight/size or empty string
 */
function extractWeightFromText(text: string): string {
  // Match patterns like 3.5g, 1oz, 100mg, etc.
  const weightMatch = text.match(/\b\d+(\.\d+)?\s*(g|gram|oz|ounce|mg|ml)\b/i);
  return weightMatch ? weightMatch[0] : "";
}