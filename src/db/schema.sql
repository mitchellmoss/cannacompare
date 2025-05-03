-- Database schema for cannabis product price scraper

-- Dispensaries table - stores information about the dispensaries we're scraping
CREATE TABLE IF NOT EXISTS dispensaries (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE, -- Name from target_dispensaries.json
    menu_url TEXT NOT NULL UNIQUE,
    last_scraped_at DATETIME -- Timestamp of the last successful scrape
);

-- Products table - stores the scraped product information
CREATE TABLE IF NOT EXISTS products (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispensary_id INTEGER NOT NULL,
    product_name TEXT NOT NULL,
    price TEXT NOT NULL, -- Storing as TEXT for flexibility (e.g., "$50", "$15/g")
    weight_or_size TEXT, -- Can be NULL if not specified
    scraped_at DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP, -- Timestamp when this specific record was scraped
    FOREIGN KEY (dispensary_id) REFERENCES dispensaries(id) ON DELETE CASCADE
);

-- Create indexes for faster searching
CREATE INDEX IF NOT EXISTS idx_product_name ON products (product_name);
CREATE INDEX IF NOT EXISTS idx_dispensary_id ON products (dispensary_id);

-- Log table for scraping errors
CREATE TABLE IF NOT EXISTS scrape_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    dispensary_id INTEGER, -- Can be NULL if error occurs before identifying dispensary
    url TEXT,
    error_message TEXT NOT NULL,
    log_time DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    FOREIGN KEY (dispensary_id) REFERENCES dispensaries(id) ON DELETE SET NULL
);