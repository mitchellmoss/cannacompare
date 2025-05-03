# HTML Parser Implementation

This update adds HTML parsing functionality to the cannabis product scraper application. Previously, we relied solely on Firecrawl's LLM-based extraction (JSON format), which is more expensive in terms of API credits. Now, we have a robust HTML parser that can extract product information directly from the HTML content of Dutchie menus.

## What's New

1. **HTML Parser Module (`src/scraper/html_parser.ts`)**
   - Implements a flexible HTML parser using Deno DOM
   - Uses multiple selector strategies to find product elements
   - Includes fallback mechanisms for different menu structures
   - Extracts product names, prices, and weights/sizes
   - Uses regex patterns to find prices and weight information when direct selectors fail

2. **Updated Firecrawl Client**
   - Modified `src/scraper/firecrawl_client.ts` to use the HTML parser
   - Now processes HTML content from Firecrawl API responses
   - Maintains compatibility with the more expensive LLM extraction method

3. **Test Suite**
   - Added `src/scraper/html_parser_test.ts` for testing the HTML parser
   - Includes mock HTML data representing different menu structures

4. **Documentation Updates**
   - Updated README.md to reflect the new HTML parsing capability
   - Updated project structure and feature list

## Benefits

1. **Cost Savings**
   - Using HTML format instead of JSON/LLM extraction reduces Firecrawl API credit consumption by 80%
   - HTML format costs 1 credit per page vs. 5 credits for JSON format

2. **Flexibility**
   - The parser can handle various Dutchie menu structures
   - Includes multiple fallback mechanisms for different HTML layouts

3. **Robustness**
   - Uses pattern matching and context detection to find product information
   - Can extract prices and weights using regex patterns when direct selectors fail

## Usage

The HTML parser is automatically used when `USE_CHEAPER_FORMAT` is set to `true` in `firecrawl_client.ts`. This is the default setting.

To test the HTML parser independently:

```bash
deno run --allow-net --allow-read --allow-write src/scraper/html_parser_test.ts
```

## Future Improvements

1. **Enhanced Pattern Detection**
   - Add more patterns and selectors for different Dutchie menu variations
   - Implement machine learning to improve extraction accuracy

2. **Performance Optimization**
   - Benchmark and optimize the HTML parsing process
   - Implement caching for frequently visited menus

3. **Adaptive Learning**
   - Add capability to learn from successful extractions
   - Store selector patterns that work for specific dispensaries