// This is an empty service worker file to prevent 404 errors in the browser.
// The browser is requesting this file automatically, but we don't actually need 
// service worker functionality for this application.

self.addEventListener('install', (event) => {
  self.skipWaiting();
});

self.addEventListener('activate', (event) => {
  self.clients.claim();
});

// No other service worker functionality is implemented