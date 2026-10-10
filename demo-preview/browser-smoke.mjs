// Smoke-test the actual demo renderer with authentic captured fixture JSON.
// Browser requests are intercepted locally. No production writes or API access.
import assert from "node:assert/strict";
import fs from "node:fs/promises";
import http from "node:http";
import {createRequire} from "node:module";
import {extname,resolve,sep} from "node:path";
const require=createRequire(import.meta.url);
const puppeteer=require("/tmp/arcxi-browser/node_modules/puppeteer-core");
const root=resolve("pages");
const mediaTypes={".html":"text/html",".css":"text/css",".js":"text/javascript",
 ".svg":"image/svg+xml",".json":"application/json",".webp":"image/webp",
 ".png":"image/png",".jpg":"image/jpeg",".avif":"image/avif",".ico":"image/x-icon",
 ".ttf":"font/ttf",".woff2":"font/woff2"};
const server=http.createServer(async(req,res)=>{
 let file;
 try{file=resolve(root,"."+decodeURIComponent(new URL(req.url,"http://localhost").pathname));}
 catch{res.writeHead(400).end();return;}
 if(file!==root&&!file.startsWith(root+sep)){res.writeHead(403).end();return;}
 if(file===root)file=resolve(root,"index.html");
 try{const b=await fs.readFile(file);res.writeHead(200,{"Content-Type":mediaTypes[extname(file)]||"application/octet-stream"});res.end(b);}
 catch{res.writeHead(404).end("Not found");}
});
await new Promise(ok=>server.listen(0,"127.0.0.1",ok));
const address="http://127.0.0.1:"+server.address().port+"/";
const readJSON=async path=>JSON.parse(await fs.readFile(root+"/demo-preview-data/"+path,"utf8"));
const dashboard=await readJSON("dashboard.json");
const live=await readJSON("live.json");
const fixtureFiles=new Map();
async function fixtures(day){
 if(fixtureFiles.has(day))return fixtureFiles.get(day);
 try{const data=await readJSON("events/"+day+".json");fixtureFiles.set(day,data);return data;}
 catch{return {ok:false,error:"Saved fixture coverage missing for "+day};}
}
function jsonReply(data,status=200){return {status,contentType:"application/json; charset=utf-8",
 headers:{"access-control-allow-origin":"*","cache-control":"no-store"},
 body:JSON.stringify(data)};}
const browser=await puppeteer.launch({headless:true,executablePath:process.env.CHROME_BIN||"/usr/bin/google-chrome",
 args:["--no-sandbox","--disable-setuid-sandbox"]});
