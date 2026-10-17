'use strict';
const fs=require('node:fs'),path=require('node:path');
const targets=[["yujin.png","character/yujin.png","image/png"],["gaeul.png","character/gaeul.png","image/png"],["rei.png","character/rei.png","image/png"],["wonyoung.png","character/wonyoung.png","image/png"],["liz.png","character/liz.png","image/png"],["leeseo.png","character/leeseo.png","image/png"],["hero-symbol-pattern.svg","patterns/hero-symbol-pattern.svg","image/svg+xml"],["comic-impact-sticker.webp","comics/comic-impact-sticker.webp","image/webp"],["ive-logo.svg","logo.svg","image/svg+xml"],["girl-hero-union.svg","girl-hero-union.svg","image/svg+xml"]];
const dir=path.resolve('pages/media/ive/hero-union');
async function main(){
 fs.mkdirSync(dir,{recursive:true});
 const records=await Promise.all(targets.map(async([name,remote,mime])=>{
  const url='https://ive-herooffice.com/assets/'+remote;
  const response=await fetch(url,{signal:AbortSignal.timeout(25000),headers:{Accept:mime}});
  if(!response.ok)throw Error('HERO OFFICE asset unavailable '+name+': '+response.status);
  const bytes=Buffer.from(await response.arrayBuffer());
  if(bytes.length<100)throw Error('Empty HERO OFFICE asset '+name);
  if(name.endsWith('.png')&&bytes.subarray(0,8).toString('hex')!=='89504e470d0a1a0a')throw Error('Bad PNG '+name);
  if(name.endsWith('.webp')&&bytes.toString('ascii',8,12)!=='WEBP')throw Error('Bad WebP '+name);
  if(name.endsWith('.svg')&&!bytes.toString('utf8',0,500).includes('<svg'))throw Error('Bad SVG '+name);
  fs.writeFileSync(path.join(dir,name),bytes);
  return {name,url,bytes:bytes.length,source:'Official IVE HERO OFFICE'};
 }));
 fs.mkdirSync('hero-office-captures',{recursive:true});
 fs.writeFileSync('hero-office-captures/union-assets.json',JSON.stringify(records,null,2));
 console.log('GIRL_HERO_ASSETS_READY',JSON.stringify(records.map(x=>({name:x.name,bytes:x.bytes}))));
}
main().catch(e=>{console.error(e);process.exitCode=1});
