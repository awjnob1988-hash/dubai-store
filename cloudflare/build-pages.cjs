'use strict';
// Build Dubai Store for Cloudflare Pages without modifying Netlify deployment settings.
const fs=require('node:fs'),path=require('node:path');
const root=path.resolve(__dirname,'..');
const output=path.join(root,'dubai-site-handoff','dist');
const source=path.join(__dirname,'worker.js');
if(!fs.existsSync(path.join(output,'index.html')))throw Error('Storefront output missing: run node install-admin.cjs first');
for(const part of ['admin/index.html','admin-v2/index.html','catalog.json','live.js','shop.js']){
 if(!fs.existsSync(path.join(output,part)))throw Error('Missing required store output: '+part);
}
const script=fs.readFileSync(source,'utf8');
if(!script.includes('export default {fetch:page}')||!script.includes('const SOURCE'))throw Error('Cloudflare API is incomplete');
fs.writeFileSync(path.join(output,'_worker.js'),script,'utf8');
console.log('Cloudflare Pages output ready in dubai-site-handoff/dist (including original and V2 admin).');

// A single build-time injection keeps all public pages (including newly created
// category/product templates) consistent without altering /admin or /admin-v2.
const bootstrap='<script>try{if(localStorage.getItem("dubai-store-theme")==="dark")document.documentElement.setAttribute("data-theme","dark")}catch(e){}</script><link rel="stylesheet" href="/theme.css">';
const themeButton='<button id="theme-toggle" type="button" class="theme-toggle" aria-pressed="false" aria-label="تفعيل الوضع الليلي" title="تفعيل الوضع الليلي"><span class="theme-icon" aria-hidden="true">☾</span><span class="theme-word" aria-hidden="true">ليلي</span></button>';
let themed=0;
function addStorefrontTheme(directory){
 for(const entry of fs.readdirSync(directory,{withFileTypes:true})){
  if(entry.isDirectory()){
   if(entry.name==='admin'||entry.name==='admin-v2')continue;
   addStorefrontTheme(path.join(directory,entry.name));
   continue;
  }
  if(entry.name!=='index.html')continue;
  const file=path.join(directory,entry.name);
  let html=fs.readFileSync(file,'utf8');
  if(!html.includes('class="header-tools"')||!html.includes('id="motion-toggle"'))continue;
  if(!html.includes('href="/theme.css"'))html=html.replace('</head>',bootstrap+'</head>');
  if(!html.includes('id="theme-toggle"'))html=html.replace('<div class="header-tools">','<div class="header-tools">'+themeButton);
  if(!html.includes('src="/theme.js"'))html=html.replace('</body>','<script src="/theme.js"></script></body>');
  fs.writeFileSync(file,html,'utf8');
  themed++;
 }
}
if(!fs.existsSync(path.join(output,'theme.css'))||!fs.existsSync(path.join(output,'theme.js')))throw Error('Theme assets missing');
addStorefrontTheme(output);
console.log('Applied saved day/night appearance to '+themed+' public storefront pages.');
