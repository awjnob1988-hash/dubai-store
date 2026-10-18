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
