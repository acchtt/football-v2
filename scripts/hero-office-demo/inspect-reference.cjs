'use strict';
const fs=require('node:fs');
const puppeteer=require('/tmp/hero-browser/node_modules/puppeteer-core');
(async()=>{
 const out='hero-office-captures/source-asset-audit.json';
 fs.mkdirSync('hero-office-captures',{recursive:true});
 const chrome=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
 const browser=await puppeteer.launch({executablePath:chrome,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
 try{
  const page=await browser.newPage();
  await page.setViewport({width:1533,height:900,deviceScaleFactor:1});
  const responses=[];
  page.on('response',r=>{
   const t=r.headers()['content-type']||'';
   if(/image|font|javascript|css/.test(t)||/\.(svg|webp|png|jpg|avif|gif)(\?|$)/i.test(r.url()))
    responses.push({url:r.url(),status:r.status(),type:t,bytes:r.headers()['content-length']||null});
  });
  await page.goto('https://ive-herooffice.com/',{waitUntil:'domcontentloaded',timeout:40000});
  await new Promise(r=>setTimeout(r,4000));
  for(let y=0;y<7500;y+=650){
   await page.evaluate(y=>window.scrollTo(0,y),y);
   await new Promise(r=>setTimeout(r,500));
   if(y>await page.evaluate(()=>document.documentElement.scrollHeight))break;
  }
  const data=await page.evaluate(()=>{
   const w=window;
   const imgs=[...document.images].map(i=>({src:i.currentSrc||i.src,alt:i.alt,cls:i.className,loaded:i.complete&&i.naturalWidth>0,w:i.naturalWidth,h:i.naturalHeight,rect:(()=>{let b=i.getBoundingClientRect();return [Math.round(b.x),Math.round(b.y+scrollY),Math.round(b.width),Math.round(b.height)]})()}));
   const style=[...document.querySelectorAll('*')].filter(el=>{let t=el.innerText?.trim()||'';return t.length<110&&(/GIRL HERO UNION|WONDER GREEN|CAPTAIN PURPLE|BAT PINK|HERO POWERS/i).test(t)}).slice(0,30).map(el=>({tag:el.tagName,cl:typeof el.className==='string'?el.className:'',text:el.innerText?.slice(0,80),html:el.outerHTML.slice(0,600)}));
   const bgs=[...document.querySelectorAll('*')].map(el=>({cl:typeof el.className==='string'?el.className:'',bg:getComputedStyle(el).backgroundImage})).filter(x=>x.bg.includes('url(')).slice(0,80);
   return {title:document.title,height:document.documentElement.scrollHeight,imgs,style,bgs,visibleText:document.body.innerText.slice(-2600),scripts:[...document.scripts].map(s=>s.src).filter(Boolean)};
  });
  const forensic=await page.evaluate(()=>{
   const small=(s,n=190)=>String(s||'').slice(0,n);
   const read=(el,ps='')=>{
    let css=getComputedStyle(el,ps||null),b=el.getBoundingClientRect();
    return {tag:el.tagName,cl:typeof el.className==='string'?small(el.className,100):'',text:small(el.innerText||el.textContent,72),pseudo:ps||'none',bounds:{x:Math.round(b.x),y:Math.round(b.y+scrollY),w:Math.round(b.width),h:Math.round(b.height)},
      font:css.fontFamily,fontSize:css.fontSize,fontStyle:css.fontStyle,fontWeight:css.fontWeight,letterSpacing:css.letterSpacing,lineHeight:css.lineHeight,
      backgroundColor:css.backgroundColor,backgroundImage:small(css.backgroundImage,600),backgroundSize:css.backgroundSize,backgroundPosition:css.backgroundPosition,backgroundRepeat:css.backgroundRepeat,
      color:css.color,maskImage:small(css.maskImage,600),maskSize:css.maskSize,maskPosition:css.maskPosition,maskRepeat:css.maskRepeat,
      opacity:css.opacity,transform:css.transform};
   };
   const textTags=[...document.querySelectorAll('h1,h2,h3,p,span,div,section,main')].filter(el=>{
    let t=(el.innerText||'').trim();return t.length>4&&t.length<170&&/SHOW YOUR STREAM|How To Get Your|HERO LICENSE|GIRL HERO UNION|HERO OFFICE SCANNER|CAPTAIN PURPLE/i.test(t)
   }).slice(0,28);
   const layers=[];
   for(const el of [...document.querySelectorAll('html,body,main,section,div')]){
    if(layers.length>=130)break;
    for(const pseudo of ['','::before','::after']){
     const css=getComputedStyle(el,pseudo||null);
     if(css.backgroundImage!=='none'||css.maskImage!=='none'||(pseudo&&css.content!=='none'&&css.content!=='normal'&&(css.backgroundColor!=='rgba(0, 0, 0, 0)')))
      layers.push(read(el,pseudo));
    }
   }
   return {root:[read(document.documentElement),read(document.body)],textElements:textTags.map(el=>read(el)),layers,fonts:[...document.fonts].map(f=>({family:f.family,weight:f.weight,style:f.style,status:f.status}))};
  });
  fs.writeFileSync('hero-office-captures/source-style-forensics.json',JSON.stringify(forensic,null,2));
  console.log('SOURCE_FORENSICS',JSON.stringify({layers:forensic.layers.filter(x=>x.maskImage!=='none'||x.backgroundImage!=='none').slice(0,25),fonts:forensic.fonts,text:forensic.textElements.slice(0,8)}));
  await page.evaluate(()=>window.scrollTo(0,0));
  fs.writeFileSync(out,JSON.stringify({data,responses:responses.slice(0,350)},null,2));
  try{await page.screenshot({path:'hero-office-captures/reference-full-page.png',fullPage:true})}
  catch(e){console.log('OPTIONAL_FULL_CAPTURE_FAILED',String(e).slice(0,200))}
  console.log('SOURCE_AUDIT',JSON.stringify({imgCount:data.imgs.length,requestCount:responses.length,height:data.height,heroNodes:data.style,images:data.imgs.filter(i=>/hero|union|poster|purple|green|pink|yellow|blue|card|character/i.test(i.src)).slice(0,35)}));
 }finally{await browser.close()}
})().catch(e=>{console.error(e);process.exitCode=1});
