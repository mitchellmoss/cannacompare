// Script to regenerate ALL embeddings for products with the new model
// Run with: deno run --allow-net regenerate_all_embeddings.js

// Server URL
const serverUrl = "http://localhost:8000";

// Function to regenerate all embeddings with the new model
async function regenerateAllEmbeddings() {
  console.log("Regenerating embeddings for ALL products with the new model...");
  
  try {
    const response = await fetch(`${serverUrl}/api/embeddings/generate`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        regenerateAll: true,  // Regenerate ALL embeddings
        processAll: true     // Process all products in batches
      })
    });
    
    if (!response.ok) {
      throw new Error(`Server returned ${response.status}: ${response.statusText}`);
    }
    
    const result = await response.json();
    console.log("Success!");
    console.log(result);
  } catch (error) {
    console.error("Error regenerating embeddings:", error.message);
  }
}

// Execute immediately
regenerateAllEmbeddings();