const summary=[];
try{
 for(const target of [{name:"desktop",width:1440,height:900},{name:"mobile",width:390,height:844},{name:"narrow",width:320,height:740}]){
  const page=await browser.newPage();
  await page.setViewport({width:target.width,height:target.height,deviceScaleFactor:1});
  await page.evaluateOnNewDocument(()=>{
   window.__ARCXI_DEMO_SNAPSHOT__=true;
   window.__ARCXI_DEMO_READ_ONLY__=true;
   window.__ARCXI_SNAPSHOT_CAPTURED_AT="2026-10-09T16:50:07.991Z";
  });
  await page.setRequestInterception(true);
  page.on("request", async request=>{
   const url=new URL(request.url());
   if(url.hostname!=="football-v2.acchtt.workers.dev"){await request.continue();return;}
   const pathname=url.pathname;
   let payload,status=200;
   if(pathname==="/api/dashboard-data")payload=dashboard;
   else if(pathname==="/api/bsd/live")payload=live;
   else if(pathname==="/api/bsd/events"){
     const first=url.searchParams.get("date_from"),last=url.searchParams.get("date_to")||first;
     const days=first===last?[first]:[first,last];
     const retrieved=await Promise.all(days.map(fixtures));
     if(retrieved.some(x=>x.ok===false)){payload={ok:false,error:"Snapshot day unavailable"};status=503;}
     else{
       const merged=new Map();
       retrieved.forEach(d=>(d.data?.results||d.data?.events||[]).forEach(e=>merged.set(String(e.id),e)));
       const all=[...merged.values()],offset=Number(url.searchParams.get("offset")||0),
         limit=Number(url.searchParams.get("limit")||200);
       payload={ok:true,data:{count:all.length,results:all.slice(offset,offset+limit),events:all.slice(offset,offset+limit)}};
     }
   }else if(pathname==="/api/soccerway/board"){
     const offset=Number(url.searchParams.get("day")||0);
     const day=new Date(Date.now()+7*3600000);
     day.setUTCDate(day.getUTCDate()+offset);
     try{payload=await readJSON("soccerway/"+day.toISOString().slice(0,10)+".json");}
     catch{payload={ok:true,fixtures:[],count:0};}
   }else{status=404;payload={ok:false,error:"Not available in snapshot smoke test"};}
   try{await request.respond(jsonReply(payload,status));}catch{}
  });
  await page.goto(address,{waitUntil:"domcontentloaded",timeout:25000});
  await page.waitForSelector(".scheduleDateNav", {timeout:20000});
  await page.waitForSelector('[data-date="2026-10-09"]',{timeout:12000});
  await page.waitForFunction(()=>document.querySelector('.scheduleStage')?.getAttribute('aria-busy')==="false",{timeout:22000});
  const initial = await page.evaluate(()=>({
    date:document.querySelector(".dateBtn.active")?.dataset.date,
    rows:document.querySelectorAll(".scheduleMatchCard").length,
    empty:Boolean(document.querySelector(".emptyState")),
    error:Boolean(document.querySelector(".statusBanner")),
    snapshot:document.querySelector(".scheduleSnapshotNotice")?.innerText||""
  }));
  assert(initial.date&&initial.snapshot.includes("Not live"),
    "Default date must identify the read-only data mode");
  assert(initial.rows>0||initial.empty||initial.error,
    "Default date must not be silently blank");
  assert(initial.snapshot.includes("Older than 6 hours"),
    "An older snapshot must disclose staleness");
  console.log("DEFAULT "+target.name+" "+JSON.stringify(initial));
  // The schedule may replace the entire board while its first data request settles.
  // Dispatch synchronously inside the page so Chrome never holds a detached node.
  await page.evaluate(()=>{
    const date=document.querySelector('[data-date="2026-10-09"]');
    if (!date) throw new Error("Date navigation missing");
    date.click();
  });
  await page.waitForFunction(()=>document.querySelector('.dateBtn.active')?.dataset.date==="2026-10-09",{timeout:16000});
  await page.evaluate(()=>{
    const all=document.querySelector('[data-status-filter="all"]');
    if (!all) throw new Error("Status controls missing");
    all.click();
  });
  await page.waitForFunction(()=>document.querySelectorAll(".scheduleMatchCard").length>0,{timeout:25000});
  const before=await page.evaluate(()=>({
    rows:document.querySelectorAll(".scheduleMatchCard").length,
    groups:document.querySelectorAll(".scheduleCompetitionGroup").length,
    filter:document.querySelector(".statusFilters button.active")?.dataset.statusFilter,
    allCount:document.querySelector('[data-status-filter="all"] b')?.textContent,
    teamSamples:[...document.querySelectorAll(".scheduleTeam span[title]")].slice(0,5).map(n=>n.textContent),
    selectedDate:document.querySelector(".dateBtn.active")?.dataset.date,
    snapshot:Boolean(document.querySelector(".scheduleSnapshotNotice")),
    readOnly:document.querySelectorAll("[data-manual-score]").length===0,
    documentWidth:document.documentElement.scrollWidth,windowWidth:innerWidth
  }));
  console.log("POPULATED "+target.name+" "+JSON.stringify(before));
  assert(before.rows>=1,"Missing real match rows at "+target.name);
  assert.equal(before.selectedDate,"2026-10-09");
  assert(before.snapshot&&before.readOnly);
  assert(before.documentWidth<=before.windowWidth+3,
    "Horizontal overflow on "+target.name+": "+before.documentWidth+" > "+before.windowWidth);
  const dateGeometry=await page.evaluate(()=>{
    const nav=document.querySelector(".scheduleDateNav");
    const strip=nav?.querySelector(".dateStrip");
    const nodes=[nav?.firstElementChild,...(strip?[...strip.children]:[]),nav?.lastElementChild];
    return nodes.map(n=>{
      const r=n?.getBoundingClientRect();
      return {left:r?.left||0,right:r?.right||0,width:r?.width||0};
    });
  });
  assert.equal(dateGeometry.length,7,"Expected previous arrow, five dates and next arrow");
  const widths=dateGeometry.map(r=>r.width);
  const gaps=dateGeometry.slice(1).map((r,i)=>r.left-dateGeometry[i].right);
  assert(Math.max(...widths)-Math.min(...widths)<1.1,
    "Uneven date control widths: "+JSON.stringify(dateGeometry));
  assert(Math.max(...gaps)-Math.min(...gaps)<1.1,
    "Uneven visible spacing between date controls: "+JSON.stringify(gaps));
  assert(Math.min(...gaps)>=2,"Date controls are overlapping: "+JSON.stringify(gaps));
  console.log("DATE GRID "+target.name+" "+JSON.stringify({
    width:widths[0].toFixed(2),gaps:gaps.map(v=>v.toFixed(2))
  }));
  const material=await page.evaluate(()=>{
    const computed=selector=>getComputedStyle(document.querySelector(selector));
    const date=computed(".dateBtn.active");
    const filter=computed(".statusFilters button.active");
    const search=computed(".scheduleSearch");
    const panel=computed(".scheduleCompetitionGroup");
    const sheet=computed(".scheduleCompetitionList");
    const row=computed(".scheduleMatchCard");
    const rim=getComputedStyle(document.querySelector(".dateBtn.active"),"::after");
    const rowRim=getComputedStyle(document.querySelector(".scheduleCompetitionGroup"),"::after");
    return {
      dateBlur:date.backdropFilter||date.webkitBackdropFilter,
      filterBlur:filter.backdropFilter||filter.webkitBackdropFilter,
      searchBlur:search.backdropFilter||search.webkitBackdropFilter,
      contentBlur:panel.backdropFilter||panel.webkitBackdropFilter,
      contentBackground:panel.backgroundColor,
      sheetBlur:sheet.backdropFilter||sheet.webkitBackdropFilter,
      sheetBackground:sheet.backgroundColor,
      rowBlur:row.backdropFilter||row.webkitBackdropFilter,
      rowRim:rowRim.content,
      rimContent:rim.content,
      dateBorderRadius:date.borderRadius
    };
  });
  assert(material.dateBlur.includes("blur(")&&material.filterBlur.includes("blur(")&&
    material.searchBlur.includes("blur("),"Liquid Glass missing from control plane: "+JSON.stringify(material));
  assert(material.contentBlur.includes("blur("),"Competition panels must be Liquid Glass at REST");
  assert(material.sheetBlur==="none","Do not reintroduce a giant whole-board lens");
  assert(material.rowBlur==="none","Fixture text must rest on a readable, unblurred inner veil");
  assert(material.rowRim!=="none","Always-on competition optical rim is missing");
  assert(parseFloat(material.contentBackground.match(/rgba?\([^)]*,\s*([\d.]+)\)/)?.[1] || "0")<.6,
    "Glass competition center must remain transparent");
  assert(material.rimContent!=="none","Control edge-optics layer missing");
  assert.equal(material.dateBorderRadius,target.name==="desktop" ? "15px" : "12px",
    "Selected date should be a clear-glass tile, not an oversized capsule");
  console.log("MATERIAL "+target.name+" "+JSON.stringify(material));
  const glowTarget=await page.$(".statusFilters button.active");
  const bounds=await glowTarget.boundingBox();
  await page.mouse.move(bounds.x+bounds.width*.35,bounds.y+bounds.height*.5);
  await new Promise(ok=>setTimeout(ok,100));
  const optical=await page.evaluate(()=>document.querySelector(".statusFilters button.active")?.style.getPropertyValue("--lg-x"));
  assert(optical.endsWith("%"),"Pointer-following specular light did not respond");
  // At rest the glass perimeter is already visible. Hover only redirects light.
  const fixture=await page.$(".scheduleMatchCard .scheduleFixture");
  assert(fixture,"A focusable match fixture must exist");
  const firstGroup=await page.$(".scheduleCompetitionGroup");
  const groupBox=await firstGroup.boundingBox();
  await page.mouse.move(groupBox.x+groupBox.width*.63,groupBox.y+Math.min(groupBox.height*.67,68));
  await new Promise(ok=>setTimeout(ok,240));
  const hover=await page.evaluate(()=>{
    const group=document.querySelector(".scheduleCompetitionGroup");
    const style=getComputedStyle(group);
    return {
      hovering:group.matches(":hover"),glass:style.backdropFilter||style.webkitBackdropFilter,
      pointer:group.style.getPropertyValue("--lg-x"),
      rim:getComputedStyle(group,"::after").opacity
    };
  });
  assert(hover.hovering&&hover.glass.includes("blur("),"Hovered panel is not glass");
  assert(hover.pointer.endsWith("%"),"Competition optical rim does not track pointer");
  assert(Number(hover.rim)>.9,"Hovered rim lacks responsive highlight");
  console.log("FOCUSED "+target.name+" "+JSON.stringify(hover));
  await fs.mkdir("demo-preview/screenshots",{recursive:true});
  await page.screenshot({path:"demo-preview/screenshots/"+target.name+"-focused.png",fullPage:true});
  await page.mouse.move(0,0);
  await new Promise(ok=>setTimeout(ok,220));
  const resting=await page.evaluate(()=>{
    const group=document.querySelector(".scheduleCompetitionGroup");
    return {hover:group.matches(":hover"),glass:getComputedStyle(group).backdropFilter,
      rim:getComputedStyle(group,"::after").opacity};
  });
  assert(!resting.hover&&resting.glass.includes("blur("),
    "Persistent Liquid Glass should still exist when hover leaves");
  assert(Number(resting.rim)>.7,"Resting panel optical rim disappeared");
  const keyboardFocus=await page.evaluate(()=>{
    const fixture=document.querySelector(".scheduleMatchCard .scheduleFixture");
    fixture.focus({preventScroll:true});
    const group=fixture.closest(".scheduleCompetitionGroup");
    return {focus:document.activeElement===fixture,
      focusWithin:group.matches(":focus-within"),
      glass:getComputedStyle(group).backdropFilter};
  });
  assert(keyboardFocus.focus&&keyboardFocus.focusWithin,"Keyboard could not focus fixture");
  assert(keyboardFocus.glass.includes("blur("),"Keyboard-focus panel glass missing");
  console.log("KEYBOARD "+target.name+" "+JSON.stringify(keyboardFocus));
  await page.evaluate(()=>document.activeElement?.blur());
  await page.type("#boardSearch","Al Wakrah",{delay:10});
  await new Promise(ok=>setTimeout(ok,350));
  const after=await page.evaluate(()=>({
    value:document.querySelector("#boardSearch")?.value,
    focus:document.activeElement?.id,
    visibleRows:document.querySelectorAll(".scheduleMatchCard").length
  }));
  assert.equal(after.value,"Al Wakrah","Search text was lost");
  assert.equal(after.focus,"boardSearch","Search focus was lost");
  assert(after.visibleRows>=1&&after.visibleRows<before.rows,"Search should narrow fixtures");
  await page.evaluate(() => {
    const input=document.querySelector("#boardSearch");
    input.value="";
    input.dispatchEvent(new Event("input",{bubbles:true}));
  });
  await new Promise(ok=>setTimeout(ok,350));
  // Record the settled, idle material rather than an accidental focused input ring.
  await page.evaluate(()=>document.activeElement?.blur());
  await new Promise(ok=>setTimeout(ok,300));
  await fs.mkdir("demo-preview/screenshots",{recursive:true});
  await page.screenshot({path:"demo-preview/screenshots/"+target.name+".png",fullPage:true});
  // Emulate a longer, densely populated schedule for compositing diagnostics.
  // This is a headless rendering indication, not a real-device benchmark.
  const scrollPerf=await page.evaluate(async()=>{
    const host=document.querySelector(".scheduleCompetitionList");
    if(!host)return {groups:0,reason:"no competition list"};
    const source=[...host.children];
    while(host.children.length<30)host.appendChild(source[host.children.length%source.length].cloneNode(true));
    await new Promise(ok=>requestAnimationFrame(ok));
    const samples=[];
    const scrollMax=Math.max(0,document.documentElement.scrollHeight-innerHeight);
    window.scrollTo(0,0);
    for(let frame=0;frame<75;frame++){
      window.scrollTo(0,scrollMax*(frame/74));
      const now=await new Promise(ok=>requestAnimationFrame(ok));
      samples.push(now);
    }
    const frameIntervals=samples.slice(1).map((t,i)=>t-samples[i]).sort((a,b)=>a-b);
    return {groups:host.children.length,scrollHeight:document.documentElement.scrollHeight,
      medianFrameMs:Math.round(frameIntervals[Math.floor(frameIntervals.length/2)]*10)/10,
      p95FrameMs:Math.round(frameIntervals[Math.floor(frameIntervals.length*.95)]*10)/10,
      contentVisibility:getComputedStyle(host.firstElementChild).contentVisibility};
  });
  assert(scrollPerf.groups>=30,"Long fixture list could not be rendered for stress test");
  console.log("LONG_BOARD "+target.name+" "+JSON.stringify(scrollPerf));
  // Accessibility: run standardized checks on the actual populated UI.
  if(target.name!=="narrow"){
    const axeText=await fs.readFile("/tmp/arcxi-browser/node_modules/axe-core/axe.min.js","utf8");
    // Restore authentic fixture DOM after synthetic stress, then run axe.
    await page.evaluate(()=>document.querySelector('[data-status-filter="all"]')?.click());
    await new Promise(ok=>setTimeout(ok,150));
    await page.evaluate(axeText);
    const accessibility=await page.evaluate(async()=>{
      const result=await axe.run(document,{runOnly:{type:"tag",values:[
        "wcag2a","wcag2aa","wcag21a","wcag21aa"]}});
      return result.violations.map(v=>({id:v.id,impact:v.impact,
        nodes:v.nodes.length,examples:v.nodes.slice(0,2).map(n=>n.target)}));
    });
    await fs.writeFile("demo-preview/screenshots/"+target.name+"-a11y.json",
      JSON.stringify({viewport:target.name,violations:accessibility},null,2));
    console.log("AXE "+target.name+" "+JSON.stringify(accessibility));
  }
  if(target.name==="desktop"){
    // Both legitimate empty coverage and missing saved coverage must be distinct.
    const nextDay=(day,shift=1)=>{
      const d=new Date(day+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+shift);
      return d.toISOString().slice(0,10);
    };
    let day="2026-10-09";
    for(let i=0;i<8;i++){
      const next=nextDay(day);
      await page.evaluate(()=>document.querySelector('[data-date-shift="1"]')?.click());
      await page.waitForFunction(date=>document.querySelector(".dateBtn.active")?.dataset.date===date,
        {timeout:15000},next);
      await page.waitForFunction(()=>document.querySelector(".scheduleStage")?.getAttribute("aria-busy")==="false",
        {timeout:15000});
      day=next;
      if(day==="2026-10-11"){
        const state=await page.evaluate(()=>({
          empty:document.querySelector(".emptyState")?.innerText||"",
          error:document.querySelector(".statusBanner")?.innerText||""
        }));
        assert(state.empty.includes("No scheduled Board matches")&&!state.error,
          "Covered empty date should not look like an API failure: "+JSON.stringify(state));
        console.log("CONFIRMED_EMPTY "+JSON.stringify(state));
      }
    }
    await page.waitForFunction(()=>Boolean(document.querySelector(".statusBanner")),
      {timeout:15000});
    const absent=await page.evaluate(()=>({
      error:document.querySelector(".statusBanner")?.innerText||"",
      empty:document.querySelector(".emptyState")?.innerText||""
    }));
    assert(absent.error.includes("Snapshot data unavailable") &&
      absent.empty.includes("Saved fixture coverage unavailable") &&
      !absent.empty.includes("No scheduled Board matches"),
      "Missing fixture day must not be reported as confirmed empty: "+JSON.stringify(absent));
    console.log("MISSING_COVERAGE "+JSON.stringify(absent));
  }
  summary.push({viewport:target.name,...before,search:after.value,scrollPerf});
  await page.close();
 }
 console.log("PASS real-data Chrome smoke:",JSON.stringify(summary));
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
