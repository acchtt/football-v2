'use strict';
const fs=require('node:fs'),path=require('node:path');
const puppeteer=require('/tmp/hero-browser/node_modules/puppeteer-core');
const base=path.resolve('pages/media/fonts');
const faces=[['Archivo Black','ArchivoBlack-Regular.ttf','normal',null],['Anybody Black Italic','Anybody-Italic.ttf','italic',105],['Anybody Black Wide','Anybody-Italic.ttf','italic',125],['Lilita One','LilitaOne-Regular.ttf','normal',null],['Titan One','TitanOne-Regular.ttf','normal',null]];
(async()=>{
const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage']});
try{
 const declarations=faces.map(f=>'@font-face{font-family:"'+f[0]+'";src:url(data:font/truetype;base64,'+fs.readFileSync(path.join(base,f[1])).toString('base64')+') format("truetype");font-weight:900;font-style:'+f[2]+';}').join('');
 const rows=faces.map(f=>{
  const font='font-family:"'+f[0]+'";font-style:'+f[2]+';font-weight:900;'+(f[3]?'font-stretch:'+f[3]+'%;':'')+(f[2]==='normal'?'transform:skewX(-6deg);':'');
  return '<article class="card"><label>'+f[0]+'</label><div class="bar" style="'+font+'">SHOW YOUR MATCHDAY</div><div class="bubble"><div class="txt" style="'+font+'">Your Football<br><em>HERO BOARD!</em></div></div></article>';
 }).join('');
 const img=fs.readFileSync('hero-office-captures/reference-desktop.png').toString('base64');
 const css='*{box-sizing:border-box}body{margin:0;padding:28px;background:#eee;font-family:Arial}h1{font-size:22px;margin:0 0 18px}.board{display:grid;grid-template-columns:repeat(3,1fr);gap:20px}.card{min-height:335px;background:#fff344;border:4px solid #161616;padding:15px;box-shadow:7px 8px #111;overflow:hidden}.card label{display:block;font-weight:900;font-size:14px;background:#111;color:#fff;padding:6px 11px;max-width:max-content;margin-bottom:15px}.bar{background:#0e0e0e;color:#fff339;font-size:24px;white-space:nowrap;letter-spacing:-.7px;padding:11px 8px;line-height:1.3}.bubble{position:relative;background:#fffaf4;border:5px solid #111;box-shadow:5px 6px #111;padding:22px 9px;min-height:170px;display:flex;align-items:center;justify-content:center;margin-top:16px;transform:rotate(-2deg)}.txt{color:#ef00a6;line-height:1.2;font-size:36px;letter-spacing:-1px;text-align:center;text-shadow:3px 5px 0 #111;-webkit-text-stroke:1px #111;paint-order:stroke fill}.txt em{font-style:inherit}.ref{height:335px;background:#fff;position:relative}.ref img{position:absolute;max-width:none;width:1440px;height:900px;left:-40px;top:-135px}';
 const page=await browser.newPage();
 await page.setViewport({width:1600,height:1030,deviceScaleFactor:1});
 await page.setContent('<html><head><style>'+declarations+css+'</style></head><body><h1>Actual reference and licensed display-font alternatives</h1><div class="board"><article class="card ref"><label>Original Noka source</label><img src="data:image/png;base64,'+img+'"></article>'+rows+'</div></body></html>',{waitUntil:'load'});
 const loaded=await page.evaluate(async (names)=>{for(const f of names){await document.fonts.load('900 36px "'+f+'"')}await document.fonts.ready;return names.map(name=>({name,ok:document.fonts.check('900 36px "'+name+'"')}));},faces.map(f=>f[0]));
 console.log('SPECIMEN_FONT_LOADS',JSON.stringify(loaded));
 if(loaded.some(x=>!x.ok))throw Error('Font specimens failed to load');
 await page.screenshot({path:'hero-office-captures/font-specimens.png',fullPage:true});
 console.log('FONT_SPECIMENS_READY',faces.map(f=>f[0]));
 await page.close();
}finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1});