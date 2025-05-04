-- Update schema to add embedding support for product clustering

-- Add embedding column to products table
ALTER TABLE products ADD COLUMN embedding TEXT;

-- Create table for cached similarity calculations
CREATE TABLE IF NOT EXISTS product_similarities (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    product_id INTEGER NOT NULL,
    similar_product_id INTEGER NOT NULL,
    similarity_score REAL NOT NULL, -- Between 0-1
    FOREIGN KEY (product_id) REFERENCES products(id) ON DELETE CASCADE,
    FOREIGN KEY (similar_product_id) REFERENCES products(id) ON DELETE CASCADE,
    UNIQUE(product_id, similar_product_id)
);

-- Create indexes for faster similarity lookups
CREATE INDEX IF NOT EXISTS idx_product_similarities_product_id ON product_similarities (product_id);
CREATE INDEX IF NOT EXISTS idx_product_similarities_score ON product_similarities (similarity_score);