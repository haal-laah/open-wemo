/**
 * Open Wemo Service Worker
 *
 * Caching strategy:
 * - Static assets: Cache-first (HTML, CSS, JS, icons)
 * - API calls: Network-first with timeout fallback
 */

const CACHE_NAME = "open-wemo-v2";
const STATIC_CACHE = "open-wemo-static-v2";

// Static assets to cache on install
const STATIC_ASSETS = [
  "/",
  "/index.html",
  "/css/style.css",
  "/js/app.js",
  "/js/api.js",
  "/js/setup-mode.js",
  "/manifest.json",
  "/icons/icon.svg",
];

// Install event - cache static assets
self.addEventListener("install", (event) => {
  console.log("[SW] Installing service worker...");

  event.waitUntil(
    caches
      .open(STATIC_CACHE)
      .then((cache) => {
        console.log("[SW] Caching static assets");
        return cache.addAll(STATIC_ASSETS);
      })
      .then(() => {
        console.log("[SW] Static assets cached");
        return self.skipWaiting();
      })
      .catch((error) => {
        console.error("[SW] Failed to cache static assets:", error);
      })
  );
});

// Activate event - clean up old caches
self.addEventListener("activate", (event) => {
  console.log("[SW] Activating service worker...");

  event.waitUntil(
    caches
      .keys()
      .then((cacheNames) => {
        return Promise.all(
          cacheNames
            .filter((name) => name !== STATIC_CACHE && name !== CACHE_NAME)
            .map((name) => {
              console.log("[SW] Deleting old cache:", name);
              return caches.delete(name);
            })
        );
      })
      .then(() => {
        console.log("[SW] Service worker activated");
        return self.clients.claim();
      })
  );
});

// Fetch event - handle requests
self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);

  // Skip non-GET requests
  if (request.method !== "GET") {
    return;
  }

  // API requests - network first with timeout
  if (url.pathname.startsWith("/api/")) {
    event.respondWith(networkFirstWithTimeout(request, 5000));
    return;
  }

  // Static assets - cache first
  event.respondWith(cacheFirst(request));
});

/**
 * Cache-first strategy for static assets.
 * Returns cached response if available, otherwise fetches from network.
 */
async function cacheFirst(request) {
  const cachedResponse = await caches.match(request);

  if (cachedResponse) {
    return cachedResponse;
  }

  try {
    const networkResponse = await fetch(request);

    // Cache successful responses
    if (networkResponse.ok) {
      const cache = await caches.open(STATIC_CACHE);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.error("[SW] Fetch failed:", error);

    // Return offline fallback for navigation requests
    if (request.mode === "navigate") {
      return caches.match("/index.html");
    }

    throw error;
  }
}

/**
 * Network-first strategy with timeout for API calls.
 * Tries network first, falls back to cache if timeout or error.
 */
async function networkFirstWithTimeout(request, timeout) {
  try {
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeout);

    const networkResponse = await fetch(request, {
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    // Cache successful API responses
    if (networkResponse.ok) {
      const cache = await caches.open(CACHE_NAME);
      cache.put(request, networkResponse.clone());
    }

    return networkResponse;
  } catch (error) {
    console.warn("[SW] Network request failed, checking cache:", error.message);

    // Try to return cached response
    const cachedResponse = await caches.match(request);

    if (cachedResponse) {
      console.log("[SW] Returning cached API response");
      return cachedResponse;
    }

    // Return offline error response
    return new Response(
      JSON.stringify({
        error: true,
        code: "OFFLINE",
        message: "You appear to be offline. Please check your connection.",
      }),
      {
        status: 503,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
}

// Handle messages from the main app
self.addEventListener("message", (event) => {
  if (event.data === "skipWaiting") {
    self.skipWaiting();
  }
});
