// Offline support for BCX Fault Tags. The version changes whenever the app changes.
const CACHE = "fault-tags-v2-17-20261125";
const EXCLUDE = []; // other apps in sub-folders of this site keep their own offline copy
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const BASE = new URL("./", self.registration.scope).pathname;
const mine = url => { const u = new URL(url); return u.origin !== location.origin || (u.pathname.startsWith(BASE) && !EXCLUDE.some(x => u.pathname.startsWith(BASE + x))); };
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => { const old = ks.filter(k => (k.startsWith("fault-tags-") || k.startsWith("boot-recon-") && "fault-tags" === "boot-recon") && k !== CACHE); return Promise.all(old.map(k => caches.delete(k))).then(() => self.clients.claim()).then(() => { if (old.length) tellUpdated(); }); })); });
// v2.17: tell the open app when a newer version has been saved, so it can offer "Update"
let UPDATED = false;
const tellUpdated = () => { UPDATED = true; self.clients.matchAll({type: "window"}).then(cs => cs.forEach(c => c.postMessage({type: "bcx-updated"}))); };
self.addEventListener("message", e => { if (e.data && e.data.type === "bcx-ask" && UPDATED && e.source) e.source.postMessage({type: "bcx-updated"}); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !mine(req.url)) return;
  if (req.mode === "navigate") {
    const p = new URL(req.url).pathname;
    if (p !== BASE && p !== BASE + "index.html") return;
    // v2.17: open the saved copy straight away - no waiting for signal. A newer copy is fetched in the background,
    // saved, and the open app is told ("A new version is ready - Update").
    const net = fetch(req, {cache: "no-store"}).then(async r => {
      if (!r.ok) throw new Error("bad response");
      const a = r.clone(), b = r.clone(), fresh = await a.text();
      const old = await caches.match("./index.html").then(s => s ? s.text() : null);
      await caches.open(CACHE).then(k => k.put("./index.html", b));
      if (old !== null && old !== fresh) tellUpdated();
      return r;
    });
    e.waitUntil(net.catch(() => {}));
    e.respondWith(caches.match("./index.html").then(saved => saved || net.catch(() => fetch(req))));
    return;
  }
  e.respondWith(caches.match(req).then(hit => hit || fetch(req).then(r => {
    if (r.ok || r.type === "opaque") { const c = r.clone(); caches.open(CACHE).then(k => k.put(req, c)); }
    return r;
  }).catch(() => hit)));
});
