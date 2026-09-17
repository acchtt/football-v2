const CACHE='slate-xi-shell-v38';
const BASE=self.registration?.scope?new URL(self.registration.scope).pathname:new URL('./',self.location.href).pathname;
const asset=name=>BASE+name;
const SHELL=[
  BASE,
  asset('index.html'),
  asset('offline.html'),
  asset('design-v1.css?v=13'),
  asset('alerts-center.css?v=2'),
  asset('ive-sidebars.css?v=7'),
  asset('manifest.webmanifest?v=7'),
  asset('icons/slate-xi.svg?v=3'),
  asset('icons/slate-xi-192.svg?v=3'),
  asset('icons/slate-xi-512.svg?v=3'),
  asset('icons/slate-xi-maskable-512.svg?v=3'),
  asset('media/ive/yujin.jpg'),
  asset('media/ive/liz.jpg'),
  asset('media/ive/rei.jpg'),
  asset('media/ive/wonyoung.jpg'),
  asset('media/ive/gaeul.jpg'),
  asset('media/ive/leeseo.jpg'),
  asset('ict-slate-fetch.js?v=1'),
  asset('config.js?v=5'),
  asset('strict-board-filter.js?v=2'),
  asset('canonical-live-source.js?v=2'),
  asset('matchday-behavior.js?v=2'),
  asset('ive-sidebars.js?v=5'),
  asset('app-v2.js?v=16'),
  asset('status-sync.js?v=4'),
  asset('pwa-v2.js?v=4'),
  asset('alerts-center.js?v=3')
];

self.addEventListener('install',event=>{
  event.waitUntil((async()=>{
    const cache=await caches.open(CACHE);
    await Promise.allSettled(SHELL.map(url=>cache.add(new Request(url,{cache:'reload'}))));
    await self.skipWaiting();
  })());
});

self.addEventListener('activate',event=>{
  event.waitUntil((async()=>{
    const keys=await caches.keys();
    await Promise.all(keys.filter(key=>key!==CACHE).map(key=>caches.delete(key)));
    await self.clients.claim();
  })());
});

self.addEventListener('message',event=>{
  if(event.data?.type==='SKIP_WAITING')self.skipWaiting();
  if(event.data?.type==='TEST_NOTIFICATION'){
    event.waitUntil(self.registration.showNotification('Slate XI test',{
      body:'Notifications are working on this device.',
      icon:asset('icons/slate-xi-192.svg'),
      badge:asset('icons/slate-xi-192.svg'),
      tag:'sliptrace-local-test',
      data:{url:asset('#board')}
    }));
  }
});

async function networkFirstNavigation(request){
  try{
    const response=await fetch(request);
    if(response?.ok){
      const cache=await caches.open(CACHE);
      cache.put(asset('index.html'),response.clone());
    }
    return response;
  }catch{
    return (await caches.match(asset('index.html')))||
      (await caches.match(BASE))||
      (await caches.match(asset('offline.html')))||
      new Response('Offline',{status:503});
  }
}

async function staleWhileRevalidate(request){
  const cache=await caches.open(CACHE);
  const cached=await cache.match(request,{ignoreSearch:false});
  const refresh=fetch(request).then(response=>{
    if(response?.ok)cache.put(request,response.clone());
    return response;
  }).catch(()=>null);
  return cached||(await refresh)||new Response('',{status:504,statusText:'Offline'});
}

self.addEventListener('fetch',event=>{
  const request=event.request;
  if(request.method!=='GET')return;
  const url=new URL(request.url);
  if(url.origin!==self.location.origin)return;
  if(request.mode==='navigate'){
    event.respondWith(networkFirstNavigation(request));
    return;
  }
  event.respondWith(staleWhileRevalidate(request));
});

self.addEventListener('push',event=>{
  let payload={};
  try{payload=event.data?.json()||{};}catch{payload={body:event.data?.text()||''};}
  const matchId=String(payload.matchId||payload.match_id||'');
  const title=payload.title||'Slate XI Football';
  const destination=payload.url||self.registration.scope+(matchId?'#match/'+encodeURIComponent(matchId):'#board');
  const options={
    body:payload.body||'A selected match has an update.',
    icon:asset('icons/slate-xi-192.svg'),
    badge:asset('icons/slate-xi-192.svg'),
    tag:payload.tag||'sliptrace-'+(matchId||'update'),
    renotify:true,
    requireInteraction:false,
    data:{url:destination,matchId:matchId,type:payload.type||'update'},
    timestamp:Number(payload.timestamp)||Date.now()
  };
  event.waitUntil(self.registration.showNotification(title,options));
});

self.addEventListener('notificationclick',event=>{
  event.notification.close();
  const target=new URL(event.notification?.data?.url||'#board',self.registration.scope).href;
  event.waitUntil((async()=>{
    const windows=await clients.matchAll({type:'window',includeUncontrolled:true});
    for(const client of windows){
      if(!('focus' in client))continue;
      try{await client.navigate(target);}catch{}
      return client.focus();
    }
    return clients.openWindow(target);
  })());
});
