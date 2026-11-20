// Offline support for BCX Spares Custody. The version changes whenever the app changes.
const CACHE = "custody-v4-11-20261120";
const EXCLUDE = []; // other apps in sub-folders of this site keep their own offline copy
const CORE = ["./", "./index.html", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png", "./icon-maskable-512.png"];
const BASE = new URL("./", self.registration.scope).pathname;
const mine = url => { const u = new URL(url); return u.origin !== location.origin || (u.pathname.startsWith(BASE) && !EXCLUDE.some(x => u.pathname.startsWith(BASE + x))); };
self.addEventListener("install", e => { e.waitUntil(caches.open(CACHE).then(c => c.addAll(CORE)).then(() => self.skipWaiting())); });
self.addEventListener("activate", e => { e.waitUntil(caches.keys().then(ks => Promise.all(ks.filter(k => (k.startsWith("custody-") || k.startsWith("boot-recon-") && "custody" === "boot-recon") && k !== CACHE).map(k => caches.delete(k)))).then(() => self.clients.claim())); });
self.addEventListener("fetch", e => {
  const req = e.request;
  if (req.method !== "GET" || !mine(req.url) || /script\.google/.test(req.url)) return;
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

/* v4.10: background sending. The app keeps a copy of the waiting handovers / collections in IndexedDB ("ct-bg");
   Android wakes this up when there's signal (even with the app closed) and they go into the custody log.
   The script ignores a second copy of the same one (Client ID), so the app sending it again later is safe. */
const bgOpen = () => new Promise((ok, no) => { const r = indexedDB.open("ct-bg", 1); r.onupgradeneeded = () => r.result.createObjectStore("kv"); r.onsuccess = () => ok(r.result); r.onerror = () => no(r.error); });
const bgGet = async k => { const d = await bgOpen(); return new Promise((ok, no) => { const r = d.transaction("kv").objectStore("kv").get(k); r.onsuccess = () => { d.close(); ok(r.result); }; r.onerror = () => { d.close(); no(r.error); }; }); };
const bgPut = async (k, v) => { const d = await bgOpen(); return new Promise((ok, no) => { const t = d.transaction("kv", "readwrite"); t.objectStore("kv").put(v, k); t.oncomplete = () => { d.close(); ok(); }; t.onerror = () => { d.close(); no(t.error); }; }); };
async function bgSend(retryOnFail) {
  // the app is open on the screen: it sends them itself
  const wins = await self.clients.matchAll({type: "window", includeUncontrolled: true});
  if (wins.some(c => c.visibilityState === "visible" && new URL(c.url).pathname.startsWith(BASE))) return;
  const job = await bgGet("job"); if (!job || !job.url || !job.token || !job.items || !job.items.length) return;
  const sent = (await bgGet("sent")) || {}; let failed = false;
  for (const it of job.items) {
    if (sent[it.id]) continue;
    try {
      const r = await fetch(job.url, {method: "POST", body: JSON.stringify(Object.assign({action: it.action, token: job.token}, it.payload)), redirect: "follow"});
      const j = await r.json();
      if (j.ok) { sent[it.id] = {at: Date.now(), ref: j.ref || (j.results ? j.results.map(x => x.ref).join(", ") : "")}; await bgPut("sent", sent); }
      // a real refusal (e.g. a duplicate) is left for the app to show when it's opened
    } catch (e) { failed = true; break; }
  }
  const ids = new Set(job.items.map(i => i.id)); Object.keys(sent).forEach(k => { if (!ids.has(k)) delete sent[k]; }); await bgPut("sent", sent);
  if (failed && retryOnFail) throw new Error("No signal yet - Android tries again later.");
}
self.addEventListener("sync", e => { if (e.tag === "ct-queue") e.waitUntil(bgSend(true)); });
self.addEventListener("periodicsync", e => { if (e.tag === "ct-queue-p") e.waitUntil(bgSend(false)); });
