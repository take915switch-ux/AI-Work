const CACHE='optical-ray-lab-v2';
const ASSETS=['./manifest.webmanifest','./icon.svg','./icon-192.png','./icon-512.png','./apple-touch-icon.png'];
const OLD1="S={o:{x:-40,h:15,dir:'right'},n:21,grid:false,e:[]}";
const NEW1="S={o:{x:-30,h:10,dir:'right'},n:21,grid:false,e:[]}";
const OLD2="function standard(){S.o={x:-40,h:15,dir:'right'};S.e=[];add('convexLens',5,24,44);add('concaveMirror',62,28,48,'left');sync()}";
const NEW2="function standard(){S.o={x:-30,h:10,dir:'right'};S.e=[];add('convexLens',0,12,80);add('concaveLens',12,10,80);sync()}";
async function patchedIndex(){const r=await fetch('./index.html',{cache:'no-store'});let t=await r.text();t=t.replace(OLD1,NEW1).replace(OLD2,NEW2);return new Response(t,{headers:{'Content-Type':'text/html; charset=utf-8'}})}
self.addEventListener('install',e=>e.waitUntil((async()=>{const c=await caches.open(CACHE);await c.addAll(ASSETS);await c.put('./index.html',await patchedIndex());self.skipWaiting()})()));
self.addEventListener('activate',e=>e.waitUntil((async()=>{for(const k of await caches.keys())if(k!==CACHE)await caches.delete(k);await self.clients.claim()})()));
self.addEventListener('fetch',e=>{if(e.request.method!=='GET')return;const u=new URL(e.request.url);if(u.origin===location.origin&&(u.pathname.endsWith('/optical-ray-lab/')||u.pathname.endsWith('/optical-ray-lab/index.html'))){e.respondWith(caches.open(CACHE).then(c=>c.match('./index.html')).then(r=>r||patchedIndex()));return}e.respondWith(caches.match(e.request).then(hit=>hit||fetch(e.request).then(r=>{const copy=r.clone();caches.open(CACHE).then(c=>c.put(e.request,copy));return r}))) });