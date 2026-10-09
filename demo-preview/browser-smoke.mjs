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
 for(const target of [{name:"desktop",width:1440,height:900},{name:"mobile",width:390,height:844}]){
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
    const rowRim=getComputedStyle(document.querySelector(".scheduleMatchCard"),"::before");
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
  assert(material.contentBlur==="none","Resting competition groups must not blur the background");
  assert(material.sheetBlur==="none","Giant schedule glass sheet must be removed");
  assert(material.rowBlur==="none","Resting fixture rows must stay quiet and blur-free");
  assert(material.rowRim!=="none","Transient fixture glass optics are missing");
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
  // A fixture temporarily rises into optical glass only while hovered or focused.
  const firstFixture=await page.$(".scheduleMatchCard .scheduleFixture");
  assert(firstFixture,"A focusable match row must exist");
  const rowBox=await firstFixture.boundingBox();
  await page.mouse.move(rowBox.x+rowBox.width*.63,rowBox.y+rowBox.height*.5);
  await new Promise(ok=>setTimeout(ok,260));
  const interaction=await page.evaluate(()=>{
    const row=document.querySelector(".scheduleMatchCard");
    const computed=getComputedStyle(row);
    return {
      glass:computed.backdropFilter||computed.webkitBackdropFilter,
      pointer:row.style.getPropertyValue("--lg-x"),
      active:row.matches(":hover")||row.matches(":focus-within"),
      rimOpacity:getComputedStyle(row,"::before").opacity
    };
  });
  assert(interaction.active,"Hover did not select fixture");
  assert(interaction.glass.includes("blur("),"Focused match must acquire real glass material");
  assert(interaction.pointer.endsWith("%"),"Fixture-edge highlight did not track pointer");
  assert(Number(interaction.rimOpacity)>.5,"Interactive fixture optical edge is invisible");
  console.log("FOCUSED "+target.name+" "+JSON.stringify(interaction));
  await fs.mkdir("demo-preview/screenshots",{recursive:true});
  await page.screenshot({path:"demo-preview/screenshots/"+target.name+"-focused.png",fullPage:true});
  await page.mouse.move(0,0);
  await new Promise(ok=>setTimeout(ok,280));
  const idle=await page.evaluate(()=>{
    const row=document.querySelector(".scheduleMatchCard");
    const computed=getComputedStyle(row);
    return {hover:row.matches(":hover"),glass:computed.backdropFilter||computed.webkitBackdropFilter};
  });
  assert(!idle.hover&&idle.glass==="none","Fixture failed to return to quiet reading surface");
  // Keyboard focus should activate the identical optical treatment.
  const keyboardFocus=await page.evaluate(()=>{
    const fixture=document.querySelector(".scheduleMatchCard .scheduleFixture");
    fixture.focus({preventScroll:true});
    const row=fixture.closest(".scheduleMatchCard");
    const style=getComputedStyle(row);
    return {
      focus:document.activeElement===fixture,
      focusWithin:row.matches(":focus-within"),
      glass:style.backdropFilter||style.webkitBackdropFilter
    };
  });
  assert(keyboardFocus.focus&&keyboardFocus.focusWithin,"Keyboard focus did not reach a fixture");
  assert(keyboardFocus.glass.includes("blur("),"Keyboard-focused fixture lacks Liquid Glass");
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
  summary.push({viewport:target.name,...before,search:after.value});
  await page.close();
 }
 console.log("PASS real-data Chrome smoke:",JSON.stringify(summary));
}finally{await browser.close();await new Promise(ok=>server.close(ok));}
