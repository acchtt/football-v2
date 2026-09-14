const CACHE='sliptrace-shell-v1';
const BASE=new URL('./',self.location.href).pathname;
const SHELL=[
  BASE,
  `${BASE}index.html`,
  `${BASE}app-v2.css?v=1`,
  `${BASE}app-polish.css?v=3`,
  `${BASE}graphics-v2.css?v=1`,
  `${BASE}graphics-v3.css?v=1`,
  `${BASE}mobile-v1.css?v=1`,
  `${BASE}manifest.webmanifest`,
  `${BASE}icons/sliptrace.svg`,
  `${BASE}icons/sliptrace-maskable.svg`
];

self.addEventListener('install',event=>{
  event.waitUntil(caches.open(CACHE).then(cache=>cache.addAll(SHELL)).then(()=>self.skipWaiting()));
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('fetch',event=>{
  const req=event.request;
  if(req.method!=='GET')return;
  const url=new URL(req.url);
  if(url.origin!==self.location.origin)return;

  if(req.mode==='navigate'){
    event.respondWith((async()=>{
      try{
        const fresh=await fetch(req);
        const cache=await caches.open(CACHE);
        cache.put(`${BASE}index.html`,fresh.clone());
        return fresh;
      }catch{
        return (await caches.match(`${BASE}index.html`)) || (await caches.match(BASE));
      }
    })());
    return;
  }

  event.respondWith((async()=>{
    const cached=await caches.match(req);
    const network=fetch(req).then(async res=>{
      if(res && res.ok){
        const cache=await caches.open(CACHE);
        cache.put(req,res.clone());
      }
      return res;
    }).catch(()=>null);
    return cached || (await network) || new Response('',{status:504,statusText:'Offline'});
  })());
});

self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json()||{};}catch{payload={body:event.data?.text()||''};}
  const matchId=payload.matchId||payload.match_id||'';
  const title=payload.title||'SlipTrace Football';
  const options={
    body:payload.body||'A selected match has an update.',
    icon:`${BASE}icons/sliptrace.svg`,
    badge:`${BASE}icons/sliptrace.svg`,
    tag:payload.tag||`sliptrace-${matchId||'update'}`,
    renotify:true,
    data:{url:payload.url||`${BASE}${matchId?`#match/${matchId}`:'#today'}`}
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=event.notification?.data?.url||`${BASE}#today`;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if('focus' in client){
        await client.navigate(target);
        return client.focus();
      }
    }
    return clients.openWindow(target);
  })());
});
