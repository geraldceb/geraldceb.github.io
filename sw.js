// Offline support for BCX Boot Stock Recon. The version changes whenever the app changes.
const CACHE = "boot-recon-00bfe1b1";
const EXCLUDE = ["store-visit/"]; // other apps in sub-folders of this site keep their own offline copy
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const BASE = new URL("./", self.registration.scope).pathname;
const mine = url => { const u = new URL(url); return u.origin !== location.origin || (u.pathname.startsWith(BASE) && !EXCLUDE.some(x => u.pathname.startsWith(BASE + x))); };
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith("boot-recon-") || k.startsWith("boot-recon-") && "boot-recon" === "boot-recon") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !mine(req.url)) return;
  if (req.mode === "navigate") {
    const p = new URL(req.url).pathname;
    if (p !== BASE && p !== BASE + "index.html") return;
    // Use the site only when it answers properly; otherwise (offline, site gone, error page) keep the saved copy.
    e.respondWith(fetch(req).then(r => {
      if (!r.ok) throw new Error("bad response");
      const c = r.clone(); caches.open(CACHE).then(k => k.put("./index.html", c)); return r;
    }).catch(() => caches.match("./index.html").then(hit => hit || fetch(req))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  }).catch(() => hit)));
});
