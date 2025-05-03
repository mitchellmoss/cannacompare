# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Build/Test/Lint Commands
- Run Deno scripts: `deno run --allow-net --allow-read --allow-write --allow-env src/scraper/main_scraper.ts`
- Run single test: `deno test --allow-net --allow-read --allow-env src/tests/specific_test.ts`
- Lint code: `deno lint src/`
- Format code: `deno fmt src/`

## Code Style Guidelines
- Use TypeScript for all Deno files with proper type annotations
- Follow camelCase for variables and functions, PascalCase for classes/interfaces
- Use async/await for asynchronous code (no raw Promises)
- Import format: `import { function } from "https://deno.land/x/module@version/path.ts";`
- Error handling: Use try/catch blocks with detailed error messages logged to console
- Database queries: Use parameterized queries to prevent SQL injection
- API responses: Standard JSON format with { success: boolean, data?: any, error?: string }
- Comments: Only for complex logic or non-obvious functionality
- Firecrawl API: Always check rate limits and credit usage