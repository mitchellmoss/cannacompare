// Test file for the HTML parser
import { parseHtml } from "./html_parser.ts";
import { ProductSchema } from "../shared/types.ts";

// Mock HTML content to test parsing logic
const mockHtml = `
<!DOCTYPE html>
<html>
<head>
  <title>Dispensary Menu</title>
</head>
<body>
  <div class="menu-container">
    <!-- Test product 1: Standard product card format -->
    <div class="product-card">
      <h3 class="product-name">Blue Dream</h3>
      <div class="product-price">$45.00</div>
      <div class="product-weight">3.5g</div>
    </div>
    
    <!-- Test product 2: Alternative format -->
    <div class="menu-item">
      <div class="title">OG Kush</div>
      <span class="price">$50</span>
      <span class="size">1/8 oz</span>
    </div>
    
    <!-- Test product 3: Minimal format -->
    <article>
      <h4>Purple Punch</h4>
      <div>$60.00 / 7g</div>
    </article>
    
    <!-- Test product 4: Complex nested format -->
    <div class="product-container">
      <div class="info-container">
        <span class="name">Wedding Cake</span>
      </div>
      <div class="pricing-container">
        <span>$55.00</span>
        <div class="weight">3.5g</div>
      </div>
    </div>
  </div>
</body>
</html>
`;

// Run the test
console.log("Testing HTML parser with mock data...");
const products = parseHtml(mockHtml);

if (products && products.length > 0) {
  console.log(`✅ Successfully parsed ${products.length} products:`);
  products.forEach((product: ProductSchema, index: number) => {
    console.log(`Product ${index + 1}:`);
    console.log(`  Name: ${product.product_name}`);
    console.log(`  Price: ${product.price}`);
    console.log(`  Weight/Size: ${product.weight_or_size || "N/A"}`);
    console.log();
  });
} else {
  console.error("❌ Failed to parse products from mock HTML");
}

// Test with a more complex scenario
const complexHtml = `
<!DOCTYPE html>
<html>
<body>
  <div class="dispensary-menu">
    <div class="category">
      <h2>Flower</h2>
      <div class="product-list">
        <div>
          <div>Sour Diesel</div>
          <div>Premium strain with strong effects</div>
          <div>$45.00</div>
          <div>3.5g</div>
        </div>
        <div>
          <div>Girl Scout Cookies</div>
          <div>Sweet and earthy flavor</div>
          <div>$50.00</div>
          <div>1/8 oz</div>
        </div>
      </div>
    </div>
    <div class="category">
      <h2>Concentrates</h2>
      <div class="product-list">
        <div>
          <div>Live Resin</div>
          <div>High terpene extract</div>
          <div>$40.00</div>
          <div>1g</div>
        </div>
      </div>
    </div>
  </div>
</body>
</html>
`;

console.log("\nTesting HTML parser with complex mock data...");
const complexProducts = parseHtml(complexHtml);

if (complexProducts && complexProducts.length > 0) {
  console.log(`✅ Successfully parsed ${complexProducts.length} products from complex HTML:`);
  complexProducts.forEach((product: ProductSchema, index: number) => {
    console.log(`Product ${index + 1}:`);
    console.log(`  Name: ${product.product_name}`);
    console.log(`  Price: ${product.price}`);
    console.log(`  Weight/Size: ${product.weight_or_size || "N/A"}`);
    console.log();
  });
} else {
  console.error("❌ Failed to parse products from complex mock HTML");
}

// Instructions on how to run the test
console.log("\nTo run this test, use the following command:");
console.log("deno run --allow-net --allow-read --allow-write src/scraper/html_parser_test.ts");