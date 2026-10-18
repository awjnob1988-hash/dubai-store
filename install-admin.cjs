'use strict';
const fs=require('node:fs'),path=require('node:path');
const base=path.join(__dirname,'dubai-site-handoff'),dir=path.join(base,'dist');
function get(p){return fs.readFileSync(path.join(dir,p),'utf8')}
function put(p,s){let target=path.join(dir,p);fs.mkdirSync(path.dirname(target),{recursive:true});fs.writeFileSync(target,s)}
const old='<script src="/catalog.js"></script><script src="/shop.js"></script>';
let altered=0;
function patchPages(dirName){for(const entry of fs.readdirSync(dirName,{withFileTypes:true})){const f=path.join(dirName,entry.name);if(entry.isDirectory()){if(entry.name==='admin'||entry.name==='category-template'||entry.name==='product-template')continue;patchPages(f)}else if(entry.name==='index.html'){let s=fs.readFileSync(f,'utf8');if(s.includes(old)){fs.writeFileSync(f,s.replace(old,'<script src="/live.js"></script>'));altered++}}}}
patchPages(dir);
let shop=get('shop.js');
shop=shop.replace('const {categories,products}=CATALOG;','const {categories}=CATALOG;const products=CATALOG.products.filter(p=>p.active!==false);const pic=n=>String(n).startsWith("uploads/")?"/api/data?action=image&file="+encodeURIComponent(n):"/assets/"+n;');
shop=shop.replace('const page=document.body.dataset.page;','const rawPage=document.body.dataset.page;const page=rawPage==="template-product"?"product:"+location.pathname.split("/")[2]:rawPage==="template-category"?location.pathname.split("/")[1]:rawPage;');
shop=shop.replace("const wa='https://wa.me/9647722282272?text=';","const wa='https://wa.me/'+(CATALOG.site?.whatsapp||'9647722282272')+'?text=';");
shop=shop.replaceAll('/assets/$'+'{p.image}','$'+'{pic(p.image)}');
put('shop.js',shop);
let product=get('products/iphone15/index.html').replace('data-page="product:iphone15"','data-page="template-product"').replace(old,'<script src="/live.js"></script>');
let cat=get('phones/index.html').replace('data-page="phones"','data-page="template-category"').replace(old,'<script src="/live.js"></script>');
put('product-template/index.html',product);put('category-template/index.html',cat);
fs.copyFileSync(path.join(base,'catalog.json'),path.join(dir,'catalog.json'));
console.log('[dubai-admin] updated '+altered+' existing shop pages; generated fallback pages');
