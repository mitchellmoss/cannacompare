/**
 * Batch embedding generation script
 * This script can be run to generate embeddings for all products in the database
 */

// Set timeout to ensure we don't run out of memory on large datasets
setTimeout(() => {
  console.log("Embedding generation timeout reached (30 minutes)");
  process.exit(1);
}, 30 * 60 * 1000);

// Main function to process embeddings
async function generateAllEmbeddings() {
  console.log("Starting batch embedding generation...");
  
  try {
    // Fetch the endpoint with force=true to generate embeddings
    const products = await fetch('/api/products/search?q=')
      .then(response => response.json())
      .then(result => result.data || []);
    
    console.log(`Found ${products.length} products to process`);
    
    // Process in small batches to avoid overloading the server
    const batchSize = 5;
    let processed = 0;
    
    for (let i = 0; i < products.length; i += batchSize) {
      const batch = products.slice(i, i + batchSize);
      
      console.log(`Processing batch ${Math.floor(i/batchSize) + 1}/${Math.ceil(products.length/batchSize)}`);
      
      // Process each product in the batch
      const promises = batch.map(product => {
        if (!product.id) return Promise.resolve();
        
        return fetch(`/api/products/${product.id}/similar?force=true`)
          .then(response => {
            if (!response.ok) {
              throw new Error(`Failed to process product ${product.id}: ${response.status}`);
            }
            processed++;
            return response.json();
          })
          .catch(error => {
            console.error(`Error processing product ${product.id}:`, error);
          });
      });
      
      // Wait for the entire batch to complete before moving to the next
      await Promise.all(promises);
      
      // Wait a bit between batches to avoid overloading the server
      if (i + batchSize < products.length) {
        console.log("Waiting 2 seconds before next batch...");
        await new Promise(resolve => setTimeout(resolve, 2000));
      }
    }
    
    console.log(`Completed embedding generation for ${processed} products`);
  } catch (error) {
    console.error("Error in batch embedding process:", error);
  }
}

// Start the process when the script is loaded
generateAllEmbeddings();