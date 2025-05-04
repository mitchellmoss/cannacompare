# Cannabis Product Price Scraper

A web application that collects and compares cannabis product prices from dispensary websites built with Deno, Firecrawl API, and SQLite.

## 🚨 Important Legal Disclaimer

**This project is for educational and demonstration purposes only.**

The code in this repository is provided as a technical demonstration of web scraping, data storage, and data presentation techniques. Before deploying or using this application, please be aware:

1. **Terms of Service Compliance**: Many websites, including Dutchie-powered dispensary sites, explicitly prohibit automated scraping in their Terms of Service. Using this application to scrape such sites likely violates their terms.

2. **Legal Risks**: Unauthorized web scraping may expose you to legal liability, including potential lawsuits and damages claims.

3. **Responsible Usage**: If you intend to gather pricing data from dispensaries, consider:
   - Asking for explicit permission from the website owners
   - Exploring official APIs if available
   - Adhering to robots.txt directives and rate limits
   - Consulting with legal counsel regarding compliance

## Features

- Automated scraping of product data from dispensary websites
- HTML parsing for extracting product information from Dutchie menus
- Local JSON file-based data storage
- Web interface for searching and comparing product prices
- Support for multiple dispensaries
- AI-powered product similarity search using embeddings
- Cross-dispensary product comparison for price and feature matching
- Robust error handling and logging
- Smart fallback mechanisms for different menu structures

## Technology Stack

- **Deno**: Modern, secure TypeScript runtime
- **Firecrawl API**: Web scraping service with HTML or LLM extraction
- **Google Generative AI**: For generating text embeddings (text-embedding-004 model)
- **JSON Storage**: Simple file-based data persistence
- **Oak**: Deno web framework for the HTTP server
- **Deno DOM**: HTML parsing for product extraction
- **Vector Embeddings**: For semantic similarity search and product comparison

## Prerequisites

- [Deno](https://deno.land/#installation) (v1.34.0 or higher)
- [Firecrawl API key](https://www.firecrawl.dev/) (sign up required)
- [Git](https://git-scm.com/downloads) (for version control)

## Project Structure

```
/project-root
├── .env                     # Environment variables
├── src/
│   ├── scraper/
│   │   ├── firecrawl_client.ts   # Firecrawl API interaction logic
│   │   ├── html_parser.ts        # HTML parsing for Dutchie menus
│   │   └── main_scraper.ts       # Main scraping orchestration script
│   ├── db/
│   │   ├── json_storage.ts       # JSON file-based storage functions
│   │   ├── database.ts           # Database interface
│   │   └── schema.sql            # Database schema definitions
│   ├── web/
│   │   ├── server.ts             # Oak web server setup
│   │   ├── routes.ts             # API endpoint definitions
│   │   └── public/               # Static frontend files
│   │       ├── index.html        # Main search interface
│   │       ├── comparison.html   # Cross-dispensary comparison view
│   │       ├── embeddings.html   # Embedding management interface
│   │       ├── styles.css
│   │       └── script.js
│   └── shared/
│       ├── types.ts              # Shared TypeScript types
│       └── embeddings_service.ts # Google AI embeddings service
├── target_dispensaries.json  # List of target dispensary menu URLs
└── data/                    # Directory for JSON data storage
    ├── dispensaries.json    # Stored dispensary information
    ├── products.json        # Stored product information
    ├── embeddings.json      # Product embedding vectors 
    └── errors.json          # Error logging
```

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/dutchiescraper.git
   cd dutchiescraper
   ```

2. **Configure environment variables:**
   Update the `.env` file with your API keys and other settings:
   ```
   FIRECRAWL_API_KEY="fc-YOUR_API_KEY_HERE"
   GOOGLE_API_KEY="YOUR_GOOGLE_API_KEY_HERE"
   DATABASE_PATH="./dispensary_data.db"
   TARGET_URLS_FILE="./target_dispensaries.json"
   SERVER_PORT=8000
   EMBEDDING_MODEL="text-embedding-004"
   SIMILARITY_THRESHOLD=0.7
   ```

3. **Add target dispensaries:**
   Update the `target_dispensaries.json` file with your target dispensary URLs:
   ```json
   [
     {
       "name": "Example Dispensary",
       "menu_url": "https://example.com/menu"
     }
   ]
   ```

4. **Initialize the database:**
   ```bash
   deno task scrape
   ```

5. **Run the web server (with automatic daily scraping):**
   ```bash
   deno task run
   ```

6. **Access the web interface:**
   Open your browser and navigate to `http://localhost:8000`

## Usage

### Running the Scraper

To scrape product data from all configured dispensaries:

```bash
deno task scrape
```

This command:
1. Loads the list of dispensaries from `target_dispensaries.json`
2. Scrapes each menu URL using the Firecrawl API
3. Parses the HTML content to extract product information
4. Stores the product data in JSON files in the data directory

### Automatic Daily Scraping

The application includes a built-in scheduler that automatically runs the scraper once every 24 hours:

1. When you run `deno task run`, the web server starts with the scheduler service
2. The scheduler checks if 24 hours have passed since the last scraper run
3. If 24 hours have passed (or if it's the first run), the scraper runs automatically
4. The timestamp is stored in Deno KV storage for persistence across server restarts

You can also manually trigger the scheduler check:

```bash
deno task scheduler
```

To force a scraping run regardless of the time since last run:

```bash
deno task force-scrape
```

### Web Interface

The web interface provides a simple way to search and compare product prices:

1. Enter a product name in the search box (e.g., "Blue Dream", "OG Kush")
2. Filter results by dispensary using the dropdown
3. View price comparisons across different dispensaries
4. Use semantic search to find similar products based on embeddings
5. Compare products across different dispensaries using the comparison feature

#### Cross-Dispensary Comparison

The cross-dispensary comparison feature allows users to:

1. Find similar products across multiple dispensaries
2. Compare prices for equivalent products side-by-side
3. Identify the best price for similar products
4. View similar products organized by dispensary
5. Create custom side-by-side comparisons between selected products

## License

This project is provided for educational purposes only. See the LICENSE file for details.

## Acknowledgements

- [Deno](https://deno.land/) - The secure runtime for JavaScript and TypeScript
- [Firecrawl](https://www.firecrawl.dev/) - Web scraping API with LLM capabilities
- [Oak](https://deno.land/x/oak) - Middleware framework for Deno's HTTP server
- [SQLite](https://www.sqlite.org/) - Embedded database