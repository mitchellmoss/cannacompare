# Bypassing Anti-Bot Measures in Dispensary Scraping

This document provides guidance on implementing more advanced techniques to bypass anti-bot measures on dispensary websites, particularly Dutchie-powered sites which use sophisticated bot detection systems.

## Implemented Solutions

The current implementation has been updated to use Firecrawl's browser simulation capabilities:

1. Browser actions are now included to simulate human-like behavior
   - Wait times between actions
   - Scrolling to load dynamic content
   - Mouse movements to defeat mouse tracking anti-bot systems
   - Element interactions (clicks, hovers) on menus and products
   
2. Dutchie-specific detection with specialized settings:
   - Extended wait times (30-35s) for dynamic content loading
   - Advanced JavaScript execution to interact with Dutchie's interface
   - Category navigation and product interaction
   - Complex mouse movement patterns that mimic human behavior
   
3. Multi-tiered approach:
   - Initial direct crawl with basic actions
   - Expanded crawl with more aggressive actions if first attempt fails
   - Fallback mechanisms as a last resort
   
4. Different crawl parameters for different sites:
   - More pages crawled for Dutchie sites (5-15) vs. others (1-10)
   - Site-specific interaction patterns
   - Dynamic wait times based on site complexity

## Additional Measures to Implement

### 1. Use Firecrawl's Webhook Features

Webhooks allow Firecrawl to process the request and send results back to your server, making the request appear more legitimate.

```typescript
// In firecrawl_client.ts, modify the params to include a webhook
const params: CrawlParams = {
  url: url,
  limit: limit,
  allowBackwardLinks: true,
  browser: true,
  webhook: "https://your-server.com/api/firecrawl-webhook",
  scrapeOptions: {
    formats: formats,
    waitFor: waitFor,
  }
};
```

You'll need to set up a server endpoint to receive webhook events:
1. Create a route in `src/web/routes.ts` to handle webhook events
2. Store the data received from the webhook in your database
3. Implement proper authentication for the webhook endpoint

### 2. Implement a Proxy Service

For the most challenging sites, consider implementing a proxy rotation service:

1. Set up a proxy service like Bright Data, Oxylabs, or ZenRows
2. Modify your Firecrawl client to use different IPs for requests

### 3. Customize User Behavior

When using browser-based crawling, simulate realistic user behavior:

```typescript
// Add these script parameters to make crawling more human-like
const params: CrawlParams = {
  // ... other params
  scrapeOptions: {
    // ... other options
    actions: [
      { type: "wait", milliseconds: 3000 },
      { type: "scroll", distance: 300 },
      { type: "wait", milliseconds: 2000 },
      { type: "scroll", distance: 300 },
      { type: "executeJavascript", script: `
        // Random mouse movement to appear more human-like
        const randomMove = () => {
          const x = Math.floor(Math.random() * window.innerWidth);
          const y = Math.floor(Math.random() * window.innerHeight);
          const event = new MouseEvent('mousemove', {
            clientX: x,
            clientY: y
          });
          document.dispatchEvent(event);
        };
        
        // Perform several random moves
        for (let i = 0; i < 10; i++) {
          randomMove();
          // Add random delays
          await new Promise(r => setTimeout(r, Math.random() * 500));
        }
      `}
    ]
  }
};
```

## Diagnostic Tools

When debugging anti-bot measures, use these diagnostic tools:

1. Enable Firecrawl's screenshot capability to see what the browser is rendering
2. Review HTTP responses for evidence of bot detection
3. Test with multiple user agent strings
4. Monitor IP reputation with services like IPQualityScore

## Legal Considerations

Remember that bypassing anti-bot measures may violate a website's Terms of Service. This guidance is provided for educational purposes only. Always:

1. Check a website's robots.txt file for scraping permissions
2. Consider the legal implications of web scraping in your jurisdiction
3. Implement reasonable rate limiting to avoid overloading servers
4. Consider reaching out to data owners for proper API access when available

## References

- [Firecrawl Documentation](https://docs.firecrawl.dev/)
- [Web Scraping Legal Guide](https://www.zyte.com/learn/is-web-scraping-legal/)
- [Ethical Web Scraping Practices](https://github.com/JonasCz/How-To-Prevent-Scraping)