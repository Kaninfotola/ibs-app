const CACHE_NAME = "ibs-cache-v3.5.2";

const FILES_TO_CACHE = [
  "/",
  "/index.html",
  "/style.css",
  "/core-utils.js",
  "/record-utils.js",
  "/food-utils.js",
  "/history-utils.js",
  "/app.js",
  "/monthly-wrapped.js",
  "/manifest.json",
  "/icon.png",
  "/1.png",
  "/2.png",
  "/3.png",
  "/4.png",
  "/5.png",
  "/6.png",
  "/7.png"
];

self.addEventListener("install", event => {
  self.skipWaiting();

  event.waitUntil(
    caches.open(CACHE_NAME).then(cache => {
      return cache.addAll(FILES_TO_CACHE);
    })
  );

});

self.addEventListener("activate", event => {

  event.waitUntil(
    caches.keys().then(keys => {

      return Promise.all(
        keys.map(key => {

          if (key !== CACHE_NAME) {
            return caches.delete(key);
          }

        })
      ).then(() => self.clients.claim());

    })
  );

});