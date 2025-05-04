// Script to generate embeddings for products
// Run with: deno run --allow-net generate_embeddings.js

// Server URL
const serverUrl = "http://localhost:8000";

// Function to generate embeddings (for all products)
async function generateEmbeddings() {
  console.log("Generating embeddings for products...");
  
  try {
    const response = await fetch(`${serverUrl}/api/embeddings/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({})  // Empty body is fine for generating all missing embeddings
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log("Success!");
    console.log(result);
  } catch (error) {
    console.error("Error generating embeddings:", error.message);
  }
}

// Execute immediately
generateEmbeddings();