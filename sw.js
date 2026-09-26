'use strict';
const SCOPE=new URL(self.registration.scope);
const CACHE_PREFIX=`covoiturage-itineraires-${encodeURIComponent(SCOPE.pathname)}-`;
const CACHE=`${CACHE_PREFIX}v7`;
const CORE=['./','./index.html','./styles.css?v=7','./app.js?v=7','./manifest.webmanifest?v=7','./banner.png','./icon.png?v=7','./apple-touch-icon.png?v=7','./favicon-32.png?v=7','./icon-192.png?v=7','./icon-512.png?v=7','./icon-maskable-512.png?v=7'];
const ALLOWED=new Set(CORE.map(path=>new URL(path,SCOPE).href));
const INDEX=new URL('./index.html',SCOPE).href;

// Wait for the previous application to close: do not replace an open form.
self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(CORE)));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.map(async key=>{
      if(key===CACHE) return;
      if(key.startsWith(CACHE_PREFIX)){await caches.delete(key);return;}

    }));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET' || !ALLOWED.has(request.url)) return;
  event.respondWith((async()=>{
    const cache=await caches.open(CACHE);
    const key=request.mode==='navigate'?INDEX:request;
    const cached=await cache.match(key);
    if(cached) return cached;
    try{
      const response=await fetch(request);
      if(response.ok && response.type==='basic') await cache.put(key,response.clone());
      return response;
    }catch{return Response.error();}
  })());
});

