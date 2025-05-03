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
- Local SQLite database for data storage
- Web interface for searching and comparing product prices
- Support for multiple dispensaries
- Robust error handling and logging

## Technology Stack

- **Deno**: Modern, secure TypeScript runtime
- **Firecrawl API**: Web scraping service with LLM extraction
- **SQLite**: Lightweight relational database
- **Oak**: Deno web framework for the HTTP server

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
│   │   └── main_scraper.ts       # Main scraping orchestration script
│   ├── db/
│   │   ├── schema.sql            # SQL schema definition
│   │   └── database.ts           # SQLite connection and query functions
│   ├── web/
│   │   ├── server.ts             # Oak web server setup
│   │   ├── routes.ts             # API endpoint definitions
│   │   └── public/               # Static frontend files
│   │       ├── index.html
│   │       ├── styles.css
│   │       └── script.js
│   └── shared/
│       └── types.ts              # Shared TypeScript types
└── target_dispensaries.json  # List of target dispensary menu URLs
```

## Setup Instructions

1. **Clone the repository:**
   ```bash
   git clone https://github.com/yourusername/dutchiescraper.git
   cd dutchiescraper
   ```

2. **Configure environment variables:**
   Update the `.env` file with your Firecrawl API key and other settings:
   ```
   FIRECRAWL_API_KEY="fc-YOUR_API_KEY_HERE"
   DATABASE_PATH="./dispensary_data.db"
   TARGET_URLS_FILE="./target_dispensaries.json"
   SERVER_PORT=8000
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
   deno run --allow-read --allow-write --allow-env src/scraper/main_scraper.ts
   ```

5. **Run the web server:**
   ```bash
   deno run --allow-net --allow-read --allow-write --allow-env src/web/server.ts
   ```

6. **Access the web interface:**
   Open your browser and navigate to `http://localhost:8000`

## Usage

### Running the Scraper

To scrape product data from all configured dispensaries:

```bash
deno run --allow-net --allow-read --allow-write --allow-env src/scraper/main_scraper.ts
```

This command:
1. Loads the list of dispensaries from `target_dispensaries.json`
2. Scrapes each menu URL using the Firecrawl API
3. Stores the product data in the SQLite database

### Setting Up Recurring Scraping

For automatic updates, set up a cron job (Linux/macOS) or scheduled task (Windows).

Example cron entry (runs daily at 2 AM):
```
0 2 * * * /path/to/deno run --allow-net --allow-read --allow-write --allow-env /path/to/dutchiescraper/src/scraper/main_scraper.ts >> /path/to/dutchiescraper/scrape_cron.log 2>&1
```

### Web Interface

The web interface provides a simple way to search and compare product prices:

1. Enter a product name in the search box (e.g., "Blue Dream", "OG Kush")
2. Filter results by dispensary using the dropdown
3. View price comparisons across different dispensaries

## License

This project is provided for educational purposes only. See the LICENSE file for details.

## Acknowledgements

- [Deno](https://deno.land/) - The secure runtime for JavaScript and TypeScript
- [Firecrawl](https://www.firecrawl.dev/) - Web scraping API with LLM capabilities
- [Oak](https://deno.land/x/oak) - Middleware framework for Deno's HTTP server
- [SQLite](https://www.sqlite.org/) - Embedded database