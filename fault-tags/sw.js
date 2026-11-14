// Offline support for BCX Fault Tags. The version changes whenever the app changes.
const CACHE = "fault-tags-v2-8-20261114";
const EXCLUDE = []; // other apps in sub-folders of this site keep their own offline copy
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const BASE = new URL("./", self.registration.scope).pathname;
const mine = url => { const u = new URL(url); return u.origin !== location.origin || (u.pathname.startsWith(BASE) && !EXCLUDE.some(x => u.pathname.startsWith(BASE + x))); };
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith("fault-tags-") || k.startsWith("boot-recon-") && "fault-tags" === "boot-recon") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !mine(req.url)) return;
  if (req.mode === "navigate") {
    const p = new URL(req.url).pathname;
    if (p !== BASE && p !== BASE + "index.html") return;
    // Fresh copy if the site answers within 3 seconds; otherwise open the saved copy straight away (weak signal must
    // never leave the app stuck on the logo). The download carries on in the background and is saved for next time.
    const net = fetch(req).then(r => {
      if (!r.ok) throw new Error("bad response");
      const c = r.clone(); caches.open(CACHE).then(k => k.put("./index.html", c)); return r;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match("./index.html").then(saved => {
      if (!saved) return net.catch(() => fetch(req));
      return Promise.race([net, new Promise((_, no) => setTimeout(() => no(new Error("slow")), 3000))]).catch(() => saved);
    }));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  }).catch(() => hit)));
});
