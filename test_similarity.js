// Script to test the similarity search functionality
// Run with: deno run --allow-net test_similarity.js "your search query"

// Server URL
const serverUrl = "http://localhost:8000";

// Function to search for similar products
async function searchSimilarProducts(query) {
  if (!query) {
    console.error("Please provide a search query as an argument");
    console.log("Example: deno run --allow-net test_similarity.js \"blue dream\"");
    return;
  }

  console.log(`Searching for products similar to: "${query}"`);
  
  try {
    const response = await fetch(
      `${serverUrl}/api/products/similar?q=${encodeURIComponent(query)}&limit=5`,
      {
        method: "GET",
        headers: {
          "Accept": "application/json"
        }
      }
    );
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    
    if (result.success && result.data.length > 0) {
      console.log(`Found ${result.data.length} similar products:`);
      console.log("-".repeat(50));
      
      result.data.forEach((product, index) => {
        console.log(`${index + 1}. ${product.product_name}`);
        console.log(`   Price: ${product.price}`);
        if (product.weight_or_size) {
          console.log(`   Size: ${product.weight_or_size}`);
        }
        console.log(`   Dispensary: ${product.dispensary_name}`);
        console.log("-".repeat(50));
      });
    } else {
      console.log("No similar products found.");
    }
  } catch (error) {
    console.error("Error searching for similar products:", error.message);
  }
}

// Get the search query from command line arguments
const query = Deno.args[0];

// Execute immediately
searchSimilarProducts(query);