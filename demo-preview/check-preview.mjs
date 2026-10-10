// Deterministic adapter checks plus one actual public-asset CORS check.
// No production mutations, secrets, or external dependencies.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import vm from "node:vm";
const bridge = await fs.readFile("pages/demo-api-bridge.js", "utf8");
const index = await fs.readFile("pages/index.html", "utf8");
assert(index.includes("./demo-api-bridge.js?v=3"));
assert(index.indexOf("demo-api-bridge.js") < index.indexOf("ict-slate-fetch.js"));
const called = [];
const make = (body,status=200) => new Response(JSON.stringify(body),{
  status,headers:{"Content-Type":"application/json"}
});
const mockFetch = async (input) => {
  const url = String(input);
  called.push(url);
  if (url.includes("/events/2026-10-08.json")) return make({data:{results:[
    {id:1,event_date:"2026-10-08T19:00:00Z",home_team:"A",away_team:"B"}
  ]}});
  if (url.includes("/events/2026-10-09.json")) return make({data:{results:[
    {id:2,event_date:"2026-10-09T12:00:00Z",home_team:"C",away_team:"D"}
  ]}});
  if (url.includes("/dashboard.json")) return make({ok:true,schedule:[],picks:[]});
  return make({ok:false,error:"Not found"},404);
};
const loc = {hostname:"rawcdn.githack.com",
  pathname:"/acchtt/football-v2/testcommit/pages/index.html",
  origin:"https://rawcdn.githack.com",
  href:"https://rawcdn.githack.com/acchtt/football-v2/testcommit/pages/index.html"};
const win={fetch:mockFetch,location:loc};
const attributes={};
const description={setAttribute:(key,value)=>{attributes[key]=value;}};
const doc={readyState:"loading",addEventListener:()=>{},
  querySelector:selector=>selector==='meta[name="description"]'?description:null};
vm.runInNewContext(bridge,{window:win,location:loc,document:doc,
  URL,Request,Response,Date,Intl,console,Math,Promise}, {timeout:1500});
assert.equal(win.__ARCXI_DEMO_SNAPSHOT__,true);
assert(doc.title?.includes("Not Live"),"Static preview title must not promise live scores");
assert(attributes.content?.includes("not live"),"Preview description must label saved fixtures");
const dash=await win.fetch("https://football-v2.acchtt.workers.dev/api/dashboard-data");
assert.equal((await dash.json()).ok,true);
const event=await win.fetch("https://football-v2.acchtt.workers.dev/api/bsd/events?date_from=2026-10-08&date_to=2026-10-09&limit=200&offset=0");
const a=await event.json();
assert.equal(a.data.results.length,2,"UTC-day bridge must merge both real-day snapshots");
assert.equal(a.data.results[0].id,1);
assert.equal(a.data.results[1].id,2);
const page=await win.fetch("https://football-v2.acchtt.workers.dev/api/bsd/events?date_from=2026-10-08&date_to=2026-10-09&offset=1&limit=1");
assert.equal((await page.json()).data.results[0].id,2);
const post=await win.fetch("https://football-v2.acchtt.workers.dev/api/manual-score",{method:"POST"});
assert.equal(post.status,405);
assert.equal(called.some(x=>x.includes("/api/manual-score")),false);
const manifest="https://raw.githubusercontent.com/acchtt/football-v2/refs/heads/demo/liquid-glass/pages/demo-preview-data/manifest.json";
const publicFile=await fetch(manifest,{headers:{Origin:"https://rawcdn.githack.com"},signal:AbortSignal.timeout(12000)});
assert.equal(publicFile.status,200,"Snapshot file must be publicly retrievable");
const cors=publicFile.headers.get("access-control-allow-origin")||"";
assert(["*","https://rawcdn.githack.com"].includes(cors),
  "Snapshot host must permit credential-free cross-origin GET; received "+cors);
const m=await publicFile.json();
assert.equal(m.mode,"read-only-snapshot");
assert(m.scheduleRows>0);
console.log("PASS: adapter routing, merged ICT source days, pagination, POST blocking, raw GitHub CORS; "+m.scheduleRows+" public schedule rows.");
