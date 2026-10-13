'use strict';
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const root=path.resolve('hero-office-captures'),dest=path.resolve('hero-office-public');
const files=['reference-desktop.png','reference-mobile.png','arcxi-desktop.png','arcxi-mobile.png'];
for(const file of files){
 const f=path.join(root,file);
 assert(fs.existsSync(f) && fs.statSync(f).size>5000,'Missing valid visual evidence '+f);
 assert.equal(fs.readFileSync(f).subarray(0,8).toString('hex'),'89504e470d0a1a0a','Not a PNG: '+f);
}
fs.rmSync(dest,{recursive:true,force:true});
fs.mkdirSync(path.join(dest,'images'),{recursive:true});
for(const file of files)fs.copyFileSync(path.join(root,file),path.join(dest,'images',file));
fs.copyFileSync(path.join(__dirname,'comparison.html'),path.join(dest,'index.html'));
fs.cpSync(path.resolve('pages'),path.join(dest,'app'),{recursive:true});
const entry=path.join(dest,'app/index.html');
let html=fs.readFileSync(entry,'utf8');
const needle='<script src="./config.js?v=17"></script>';
assert(html.includes(needle),'Demo injection boundary missing');
html=html.replace(needle,'<script src="./demo-fixtures.js"></script>\n  '+needle);
html=html.replace('<body>','<body>\n  <div class="arcxiSampleNotice" role="status">DESIGN DEMO · SYNTHETIC MATCHES · NOT LIVE FOOTBALL</div>');
html=html.replace('</head>','<style>.arcxiSampleNotice{position:relative;z-index:100;display:block;background:#111;color:#fff241;text-align:center;font:900 11px/1.3 Arial,sans-serif;letter-spacing:.075em;padding:9px 8px;border-bottom:3px solid #f708b0}.arcxiSampleNotice+div{isolation:auto}</style>\n</head>');
fs.writeFileSync(entry,html);
fs.copyFileSync(path.join(__dirname,'sample-fixtures.js'),path.join(dest,'app/demo-fixtures.js'));
assert(fs.existsSync(path.join(dest,'app/media/ive/wonyoung-liz-bottom-right.webp')),'Approved IVE artwork missing');
assert(html.includes('demo-fixtures.js')&&html.includes('SYNTHETIC MATCHES'),'Demo must be transparently labeled');
console.log('PUBLIC_COMPARISON_READY',JSON.stringify({output:dest,comparison:'/',sampleApp:'/app/',images:files,assetFiles:fs.readdirSync(path.join(dest,'app')).length}));
