// Read-only visual reference acquisition and demo screenshot verification.
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const puppeteer = require('/tmp/hero-browser/node_modules/puppeteer-core');
const out = path.resolve('hero-office-captures');
fs.mkdirSync(out,{recursive:true});
const sleep = ms=>new Promise(ok=>setTimeout(ok,ms));
const root=path.resolve('pages');
const mime={'.html':'text/html','.css':'text/css','.js':'text/javascript','.svg':'image/svg+xml','.png':'image/png','.webp':'image/webp','.jpg':'image/jpeg','.jpeg':'image/jpeg','.ico':'image/x-icon','.ttf':'font/ttf','.woff2':'font/woff2','.json':'application/json'};
const server=http.createServer((req,res)=>{
  try {
    const p=decodeURIComponent(req.url.split('?')[0]);
    const dest=path.resolve(root,'.'+(p==='/'?'/index.html':p));
    if(!dest.startsWith(root+path.sep))throw Error('bad path');
    const data=fs.readFileSync(dest);
    res.writeHead(200,{'content-type':mime[path.extname(dest)]||'application/octet-stream','access-control-allow-origin':'*'});
    res.end(data);
  }catch(e){res.writeHead(404);res.end('Not found')}
});
async function main(){
 await new Promise(resolve=>server.listen(8080,'127.0.0.1',resolve));
 const exe=['/usr/bin/google-chrome','/usr/bin/google-chrome-stable','/usr/bin/chromium'].find(fs.existsSync);
 if(!exe)throw Error('Chrome unavailable');
 const browser=await puppeteer.launch({executablePath:exe,headless:true,args:['--no-sandbox','--disable-dev-shm-usage','--disable-gpu','--ignore-certificate-errors']});
 const results=[];
 try {
  for(const target of [{name:'reference',url:'https://ive-herooffice.com/'},{name:'arcxi',url:'http://127.0.0.1:8080/#board'}]){
   for(const size of [{name:'desktop',width:1440,height:900},{name:'mobile',width:390,height:844}]){
    const page=await browser.newPage();
    await page.setViewport({width:size.width,height:size.height,deviceScaleFactor:1});
    const errors=[],failed=[];
    page.on('pageerror',e=>errors.push(e.message));
    page.on('requestfailed',r=>failed.push(r.url()+': '+r.failure()?.errorText));
    let status='', finalUrl='';
    try{
     const response=await page.goto(target.url,{waitUntil:'domcontentloaded',timeout:35000});
     status=response?.status();finalUrl=page.url();
     await sleep(target.name==='reference'?4500:6500);
     await page.screenshot({path:path.join(out,target.name+'-'+size.name+'.png'),fullPage:false});
     const styles=await page.evaluate(()=>{
       const read=e=>{const s=getComputedStyle(e),r=e.getBoundingClientRect();return {tag:e.tagName,cls:typeof e.className==='string'?e.className.slice(0,100):'',text:(e.textContent||'').trim().slice(0,70),x:Math.round(r.x),y:Math.round(r.y),w:Math.round(r.width),h:Math.round(r.height),font:s.fontFamily,fontSize:s.fontSize,fontWeight:s.fontWeight,color:s.color,background:s.backgroundColor,borderRadius:s.borderRadius,letterSpacing:s.letterSpacing}};
       const nodes=[...document.querySelectorAll('header,nav,h1,h2,button,a,main,section')].filter(e=>{const r=e.getBoundingClientRect();return r.width>20&&r.height>10&&r.y>=-50&&r.y<innerHeight}).slice(0,45).map(read);
       return {title:document.title,htmlLength:document.documentElement.outerHTML.length,bodyText:document.body.innerText.slice(0,1600),body:getComputedStyle(document.body).backgroundColor,fonts:document.fonts?document.fonts.size:0,scrollHeight:document.documentElement.scrollHeight,overflowX:document.documentElement.scrollWidth>innerWidth,nodes};
     });
     results.push({target:target.name,size:size.name,http:status,url:finalUrl,styles,errors:errors.slice(0,8),failed:failed.slice(0,10)});
     console.log('CAPTURE',target.name,size.name,status,styles.title,styles.nodes.length);
    }catch(e){
     results.push({target:target.name,size:size.name,http:status,url:finalUrl,error:String(e),errors:errors.slice(0,10),failed:failed.slice(0,10)});
     console.error('CAPTURE_ERROR',target.name,size.name,String(e));
    }finally{await page.close()}
   }
  }
 }finally{await browser.close()}
 fs.writeFileSync(path.join(out,'capture.json'),JSON.stringify(results,null,2));
 console.log('CAPTURE_REPORT',results.map(x=>({target:x.target,size:x.size,status:x.http,error:x.error,title:x.styles?.title,sourceLength:x.styles?.htmlLength})));
}
main().catch(e=>{console.error(e);process.exitCode=1}).finally(()=>server.close());
