// Cloudflare Pages advanced-mode Worker for Dubai Store.
// Bind D1 as DB and Workers KV as MEDIA. Secrets are set in the Cloudflare dashboard.
// This source must be copied to dist/_worker.js by cloudflare/build-pages.cjs.
const SOURCE = 'https://dubai-store-iq.netlify.app';
const uploadPath = /^uploads\/[a-z0-9-]{15,55}\.(png|jpg|jpeg|webp|gif)$/i;
const textOK = value => typeof value === 'string' && value.length <= 1500 && !/[<>"'&\u0000-\u001f]/.test(value);
const identifier = value => typeof value === 'string' && /^[a-z][a-z0-9-]{1,64}$/.test(value);
const encoder = new TextEncoder();
const json = (value, status = 200) => new Response(JSON.stringify(value), {
  status, headers: {'content-type':'application/json; charset=utf-8','cache-control':'no-store','x-content-type-options':'nosniff'}
});
const failure = (message, status = 400) => json({error:message},status);
const b64 = bytes => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
const decode = source => Uint8Array.from(atob(source.replace(/-/g,'+').replace(/_/g,'/')+'='.repeat((4-source.length%4)%4)), ch => ch.charCodeAt(0));
const same = (a,b) => {
  const x = String(a||''),y=String(b||'');
  if(x.length!==y.length)return false;
  let diff=0;for(let i=0;i<x.length;i++)diff|=x.charCodeAt(i)^y.charCodeAt(i);return diff===0;
};
const validConfig = env => String(env.ADMIN_PASSWORD||'').length>=12 && String(env.ADMIN_SESSION_SECRET||'').length>=32;
async function hmac(secret,source) {
  const key=await crypto.subtle.importKey('raw',encoder.encode(secret),{name:'HMAC',hash:'SHA-256'},false,['sign']);
  return b64(await crypto.subtle.sign('HMAC',key,encoder.encode(source)));
}
async function sign(env){
  const payload=b64(encoder.encode(JSON.stringify({exp:Date.now()+6*60*60*1000,nonce:crypto.randomUUID()})));
  return payload+'.'+await hmac(env.ADMIN_SESSION_SECRET,payload);
}
async function authorized(request,env){
  const token=(request.headers.get('authorization')||'').replace(/^Bearer /i,'');
  if(token.length>1800||!token.includes('.'))return false;
  const [body,mac,...extra]=token.split('.');
  if(extra.length||!body||!mac)return false;
  if(!same(mac,await hmac(env.ADMIN_SESSION_SECRET,body)))return false;
  try {return JSON.parse(new TextDecoder().decode(decode(body))).exp>Date.now()}catch{return false}
}
function validate(c){
  if(!c||!Array.isArray(c.categories)||!Array.isArray(c.products)||!c.categories.length||c.categories.length>80||c.products.length>1000)throw Error('قائمة المنتجات أو الأقسام غير صالحة');
  const cat=new Set(),prods=new Set();
  for(const x of c.categories){
    if(!identifier(x.id)||cat.has(x.id)||['admin','admin-v2','api','assets','products','branches','sell','category-template','product-template','cloudflare'].includes(x.id)||!['title','short','sub','image','line'].every(k=>textOK(x[k]||'')))throw Error('قسم غير صالح');
    cat.add(x.id);
  }
  for(const p of c.products){
    if(!identifier(p.id)||prods.has(p.id)||!cat.has(p.category)||!['name','brand','sub','image','variant','description'].every(k=>textOK(p[k]||''))||!p.name||!p.image||!p.prices||!Array.isArray(p.specs)||p.specs.length>30)throw Error('تفاصيل منتج غير صالحة');
    for(const z of ['new','used']){
      const a=p.prices[z];if(!Array.isArray(a)||a.length!==2||a.some(n=>!Number.isSafeInteger(n)||n<0||n>1000000000)||a[1]<a[0])throw Error('السعر غير صالح');
    }
    if(!p.specs.every(x=>Array.isArray(x)&&x.length===2&&x.every(textOK)))throw Error('المواصفات غير صالحة');
    if(!/^([a-zA-Z0-9_-]+\.(png|jpg|jpeg|webp|gif)|uploads\/[a-z0-9-]{15,55}\.(png|jpg|jpeg|webp|gif))$/i.test(p.image))throw Error('صورة غير صالحة');
    if(p.condition!==undefined&&!['new','used','both'].includes(p.condition))throw Error('حالة المنتج غير صالحة');
    if(p.condition==='new'||p.condition==='used'){
      const [min,max]=p.prices[p.condition];if(min<1||max<min)throw Error('سعر الجهاز غير صالح');
      if(p.condition==='used'&&(!Number.isInteger(p.cleanliness)||p.cleanliness<1||p.cleanliness>100))throw Error('نسبة نظافة المستعمل يجب أن تكون من 1 إلى 100');
      if(p.condition==='new'&&p.cleanliness!==undefined)throw Error('نسبة النظافة للمستعمل فقط');
    }
    prods.add(p.id);
  }
  if(c.site!==undefined){
    if(!c.site||typeof c.site!=='object'||!Object.values(c.site).every(textOK))throw Error('إعدادات المتجر غير صالحة');
    if(c.site.whatsapp&&!/^\d{10,15}$/.test(c.site.whatsapp))throw Error('رقم واتساب غير صالح');
  }
  if(JSON.stringify(c).length>800000)throw Error('بيانات المنتجات كبيرة جداً');
}
async function initial(env,request){
  const url=new URL('/catalog.json',request.url);
  const result=await env.ASSETS.fetch(url.toString());
  if(!result.ok)throw Error('Original catalog not found');
  return result.json();
}
async function current(env,request){
  const row=await env.DB.prepare("SELECT value, version FROM shop_catalog WHERE id='live'").first();
  return row?{catalog:JSON.parse(row.value),version:String(row.version),imported:true}:{catalog:await initial(env,request),version:'initial',imported:false};
}
function mime(path){
  if(/\.png$/i.test(path))return 'image/png';
  if(/\.webp$/i.test(path))return 'image/webp';
  if(/\.gif$/i.test(path))return 'image/gif';
  return 'image/jpeg';
}
async function media(env,path){
  const result=await env.MEDIA.getWithMetadata(path,'arrayBuffer');
  if(!result.value)return failure('الصورة غير موجودة',404);
  return new Response(result.value,{headers:{'content-type':result.metadata?.type||mime(path),'cache-control':'public,max-age=3600','x-content-type-options':'nosniff'}});
}
function checkBinary(bin,ext){
  const a=new Uint8Array(bin);
  if(a.length<40||a.length>2000000)return false;
  if(ext==='png')return [137,80,78,71,13,10,26,10].every((v,i)=>a[i]===v);
  if(ext==='webp')return String.fromCharCode(...a.slice(0,4))==='RIFF' && String.fromCharCode(...a.slice(8,12))==='WEBP';
  return a[0]===255&&a[1]===216&&a[2]===255;
}
async function copyFromNetlify(env){
  const response=await fetch(SOURCE+'/api/data?action=store',{headers:{accept:'application/json'},redirect:'error'});
  if(!response.ok)throw Error('Could not read old public catalog');
  const cat=await response.json();validate(cat);
  // Copy user-uploaded pictures before committing catalog to the new database.
  const paths=new Set([...cat.products.map(p=>p.image),...cat.categories.map(c=>c.image),cat.site?.heroImage].filter(x=>uploadPath.test(x||'')));
  if(paths.size>40)throw Error('More than 40 images: import requires batching');
  for(const name of paths){
    const link=SOURCE+'/api/data?action=image&file='+encodeURIComponent(name);
    const r=await fetch(link,{redirect:'error'});
    if(!r.ok)throw Error('Could not copy image');
    const buf=await r.arrayBuffer();
    const ext=name.split('.').pop().toLowerCase();
    if(!checkBinary(buf,ext))throw Error('Unexpected image format');
    await env.MEDIA.put(name,buf,{metadata:{type:mime(name)}});
  }
  return {catalog:cat,images:paths.size};
}
async function endpoint(request,env){
  const url=new URL(request.url),action=url.searchParams.get('action')||'';
  if(!env.DB||!env.MEDIA)return failure('قاعدة البيانات أو تخزين الصور غير مربوطين',503);
  if(request.method==='GET'&&action==='status'){
    let storage='ok',imported=false;
    try{imported=(await current(env,request)).imported}catch(e){storage='error';console.error('Status storage:',e)}
    return json({configured:validConfig(env),passwordReady:String(env.ADMIN_PASSWORD||'').length>=12,sessionReady:String(env.ADMIN_SESSION_SECRET||'').length>=32,storage,imported});
  }
  if(request.method==='GET'&&action==='store')return json((await current(env,request)).catalog);
  if(request.method==='GET'&&action==='image'){
    const file=url.searchParams.get('file')||'';
    return uploadPath.test(file)?media(env,file):failure('الصورة غير موجودة',404);
  }
  if(!validConfig(env))return failure('لازم تضبط إعدادات المدير السرية على Cloudflare',503);
  let payload=null;
  if(request.method==='POST'){
    if(Number(request.headers.get('content-length')||0)>2900000)return failure('حجم الطلب كبير',413);
    try{payload=await request.json()}catch{return failure('الطلب غير صالح',400)}
  }
  if(request.method==='POST'&&action==='login'){
    if(!same(payload?.username||'',env.ADMIN_USERNAME||'admin')||!same(payload?.password||'',env.ADMIN_PASSWORD))return failure('اسم المستخدم أو كلمة المرور غير صحيحة',401);
    return json({token:await sign(env)});
  }
  if(!await authorized(request,env))return failure('يرجى تسجيل الدخول',401);
  if(request.method==='GET'&&action==='workspace')return json(await current(env,request));
  if(request.method==='POST'&&action==='upload'){
    const data=payload?.image||{},ext=data.ext;
    if(!['png','jpg','jpeg','webp'].includes(ext)||typeof data.data!=='string'||data.data.length>2800000)return failure('صيغة الصورة أو حجمها غير صحيح');
    let bin;
    try{bin=Uint8Array.from(atob(data.data),x=>x.charCodeAt(0))}catch{return failure('بيانات الصورة غير صالحة')}
    if(!checkBinary(bin.buffer,ext))return failure('الصورة أكبر من 2 ميغابايت أو نوعها غير صحيح');
    const name='uploads/'+crypto.randomUUID().replace(/-/g,'').slice(0,24)+'.'+ext;
    await env.MEDIA.put(name,bin.buffer,{metadata:{type:mime(name)}});
    return json({image:name});
  }
  if(request.method==='POST'&&action==='import'){
    const exists=await env.DB.prepare("SELECT version FROM shop_catalog WHERE id='live'").first();
    if(exists)return failure('تم الاستيراد من قبل؛ لن نستبدل تعديلات المتجر',409);
    const copied=await copyFromNetlify(env);
    const result=await env.DB.prepare("INSERT OR IGNORE INTO shop_catalog(id,value,version) VALUES ('live',?,1)").bind(JSON.stringify(copied.catalog)).run();
    if(!result.meta?.changes)return failure('المتجر كان قد استُورد بالفعل',409);
    return json({success:true,products:copied.catalog.products.length,images:copied.images});
  }
  if(request.method==='POST'&&action==='publish'){
    try{validate(payload?.catalog)}catch(e){return failure(String(e.message||'بيانات غير صالحة').slice(0,140),422)}
    const before=await current(env,request);
    if(String(before.version)!==String(payload.version))return failure('تغيرت بيانات المتجر من جهاز آخر، حدّث الصفحة ثم جرّب',409);
    // Prevent publishing stale sample catalog prior to importing live Netlify data.
    if(!before.imported)return failure('استورد منتجات المتجر الحالية أولاً قبل الحفظ',409);
    const updated=await env.DB.prepare("UPDATE shop_catalog SET value=?,version=version+1 WHERE id='live' AND version=?").bind(JSON.stringify(payload.catalog),Number(before.version)).run();
    if(!updated.meta?.changes)return failure('يوجد تعديل أحدث؛ حدّث الصفحة',409);
    return json({success:true,version:String(Number(before.version)+1)});
  }
  return failure('طلب غير معروف',404);
}
async function page(request,env){
  const path=new URL(request.url).pathname;
  // Advanced-mode Pages Worker handles all paths. Static assets remain on ASSETS.
  if(path==='/api/data')try{return await endpoint(request,env)}catch(e){console.error('Dubai Pages API:',e);return failure('تعذر تنفيذ الطلب، راجع سجلات Cloudflare',500)}
  const product=path.match(/^\/products\/([a-z][a-z0-9-]{1,64})\/?$/);
  if(product){
    try{const c=await current(env,request);if(c.catalog.products.some(x=>x.id===product[1]))return env.ASSETS.fetch(new URL('/product-template/',request.url).toString())}catch(e){console.error('Product route:',e)}
    return new Response('Not Found',{status:404});
  }
  const category=path.match(/^\/([a-z][a-z0-9-]{1,64})\/?$/);
  if(category&&!['admin','admin-v2','api','assets','products','sell','branches','category-template','product-template'].includes(category[1])){
    try{const c=await current(env,request);if(c.catalog.categories.some(x=>x.id===category[1]))return env.ASSETS.fetch(new URL('/category-template/',request.url).toString())}catch(e){console.error('Category route:',e)}
  }
  return env.ASSETS.fetch(request);
}
export default {fetch:page};