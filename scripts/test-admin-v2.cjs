'use strict';
/**
 * Run from the repository root:
 *   node scripts/test-admin-v2.cjs
 * No network access, no credentials and no production catalog changes required.
 */
const fs=require('node:fs');
const path=require('node:path');
const assert=require('node:assert/strict');
const root=path.resolve(__dirname,'..','dubai-site-handoff');
const read=p=>fs.readFileSync(path.join(root,p),'utf8');
const admin=read('dist/admin-v2/index.html');
const legacy=read('dist/admin/index.html');
const css=read('dist/admin-v2/v2.css');
const shop=read('dist/shop.js');
const live=read('dist/live.js');
const backend=read('netlify/functions/api-modern.mjs');
const sample=JSON.parse(read('catalog.json'));
let assertions=0;
const check=(name,fn)=>{fn();assertions++;console.log('✓ '+name)};
const js=admin.match(/<script>([\s\S]*?)<\/script>/)?.[1];
check('V2 exists separately from original administration',()=>{
 assert(js);
 assert(admin.includes('admin-v2/v2.css'));
 assert(!legacy.includes('admin-v2/v2.css'));
 assert(legacy.includes('dubai-admin-token'));
 assert(admin.includes('dubai-admin-v2-token'));
});
check('V2 HTML and shop JavaScript have valid syntax',()=>{new Function(js);new Function(shop)});
check('V2 is responsive and retains the store brand',()=>{
 assert(css.includes('@media(max-width:560px)'));
 assert(css.includes('--v2-orange'));
 assert(css.includes('aside{background:linear-gradient'));
 assert(admin.includes('src="/assets/logo.png"'));
});
const nodes=new Map();
function el(selector){
 if(!nodes.has(selector))nodes.set(selector,{
  selector,style:{},dataset:{},value:'',innerHTML:'',textContent:'',
  classList:{add(){},remove(){},toggle(){},contains(){return false}},
  addEventListener(){},focus(){},querySelector(){return el('child')},
  get elements(){return {}},get files(){return []},
 });
 return nodes.get(selector);
}
const document={querySelector:el,querySelectorAll(){return []}};
const wrapper=js.replace(/^\(function\(\)\{/,'return (function(){').replace(/\}\)\(\);\s*$/,'return {setCatalog(value){catalog=value},setView(value){view=value},render,open,conditionOf};})();');
const runtime=new Function('document','sessionStorage','fetch',wrapper)(
 document,
 {getItem(){return null},setItem(){},removeItem(){}},
 ()=>{throw Error('Unexpected network call')}
);
runtime.setCatalog(sample);
check('dashboard and all five V2 pages render correctly',()=>{
 const tests=[
  ['overview','آخر المنتجات'],['products','condition-filter'],
  ['categories','قسم رئيسي'],['settings','settings-form'],['media','hero-image'],
 ];
 for(const [view,text] of tests){
  runtime.setView(view);runtime.render();
  assert(el('#content').innerHTML.includes(text),'Missing '+view);
  assert(el('#content').innerHTML.length>500,view+' is unexpectedly blank');
 }
});
check('editor provides condition, cleanliness and image previews',()=>{
 runtime.open('product');
 const html=el('#fields').innerHTML;
 assert(html.includes('product-condition'));
 assert(html.includes('cleanliness-input'));
 assert(html.includes('editor-image-preview'));
 assert(html.includes('سعر المستعمل'));
 assert(html.includes('سعر الجديد'));
 runtime.open('category');
 assert(el('#fields').innerHTML.includes('اسم القسم'));
});
check('store hero image points to editable site setting',()=>{
 assert(live.includes('settings.heroImage'));
 assert(live.includes("querySelector('.hero-real')"));
});
const prefix=shop.slice(0,shop.indexOf('const menus='));
const offers=new Function('CATALOG','document',prefix+';return {availableConditions,cleanlinessText,card};')(
 {products:[],categories:[]},{body:{dataset:{page:'test'}}}
);
const baseProduct={
 id:'ptestitem',name:'Test Device',brand:'Test',category:sample.categories[0].id,
 sub:'Phone',image:'iphone15.png',description:'Demo device',variant:'256 GB',specs:[]
};
const make=(condition,cleanliness)=>({
 ...baseProduct,condition,cleanliness,
 prices:condition==='used'?{new:[0,0],used:[100000,100000]}:{new:[150000,150000],used:[0,0]}
});
check('new listings never auto-create used cards',()=>{
 assert.deepEqual(offers.availableConditions(make('new')),['new']);
 assert.deepEqual(offers.availableConditions(make('used',94)),['used']);
 assert(offers.card(make('used',94),'used').includes('94%'));
 assert(!offers.card(make('new'),'new').includes('نظافة الجهاز'));
 assert.deepEqual(offers.availableConditions({prices:{new:[1,2],used:[0,0]}}),['new']);
 assert.deepEqual(offers.availableConditions({prices:{new:[1,2],used:[1,2]}}),['new','used']);
});
const validateSrc=backend.slice(backend.indexOf('const clean='),backend.indexOf('async function handleLegacy('));
const validate=new Function(validateSrc+';return validate')();
const duplicate=()=>JSON.parse(JSON.stringify(sample));
check('backend accepts existing products and valid new/used products',()=>{
 validate(sample);
 for(const product of [make('new'),make('used',95)]){
  const next=duplicate();
  if(product.condition==='new')delete product.cleanliness;
  next.products.push(product);
  validate(next);
 }
});
check('backend rejects missing or invalid used cleanliness',()=>{
 for(const cleanliness of [undefined,0,101,78.3]){
  const next=duplicate();
  const p=make('used',cleanliness);
  if(cleanliness===undefined)delete p.cleanliness;
  next.products.push(p);
  assert.throws(()=>validate(next));
 }
});
check('backend rejects duplicate product ids',()=>{
 const next=duplicate();
 next.products.push({...next.products[0]});
 assert.throws(()=>validate(next));
});
console.log('\n'+assertions+' V2 test groups passed (offline; no live write operations).');