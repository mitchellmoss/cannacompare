# Changelog

## Version 1.1.0 (May 2025)

### Major Changes
- Completely rewrote the Firecrawl client to use only the `/crawl` endpoint
- Implemented robust pagination handling for comprehensive data collection
- Added polling mechanism for crawl job completion

### Enhancements
- Improved error handling and fallback mechanisms
- Enhanced product extraction from crawl results
- Added support for JSON extraction directly from crawl data
- Updated TypeScript interfaces to support the new crawl response format

### Technical Improvements
- Reduced API usage by consolidating all operations to a single endpoint
- Improved handling of large websites by supporting pagination
- Enhanced documentation with detailed explanations of the crawl-based approach

## Version 1.0.0 (Initial Release)

- Initial version of the cannabis product price scraper
- Support for multiple dispensaries
- Price history tracking
- Web interface for searching and comparing prices
- JSON file-based data storage